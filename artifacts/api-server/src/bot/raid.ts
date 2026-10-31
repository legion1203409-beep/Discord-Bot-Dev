/**
 * Raidul săptămânal: un titan pe care tot serverul îl bate împreună. Apare o
 * dată pe săptămână (ziua și ora din panou, ora României), are viață după
 * câți jucători au fost activi în ultima săptămână și stă deschis câteva ore.
 * Fiecare jucător lovește cu butonul din mesaj, o dată la N minute, cu
 * daunele date de statisticile lui de luptă. La final, prada se împarte după
 * contribuție: întreagă dacă titanul cade, un sfert dacă scapă.
 *
 * Setările sunt în gameplayConfig.raid (Jocul → Raid, în panou).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  type ButtonInteraction, type Client, type Message,
} from "discord.js";
import { pool } from "@workspace/db";
import { addPlayerGold, addPlayerKey, addPlayerXp, upsertPlayer } from "./db";
import { getChannel } from "./channel-config";
import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from "./gameplay-config";
import { getGameplayConfig, isGameplayPaused } from "./gameplay-store";
import { playerCombatStats } from "./survival";
import { recordPersonalActivity } from "./chest-expansions";
import { logger } from "../lib/logger";

export type RaidStatus = "open" | "won" | "lost";

export type Raid = {
  id: number; guildId: string; titan: string; maxHp: number; hp: number; startsAt: Date; endsAt: Date;
  channelId: string | null; messageId: string | null; status: RaidStatus; week: string;
};

export type RaidContribution = { discordId: string; damage: number; hits: number };

/** The titans, one per week in turn. */
export const TITANS = [
  { name: "Colosul de Cenușă", emoji: "🗿" },
  { name: "Hidra Abisului", emoji: "🐍" },
  { name: "Regina Moartă", emoji: "👑" },
  { name: "Dragonul Eclipsei", emoji: "🐉" },
  { name: "Gardianul Pângărit", emoji: "🛡️" },
] as const;

const TIME_ZONE = "Europe/Bucharest";

let tablesReady: Promise<void> | null = null;

function ensureRaidTables(): Promise<void> {
  if (tablesReady) return tablesReady;
  const ready: Promise<void> = pool.query(`
    CREATE TABLE IF NOT EXISTS guild_raids (
      id serial PRIMARY KEY, guild_id text NOT NULL, week text NOT NULL, titan text NOT NULL,
      max_hp integer NOT NULL, hp integer NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      channel_id text, message_id text, status text NOT NULL DEFAULT 'open', rewarded boolean NOT NULL DEFAULT false,
      UNIQUE (guild_id, week)
    );
    CREATE TABLE IF NOT EXISTS guild_raid_hits (
      raid_id integer NOT NULL, discord_id text NOT NULL, damage integer NOT NULL DEFAULT 0, hits integer NOT NULL DEFAULT 0,
      last_hit_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (raid_id, discord_id)
    )`).then(() => undefined).catch((error) => {
    tablesReady = null;
    throw error;
  });
  tablesReady = ready;
  return ready;
}

function settingsOf(guildId: string): GameplayConfig["raid"] {
  try {
    return getGameplayConfig(guildId).raid ?? DEFAULT_GAMEPLAY_CONFIG.raid;
  } catch {
    return DEFAULT_GAMEPLAY_CONFIG.raid;
  }
}

function raidFromRow(row: Record<string, unknown>): Raid {
  return {
    id: Number(row.id), guildId: String(row.guild_id), titan: String(row.titan), maxHp: Number(row.max_hp), hp: Number(row.hp),
    startsAt: new Date(String(row.starts_at)), endsAt: new Date(String(row.ends_at)),
    channelId: row.channel_id ? String(row.channel_id) : null, messageId: row.message_id ? String(row.message_id) : null,
    status: String(row.status) as RaidStatus, week: String(row.week),
  };
}

/* ------------------------------------------------------------------ */
/* Programul                                                           */
/* ------------------------------------------------------------------ */

/** Year, ISO week, weekday (1 = Monday) and hour of a moment in Romania's time. */
export function localParts(date: Date): { weekday: number; hour: number; isoWeek: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!) + 1;
  // ISO week of the local calendar day.
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { weekday, hour: Number(parts.hour), isoWeek: `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}` };
}

/** Whether this week's raid should be running now: past its start and not yet over. */
export function isRaidTime(now: Date, settings: Pick<GameplayConfig["raid"], "weekday" | "hour" | "durationHours">): boolean {
  const { weekday, hour } = localParts(now);
  const hoursIntoWeek = (weekday - 1) * 24 + hour;
  const start = (settings.weekday - 1) * 24 + settings.hour;
  return hoursIntoWeek >= start && hoursIntoWeek < start + settings.durationHours;
}

export function titanFor(isoWeek: string): (typeof TITANS)[number] {
  const week = Number(isoWeek.split("-W")[1] ?? 0);
  return TITANS[week % TITANS.length]!;
}

/** The titan's health: per active player, never below five players' worth. */
export function raidMaxHp(activePlayers: number, hpPerPlayer: number): number {
  return Math.max(5, activePlayers) * hpPerPlayer;
}

/** One hit's damage from the player's combat stats; a crit doubles it. */
export function raidDamage(stats: { atk: number; crit: number }, random: () => number = Math.random): { damage: number; crit: boolean } {
  const base = 40 + stats.atk * 4;
  const crit = random() * 100 < Math.min(60, Math.max(0, stats.crit));
  const spread = 0.85 + random() * 0.3;
  return { damage: Math.max(1, Math.round(base * spread * (crit ? 2 : 1))), crit };
}

/** Each participant's share of the prize: full when the titan falls, a quarter when it escapes. */
export function raidRewards(contributions: RaidContribution[], won: boolean, settings: Pick<GameplayConfig["raid"], "rewardPool">): Array<RaidContribution & { gold: number; xp: number; key: boolean }> {
  const total = contributions.reduce((sum, row) => sum + row.damage, 0);
  if (!total) return [];
  const pool = won ? settings.rewardPool : Math.round(settings.rewardPool / 4);
  const ranked = [...contributions].sort((a, b) => b.damage - a.damage);
  return ranked.map((row, index) => {
    const share = row.damage / total;
    const gold = Math.max(won ? 200 : 50, Math.round(pool * share));
    return { ...row, gold, xp: Math.round(gold / 2), key: won && index < 3 };
  });
}

function hpBar(hp: number, max: number): string {
  const filled = Math.max(0, Math.min(20, Math.ceil((hp / max) * 20)));
  return `${"🟥".repeat(filled)}${"⬛".repeat(20 - filled)}`;
}

export function buildRaidEmbed(raid: Raid, top: RaidContribution[], settings: Pick<GameplayConfig["raid"], "cooldownMinutes" | "rewardPool">): EmbedBuilder {
  const titan = TITANS.find((item) => item.name === raid.titan) ?? TITANS[0];
  const lines = top.length
    ? top.slice(0, 5).map((row, index) => `${["🥇", "🥈", "🥉"][index] ?? `**${index + 1}.**`} <@${row.discordId}> — ${row.damage.toLocaleString("ro-RO")} daune`).join("\n")
    : "Nimeni n-a lovit încă. Fii primul!";
  const status = raid.status === "won"
    ? "✅ **Titanul a căzut!** Prada s-a împărțit după contribuție."
    : raid.status === "lost"
      ? "⌛ **Titanul a scăpat.** Fiecare participant primește un sfert din pradă."
      : `Se încheie <t:${Math.floor(raid.endsAt.getTime() / 1000)}:R>. Poți lovi o dată la **${settings.cooldownMinutes}** minute.`;
  return new EmbedBuilder()
    .setColor(raid.status === "won" ? 0x3ddc84 : raid.status === "lost" ? 0x8a8f98 : 0xb3261e)
    .setTitle(`${titan.emoji} Raidul săptămânii: ${raid.titan}`)
    .setDescription(`${hpBar(raid.hp, raid.maxHp)}\n❤️ **${Math.max(0, raid.hp).toLocaleString("ro-RO")} / ${raid.maxHp.toLocaleString("ro-RO")}**\n\n${status}`)
    .addFields(
      { name: "Cei mai buni luptători", value: lines },
      { name: "Prada", value: `${settings.rewardPool.toLocaleString("ro-RO")} Oboli împărțiți după daune · 🗝️ cheie epică pentru primii trei · fiecare participare contează ca o bătălie cu un boss (serie, realizări, sezon)` },
    )
    .setFooter({ text: "Tot serverul luptă împreună. Fiecare lovitură contează." });
}

function raidRow(raid: Raid): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`raid_hit_${raid.id}`).setLabel("Lovește titanul").setEmoji("⚔️")
      .setStyle(ButtonStyle.Danger).setDisabled(raid.status !== "open"),
  );
}

/* ------------------------------------------------------------------ */
/* Baza de date                                                        */
/* ------------------------------------------------------------------ */

export async function currentRaid(guildId: string): Promise<Raid | null> {
  await ensureRaidTables();
  const { rows } = await pool.query<Record<string, unknown>>("SELECT * FROM guild_raids WHERE guild_id = $1 ORDER BY id DESC LIMIT 1", [guildId]);
  return rows[0] ? raidFromRow(rows[0]) : null;
}

export async function raidTop(raidId: number, limit = 10): Promise<RaidContribution[]> {
  const { rows } = await pool.query<{ discord_id: string; damage: number; hits: number }>(
    "SELECT discord_id, damage, hits FROM guild_raid_hits WHERE raid_id = $1 ORDER BY damage DESC LIMIT $2",
    [raidId, limit],
  );
  return rows.map((row) => ({ discordId: String(row.discord_id), damage: Number(row.damage), hits: Number(row.hits) }));
}

async function activePlayers(guildId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*) FROM player_progress WHERE guild_id = $1 AND updated_at > now() - interval '7 days'",
    [guildId],
  ).catch(() => ({ rows: [{ count: "0" }] }));
  return Number(rows[0]?.count ?? 0);
}

/** Opens this week's raid once; returns it, or null when one already exists for the week. */
export async function openRaid(client: Client, guildId: string, now = new Date()): Promise<Raid | null> {
  const settings = settingsOf(guildId);
  await ensureRaidTables();
  const { isoWeek } = localParts(now);
  const titan = titanFor(isoWeek);
  const maxHp = raidMaxHp(await activePlayers(guildId), settings.hpPerPlayer);
  const endsAt = new Date(now.getTime() + settings.durationHours * 3_600_000);
  const channelId = settings.channelId || getChannel("boss", guildId) || null;
  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO guild_raids (guild_id, week, titan, max_hp, hp, starts_at, ends_at, channel_id)
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7) ON CONFLICT (guild_id, week) DO NOTHING RETURNING *`,
    [guildId, isoWeek, titan.name, maxHp, now, endsAt, channelId],
  );
  if (!rows[0]) return null;
  const raid = raidFromRow(rows[0]);
  const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
  if (channel?.isTextBased() && "send" in channel) {
    const message = await channel.send({ content: "⚔️ **Un titan s-a ridicat din cenușă!** Tot serverul e chemat la luptă.", embeds: [buildRaidEmbed(raid, [], settings)], components: [raidRow(raid)] }).catch((error) => {
      logger.warn({ error, guildId }, "Could not post the weekly raid");
      return null;
    }) as Message | null;
    if (message) {
      await pool.query("UPDATE guild_raids SET message_id = $2 WHERE id = $1", [raid.id, message.id]);
      raid.messageId = message.id;
    }
  }
  return raid;
}

const refreshTimers = new Map<number, ReturnType<typeof setTimeout>>();

async function refreshMessage(client: Client, raidId: number): Promise<void> {
  const { rows } = await pool.query<Record<string, unknown>>("SELECT * FROM guild_raids WHERE id = $1", [raidId]);
  if (!rows[0]) return;
  const raid = raidFromRow(rows[0]);
  if (!raid.channelId || !raid.messageId) return;
  const channel = await client.channels.fetch(raid.channelId).catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) return;
  const message = await channel.messages.fetch(raid.messageId).catch(() => null);
  await message?.edit({ embeds: [buildRaidEmbed(raid, await raidTop(raid.id, 5), settingsOf(raid.guildId))], components: [raidRow(raid)] }).catch(() => undefined);
}

/** Redraws the raid message at most every 10 seconds, however many hits come in. */
function scheduleRefresh(client: Client, raidId: number): void {
  if (refreshTimers.has(raidId)) return;
  refreshTimers.set(raidId, setTimeout(() => {
    refreshTimers.delete(raidId);
    void refreshMessage(client, raidId);
  }, 10_000));
}

/** Ends a raid once (won when its health is gone, lost when time ran out) and pays everyone. */
export async function closeRaid(client: Client, raidId: number, outcome: "won" | "lost"): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE guild_raids SET status = $2, rewarded = true WHERE id = $1 AND status = 'open' AND rewarded = false",
    [raidId, outcome],
  );
  if (!rowCount) return false;
  const { rows } = await pool.query<Record<string, unknown>>("SELECT * FROM guild_raids WHERE id = $1", [raidId]);
  const raid = raidFromRow(rows[0]!);
  const settings = settingsOf(raid.guildId);
  const contributions = await raidTop(raid.id, 10_000);
  const rewards = raidRewards(contributions, outcome === "won", settings);
  for (const reward of rewards) {
    await addPlayerGold(reward.discordId, raid.guildId, reward.gold).catch(() => undefined);
    await addPlayerXp(reward.discordId, raid.guildId, reward.xp).catch(() => undefined);
    if (reward.key) await addPlayerKey(reward.discordId, raid.guildId, "epic").catch(() => undefined);
    // One raid counts as one boss battle for the streak chest, achievements and the season.
    await recordPersonalActivity(reward.discordId, raid.guildId, "bosses").catch(() => undefined);
  }
  await refreshMessage(client, raid.id);
  const channel = raid.channelId ? await client.channels.fetch(raid.channelId).catch(() => null) : null;
  if (rewards.length && channel?.isTextBased() && "send" in channel) {
    const lines = rewards.slice(0, 10).map((reward, index) => `${["🥇", "🥈", "🥉"][index] ?? `**${index + 1}.**`} <@${reward.discordId}> — ${reward.damage.toLocaleString("ro-RO")} daune · ${reward.gold.toLocaleString("ro-RO")} Oboli${reward.key ? " · 🗝️" : ""}`);
    await channel.send({
      content: outcome === "won" ? `🏆 **${raid.titan} a căzut!** ${rewards.length} luptători și-au împărțit prada.` : `⌛ **${raid.titan} a scăpat.** ${rewards.length} luptători primesc un sfert din pradă.`,
      embeds: [new EmbedBuilder().setColor(outcome === "won" ? 0x3ddc84 : 0x8a8f98).setDescription(lines.join("\n"))],
      allowedMentions: { users: rewards.slice(0, 10).map((reward) => reward.discordId) },
    }).catch(() => undefined);
  }
  return true;
}

export type HitResult =
  | { ok: true; damage: number; crit: boolean; hp: number; maxHp: number; killed: boolean; totalDamage: number }
  | { ok: false; reason: "closed" | "cooldown"; retryAt?: Date };

/** One hit: checks the cooldown, takes the health (never below zero) and records the damage, in one transaction. */
export async function hitRaid(raidId: number, discordId: string, damage: number, cooldownMinutes: number, now = new Date()): Promise<HitResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const raidRows = await client.query<Record<string, unknown>>("SELECT * FROM guild_raids WHERE id = $1 FOR UPDATE", [raidId]);
    const raid = raidRows.rows[0] ? raidFromRow(raidRows.rows[0]) : null;
    if (!raid || raid.status !== "open" || raid.hp <= 0 || raid.endsAt <= now) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "closed" };
    }
    const last = await client.query<{ last_hit_at: string; hits: number }>(
      "SELECT last_hit_at, hits FROM guild_raid_hits WHERE raid_id = $1 AND discord_id = $2 FOR UPDATE",
      [raidId, discordId],
    );
    const lastAt = last.rows[0] && Number(last.rows[0].hits) > 0 ? new Date(last.rows[0].last_hit_at) : null;
    if (lastAt && now.getTime() - lastAt.getTime() < cooldownMinutes * 60_000) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "cooldown", retryAt: new Date(lastAt.getTime() + cooldownMinutes * 60_000) };
    }
    const dealt = Math.min(damage, raid.hp);
    const hp = raid.hp - dealt;
    await client.query("UPDATE guild_raids SET hp = $2 WHERE id = $1", [raidId, hp]);
    const mine = await client.query<{ damage: number }>(
      `INSERT INTO guild_raid_hits (raid_id, discord_id, damage, hits, last_hit_at) VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (raid_id, discord_id) DO UPDATE SET damage = guild_raid_hits.damage + EXCLUDED.damage, hits = guild_raid_hits.hits + 1, last_hit_at = EXCLUDED.last_hit_at
       RETURNING damage`,
      [raidId, discordId, dealt, now],
    );
    await client.query("COMMIT");
    return { ok: true, damage: dealt, crit: false, hp, maxHp: raid.maxHp, killed: hp <= 0, totalDamage: Number(mine.rows[0]?.damage ?? dealt) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function handleRaidButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = interaction.customId.match(/^raid_hit_(\d+)$/);
  if (!match || !interaction.guildId) return false;
  const guildId = interaction.guildId;
  const settings = settingsOf(guildId);
  if (isGameplayPaused(guildId) || !settings.enabled) {
    await interaction.reply({ content: "⏸️ Raidul e oprit acum.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const player = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const roll = raidDamage(playerCombatStats(player));
  const result = await hitRaid(Number(match[1]), interaction.user.id, roll.damage, settings.cooldownMinutes);
  if (!result.ok) {
    await interaction.editReply(result.reason === "cooldown" && result.retryAt
      ? `⏳ Îți tragi sufletul. Poți lovi din nou <t:${Math.floor(result.retryAt.getTime() / 1000)}:R>.`
      : "⌛ Raidul s-a încheiat.");
    return true;
  }
  await interaction.editReply(
    `${roll.crit ? "💥 **Lovitură critică!**" : "⚔️"} Ai dat **${result.damage.toLocaleString("ro-RO")}** daune titanului ` +
    `(în total **${result.totalDamage.toLocaleString("ro-RO")}**). Mai are **${result.hp.toLocaleString("ro-RO")}** viață.` +
    (result.killed ? "\n🏆 **Ai dat lovitura de grație!** Titanul a căzut." : `\nPoți lovi din nou peste ${settings.cooldownMinutes} minute.`),
  );
  if (result.killed) await closeRaid(interaction.client, Number(match[1]), "won");
  else scheduleRefresh(interaction.client, Number(match[1]));
  return true;
}

/** The /raid reply: this week's titan and your part in it. */
export async function raidStatusEmbed(guildId: string, discordId: string): Promise<{ embed: EmbedBuilder; mine: RaidContribution | null } | null> {
  const raid = await currentRaid(guildId);
  if (!raid) return null;
  const top = await raidTop(raid.id, 5);
  const { rows } = await pool.query<{ damage: number; hits: number }>("SELECT damage, hits FROM guild_raid_hits WHERE raid_id = $1 AND discord_id = $2", [raid.id, discordId]);
  return { embed: buildRaidEmbed(raid, top, settingsOf(guildId)), mine: rows[0] ? { discordId, damage: Number(rows[0].damage), hits: Number(rows[0].hits) } : null };
}

let watcher: ReturnType<typeof setInterval> | null = null;

/** Every minute: opens the week's raid when its time comes and closes the ones whose time ran out. */
export function startRaidWatcher(client: Client): void {
  if (watcher) return;
  const tick = async () => {
    const now = new Date();
    await ensureRaidTables().catch(() => undefined);
    for (const guildId of client.guilds.cache.keys()) {
      try {
        const settings = settingsOf(guildId);
        const raid = await currentRaid(guildId);
        if (raid?.status === "open" && raid.endsAt <= now) await closeRaid(client, raid.id, raid.hp <= 0 ? "won" : "lost");
        if (!settings.enabled || isGameplayPaused(guildId) || !isRaidTime(now, settings)) continue;
        if (raid?.week !== localParts(now).isoWeek) await openRaid(client, guildId, now);
      } catch (error) {
        logger.warn({ error, guildId }, "Raid watcher failed");
      }
    }
  };
  watcher = setInterval(() => void tick(), 60_000);
  watcher.unref?.();
}
