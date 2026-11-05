/**
 * Topul invitațiilor: cine a adus cei mai mulți membri noi pe server prin
 * invitațiile lui, într-o perioadă. Cifrele vin din urmărirea invitațiilor
 * (discord_invite_daily + discord_invite_links), deci numără doar intrările pe
 * care botul le-a putut lega de o invitație.
 *
 * Apare în trei locuri: comanda /topinvitatii, raportul de statistici și
 * (prin aceleași rânduri) oriunde mai e nevoie de el.
 */
import { EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

export type InviteTopRow = { inviterId: string | null; inviterName: string | null; joins: number };
export type InviteTopData = { rows: InviteTopRow[]; attributed: number; unknown: number };

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * The inviters with the most attributed joins between two days (inclusive; startDay null = since the beginning).
 * Null when invite tracking has never run on this server (its tables do not exist yet).
 */
export async function getTopInviters(guildId: string, startDay: string | null, endDay: string, limit = 10): Promise<InviteTopData | null> {
  try {
    const [rows, totals] = await Promise.all([
      pool.query<{ inviter_id: string | null; inviter_name: string | null; joins: number }>(
        `SELECT NULLIF(i.inviter_id, '') AS inviter_id,
                (array_agg(i.inviter_name ORDER BY i.last_synced_at DESC NULLS LAST))[1] AS inviter_name,
                SUM(d.join_count)::int AS joins
           FROM discord_invite_daily d
           JOIN discord_invite_links i ON i.guild_id = d.guild_id AND i.invite_code = d.invite_code
          WHERE d.guild_id = $1 AND d.invite_code <> ''
            AND ($2::text IS NULL OR d.day >= $2) AND d.day <= $3
          GROUP BY COALESCE(NULLIF(i.inviter_id, ''), 'nume:' || COALESCE(i.inviter_name, '')), NULLIF(i.inviter_id, '')
         HAVING SUM(d.join_count) > 0
          ORDER BY joins DESC, inviter_name ASC NULLS LAST
          LIMIT $4`,
        [guildId, startDay, endDay, Math.max(1, Math.min(25, limit))],
      ),
      pool.query<{ attributed: number; unknown: number }>(
        `SELECT COALESCE(SUM(join_count) FILTER (WHERE invite_code <> ''), 0)::int AS attributed,
                COALESCE(SUM(join_count) FILTER (WHERE invite_code = ''), 0)::int AS unknown
           FROM discord_invite_daily
          WHERE guild_id = $1 AND ($2::text IS NULL OR day >= $2) AND day <= $3`,
        [guildId, startDay, endDay],
      ),
    ]);
    return {
      rows: rows.rows.map((row) => ({ inviterId: row.inviter_id, inviterName: row.inviter_name, joins: Number(row.joins) })),
      attributed: Number(totals.rows[0]?.attributed ?? 0),
      unknown: Number(totals.rows[0]?.unknown ?? 0),
    };
  } catch (error) {
    // 42P01: the invite tables were never created, i.e. invite tracking was never on.
    if ((error as { code?: string })?.code !== "42P01") logger.warn({ error, guildId }, "Could not read the invite leaderboard");
    return null;
  }
}

function plainName(value: string | null): string {
  return (value ?? "necunoscut").replace(/@/g, "@​").replace(/[`*_~|>\r\n]/g, "").trim().slice(0, 40) || "necunoscut";
}

function members(count: number): string {
  return count === 1 ? "**1** membru nou" : `**${count.toLocaleString("ro-RO")}** membri noi`;
}

/** "🥇 <@id> · 5 membri noi", one line per inviter. */
export function inviteTopLines(rows: InviteTopRow[], limit = rows.length): string[] {
  return rows.slice(0, limit).map((row, index) => {
    const place = MEDALS[index] ?? `**${index + 1}.**`;
    const who = row.inviterId && /^\d{5,25}$/.test(row.inviterId) ? `<@${row.inviterId}>` : `**${plainName(row.inviterName)}**`;
    return `${place} ${who} · ${members(row.joins)}`;
  });
}

export const INVITE_TOP_PERIODS = [
  { value: "1", label: "azi", days: 1 },
  { value: "7", label: "ultimele 7 zile", days: 7 },
  { value: "30", label: "ultimele 30 de zile", days: 30 },
  { value: "all", label: "de la început", days: null },
] as const;

export function buildInviteTopEmbed(input: {
  guildName: string; guildIconUrl?: string | null; periodLabel: string; data: InviteTopData; viewerId?: string; color?: number;
}): EmbedBuilder {
  const { data } = input;
  const lines = inviteTopLines(data.rows, 10);
  const embed = new EmbedBuilder()
    .setColor(input.color ?? 0x36a878)
    .setAuthor({ name: `Invitații · ${input.guildName.slice(0, 100)}`, ...(input.guildIconUrl ? { iconURL: input.guildIconUrl } : {}) })
    .setTitle("🎟️ Topul invitațiilor")
    .setDescription(lines.length
      ? lines.join("\n")
      : "Nimeni n-a adus încă membri noi prin invitații în perioada asta. Fii primul: `/invita`.")
    .addFields(
      { name: "📅 Perioada", value: input.periodLabel, inline: true },
      { name: "🟢 Prin invitații", value: data.attributed.toLocaleString("ro-RO"), inline: true },
      { name: "❔ Fără invitație știută", value: data.unknown.toLocaleString("ro-RO"), inline: true },
    )
    .setFooter({ text: "Se numără doar intrările pe care botul le-a putut lega de o invitație." })
    .setTimestamp();
  if (input.viewerId) {
    const place = data.rows.findIndex((row) => row.inviterId === input.viewerId);
    embed.addFields({
      name: "📍 Tu",
      value: place >= 0 ? `Locul **${place + 1}** · ${members(data.rows[place]!.joins)}` : "Nu ești în top în perioada asta.",
    });
  }
  return embed;
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** /topinvitatii [perioada]; `today` is the stats day in the server's time zone (daily-stats statsDay). */
export async function handleInviteTopCommand(interaction: ChatInputCommandInteraction, today: string): Promise<boolean> {
  if (interaction.commandName !== "topinvitatii") return false;
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "Topul invitațiilor se vede doar pe un server.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply();
  const choice = INVITE_TOP_PERIODS.find((period) => period.value === (interaction.options.getString("perioada") ?? "7")) ?? INVITE_TOP_PERIODS[1];
  const startDay = choice.days === null ? null : shiftDay(today, -(choice.days - 1));
  // More rows than shown, so the viewer can find their own place past the top 10.
  const data = await getTopInviters(interaction.guildId!, startDay, today, 25);
  if (!data) {
    await interaction.editReply("🎟️ Urmărirea invitațiilor nu e pornită pe acest server, deci nu există încă un top. Se pornește din panou, la Control bot → Invitații.");
    return true;
  }
  await interaction.editReply({
    embeds: [buildInviteTopEmbed({
      guildName: interaction.guild.name, guildIconUrl: interaction.guild.iconURL(), periodLabel: choice.label, data, viewerId: interaction.user.id,
    })],
    allowedMentions: { parse: [] },
  });
  return true;
}
