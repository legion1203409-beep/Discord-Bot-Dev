/**
 * Topul membrilor activi: cine a scris cele mai multe mesaje și cine a stat cel
 * mai mult pe voce, într-o perioadă. E separat de statisticile zilnice: are
 * canalul lui, intervalul lui (1–7 zile) și comanda /topactivi.
 *
 * Datele: discord_daily_users.message_count (mesaje pe membru și zi) și
 * discord_daily_voice (minute pe voce, numărate o dată pe minut, cu aceeași
 * regulă ca XP-ul: nu în AFK și nu singur pe canal). Se numără de la
 * instalarea acestei versiuni; zilele de dinainte nu au cifre pe membru.
 */
import { EmbedBuilder, MessageFlags, TextChannel, type ChatInputCommandInteraction, type Client, type Guild } from "discord.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { ensureDailyStatsTables, formatStatsPeriod, isReportEndDay, previousDay, shiftStatsDay, statsDay } from "./daily-stats";
import { loadActiveTopSettings, saveActiveTopSettings } from "./db";

export type ActiveTopConfig = {
  enabled: boolean;
  channelId: string;
  /** One report every this many days (1–7), for those days. */
  intervalDays: number;
  /** How many members each list shows (3–15). */
  limit: number;
  /** Also rank the time in voice. */
  includeVoice: boolean;
  /** Mention the members in the report (a ping); off by default. */
  mention: boolean;
  color: string;
};

export const DEFAULT_ACTIVE_TOP_CONFIG: ActiveTopConfig = {
  enabled: false, channelId: "", intervalDays: 7, limit: 10, includeVoice: true, mention: false, color: "#d8a964",
};

export function normalizeActiveTopConfig(value: unknown): ActiveTopConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const integer = (input: unknown, fallback: number, min: number, max: number) =>
    typeof input === "number" && Number.isInteger(input) && input >= min && input <= max ? input : fallback;
  return {
    enabled: raw.enabled === true,
    channelId: typeof raw.channelId === "string" && /^\d{5,25}$/.test(raw.channelId) ? raw.channelId : "",
    intervalDays: integer(raw.intervalDays, DEFAULT_ACTIVE_TOP_CONFIG.intervalDays, 1, 7),
    limit: integer(raw.limit, DEFAULT_ACTIVE_TOP_CONFIG.limit, 3, 15),
    includeVoice: raw.includeVoice !== false,
    mention: raw.mention === true,
    color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_ACTIVE_TOP_CONFIG.color,
  };
}

export async function loadActiveTopConfig(guildId: string): Promise<ActiveTopConfig> {
  return normalizeActiveTopConfig(await loadActiveTopSettings(guildId));
}

export async function saveActiveTopConfig(guildId: string, value: unknown): Promise<ActiveTopConfig> {
  const config = normalizeActiveTopConfig(value);
  await saveActiveTopSettings(guildId, config);
  return config;
}

export type ActiveTopData = {
  chat: Array<{ userId: string; messages: number }>;
  voice: Array<{ userId: string; minutes: number }>;
  totals: { messages: number; writers: number; voiceMinutes: number; talkers: number };
};

/** The most active members between two days (inclusive; startDay null = since the beginning). */
export async function getActiveTop(guildId: string, startDay: string | null, endDay: string, limit = 10): Promise<ActiveTopData> {
  await ensureDailyStatsTables();
  const size = Math.max(1, Math.min(25, limit));
  const [chat, voice, chatTotals, voiceTotals] = await Promise.all([
    pool.query<{ user_id: string; messages: number }>(
      `SELECT user_id, SUM(message_count)::int AS messages FROM discord_daily_users
        WHERE guild_id = $1 AND ($2::text IS NULL OR day >= $2) AND day <= $3
        GROUP BY user_id HAVING SUM(message_count) > 0
        ORDER BY messages DESC, user_id ASC LIMIT $4`,
      [guildId, startDay, endDay, size],
    ),
    pool.query<{ user_id: string; minutes: number }>(
      `SELECT user_id, SUM(minutes)::int AS minutes FROM discord_daily_voice
        WHERE guild_id = $1 AND ($2::text IS NULL OR day >= $2) AND day <= $3
        GROUP BY user_id HAVING SUM(minutes) > 0
        ORDER BY minutes DESC, user_id ASC LIMIT $4`,
      [guildId, startDay, endDay, size],
    ),
    pool.query<{ messages: number; members: number }>(
      `SELECT COALESCE(SUM(message_count), 0)::int AS messages, COUNT(DISTINCT user_id) FILTER (WHERE message_count > 0)::int AS members
         FROM discord_daily_users WHERE guild_id = $1 AND ($2::text IS NULL OR day >= $2) AND day <= $3`,
      [guildId, startDay, endDay],
    ),
    pool.query<{ minutes: number; members: number }>(
      `SELECT COALESCE(SUM(minutes), 0)::int AS minutes, COUNT(DISTINCT user_id)::int AS members
         FROM discord_daily_voice WHERE guild_id = $1 AND ($2::text IS NULL OR day >= $2) AND day <= $3`,
      [guildId, startDay, endDay],
    ),
  ]);
  return {
    chat: chat.rows.map((row) => ({ userId: row.user_id, messages: Number(row.messages) })),
    voice: voice.rows.map((row) => ({ userId: row.user_id, minutes: Number(row.minutes) })),
    totals: {
      messages: Number(chatTotals.rows[0]?.messages ?? 0), writers: Number(chatTotals.rows[0]?.members ?? 0),
      voiceMinutes: Number(voiceTotals.rows[0]?.minutes ?? 0), talkers: Number(voiceTotals.rows[0]?.members ?? 0),
    },
  };
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function voiceTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function place(index: number): string {
  return MEDALS[index] ?? `**${index + 1}.**`;
}

export function activeTopLines(data: ActiveTopData, limit: number): { chat: string[]; voice: string[] } {
  return {
    chat: data.chat.slice(0, limit).map((row, index) => `${place(index)} <@${row.userId}> · **${row.messages.toLocaleString("ro-RO")}** ${row.messages === 1 ? "mesaj" : "mesaje"}`),
    voice: data.voice.slice(0, limit).map((row, index) => `${place(index)} <@${row.userId}> · **${voiceTime(row.minutes)}**`),
  };
}

export function buildActiveTopEmbed(input: {
  guildName: string; guildIconUrl?: string | null; periodLabel: string; data: ActiveTopData; config: ActiveTopConfig;
  winnerAvatarUrl?: string | null; viewerId?: string;
}): EmbedBuilder {
  const { data, config } = input;
  const lines = activeTopLines(data, config.limit);
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.color.slice(1), 16))
    .setAuthor({ name: `Comunitate · ${input.guildName.slice(0, 100)}`, ...(input.guildIconUrl ? { iconURL: input.guildIconUrl } : {}) })
    .setTitle("🏆 Cei mai activi membri")
    .setDescription(`Perioada: **${input.periodLabel}**`)
    .addFields({
      name: "💬 În chat",
      value: (lines.chat.length ? lines.chat.join("\n") : "Încă nimeni n-a scris în perioada asta.").slice(0, 1_024),
      inline: config.includeVoice,
    });
  if (config.includeVoice) {
    embed.addFields({
      name: "🎙️ Pe voce",
      value: (lines.voice.length ? lines.voice.join("\n") : "Nimeni n-a stat pe voce (cu cel puțin încă un om) în perioada asta.").slice(0, 1_024),
      inline: true,
    });
  }
  embed.addFields({
    name: "📊 Pe scurt",
    value: [
      `**${data.totals.messages.toLocaleString("ro-RO")}** mesaje de la **${data.totals.writers.toLocaleString("ro-RO")}** membri`,
      config.includeVoice ? `**${voiceTime(data.totals.voiceMinutes)}** pe voce, **${data.totals.talkers.toLocaleString("ro-RO")}** membri` : null,
    ].filter(Boolean).join("\n"),
  });
  if (input.viewerId) {
    const chatPlace = data.chat.findIndex((row) => row.userId === input.viewerId);
    const voicePlace = data.voice.findIndex((row) => row.userId === input.viewerId);
    embed.addFields({
      name: "📍 Tu",
      value: [
        chatPlace >= 0 ? `Chat: locul **${chatPlace + 1}**` : "Chat: nu ești în top",
        config.includeVoice ? (voicePlace >= 0 ? `Voce: locul **${voicePlace + 1}**` : "Voce: nu ești în top") : null,
      ].filter(Boolean).join(" · "),
    });
  }
  if (input.winnerAvatarUrl) embed.setThumbnail(input.winnerAvatarUrl);
  embed.setFooter({ text: "🏆 Topul activității · botul numără mesajele și minutele pe voce" }).setTimestamp();
  return embed;
}

/* ------------------------------------------------------------------ */
/* Raportul programat                                                   */
/* ------------------------------------------------------------------ */

let tablesReady: Promise<void> | null = null;
function ensureReportTable(): Promise<void> {
  tablesReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS discord_active_top_reports (
      guild_id text NOT NULL,
      end_day text NOT NULL,
      message_id text,
      claimed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (guild_id, end_day)
    )`).then(() => undefined).catch((error) => {
    tablesReady = null;
    throw error;
  });
  return tablesReady;
}

async function claimReport(guildId: string, endDay: string): Promise<boolean> {
  // A claim older than 10 minutes without a message is a failed attempt and may be taken again.
  const result = await pool.query(
    `INSERT INTO discord_active_top_reports (guild_id, end_day) VALUES ($1, $2)
     ON CONFLICT (guild_id, end_day) DO UPDATE SET claimed_at = now()
       WHERE discord_active_top_reports.message_id IS NULL AND discord_active_top_reports.claimed_at < now() - interval '10 minutes'
     RETURNING guild_id`,
    [guildId, endDay],
  );
  return (result.rowCount ?? result.rows.length) > 0;
}

function memberAvatar(guild: Guild, userId: string | undefined): string | null {
  if (!userId) return null;
  const member = guild.members?.cache?.get(userId);
  return member?.displayAvatarURL?.() ?? guild.client?.users?.cache?.get(userId)?.displayAvatarURL?.() ?? null;
}

/** Posts the report of the period that ended on `endDay`, once. */
export async function publishActiveTopReport(client: Client, guildId: string, endDay: string): Promise<boolean> {
  const config = await loadActiveTopConfig(guildId);
  if (!config.enabled || !config.channelId || !isReportEndDay(endDay, config.intervalDays)) return false;
  await ensureReportTable();
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;
  if (!await claimReport(guildId, endDay)) return false;
  try {
    const channel = await client.channels.fetch(config.channelId).catch(() => null);
    if (!(channel instanceof TextChannel) || channel.guildId !== guildId) throw new Error("Canalul topului nu e un canal text al serverului.");
    const startDay = shiftStatsDay(endDay, -(config.intervalDays - 1));
    const data = await getActiveTop(guildId, startDay, endDay, config.limit);
    const embed = buildActiveTopEmbed({
      guildName: guild.name, guildIconUrl: guild.iconURL?.() ?? null, config, data,
      periodLabel: config.intervalDays === 1 ? formatStatsPeriod(endDay, endDay) : formatStatsPeriod(startDay, endDay),
      winnerAvatarUrl: memberAvatar(guild, data.chat[0]?.userId),
    });
    const message = await channel.send({
      embeds: [embed],
      allowedMentions: config.mention ? { users: [...new Set([...data.chat, ...data.voice].map((row) => row.userId))].slice(0, 30) } : { parse: [] },
    });
    await pool.query(`UPDATE discord_active_top_reports SET message_id = $3 WHERE guild_id = $1 AND end_day = $2`, [guildId, endDay, message.id]);
    logger.info({ guildId, endDay, messageId: message.id }, "Published the top of the most active members");
    return true;
  } catch (error) {
    await pool.query(`DELETE FROM discord_active_top_reports WHERE guild_id = $1 AND end_day = $2 AND message_id IS NULL`, [guildId, endDay]).catch(() => undefined);
    logger.warn({ error, guildId, endDay }, "Could not post the top of the most active members");
    return false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Once a minute: after midnight, every server whose period ended yesterday gets its report. */
export function startActiveTopScheduler(client: Client): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!client.isReady()) return;
    const endDay = previousDay(statsDay());
    for (const guildId of client.guilds.cache.keys()) {
      void publishActiveTopReport(client, guildId, endDay).catch((error) => logger.warn({ error, guildId }, "Active top check failed"));
    }
  }, 60_000);
  timer.unref?.();
}

/* ------------------------------------------------------------------ */
/* /topactivi                                                           */
/* ------------------------------------------------------------------ */

export const ACTIVE_TOP_PERIODS = [
  { value: "1", label: "azi", days: 1 },
  { value: "7", label: "ultimele 7 zile", days: 7 },
  { value: "30", label: "ultimele 30 de zile", days: 30 },
  { value: "all", label: "de la început", days: null },
] as const;

export async function handleActiveTopCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "topactivi") return false;
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "Topul se vede doar pe un server.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply();
  const choice = ACTIVE_TOP_PERIODS.find((period) => period.value === (interaction.options.getString("perioada") ?? "7")) ?? ACTIVE_TOP_PERIODS[1];
  const today = statsDay();
  const startDay = choice.days === null ? null : shiftStatsDay(today, -(choice.days - 1));
  const config = await loadActiveTopConfig(interaction.guildId!);
  // More rows than shown, so the person asking can find their own place.
  const data = await getActiveTop(interaction.guildId!, startDay, today, 25);
  await interaction.editReply({
    embeds: [buildActiveTopEmbed({
      guildName: interaction.guild.name, guildIconUrl: interaction.guild.iconURL(), periodLabel: choice.label,
      data, config: { ...config, limit: 10 }, viewerId: interaction.user.id,
      winnerAvatarUrl: memberAvatar(interaction.guild, data.chat[0]?.userId),
    })],
    allowedMentions: { parse: [] },
  });
  return true;
}
