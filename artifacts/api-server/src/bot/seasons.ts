/**
 * Sezoanele: un clasament care pornește de la zero în fiecare lună (UTC).
 * Punctele de sezon vin din aceleași fapte ca realizările (bot/progress.ts):
 * monștri, boși, misiuni, chei și cufărul zilnic. La sfârșitul lunii primii
 * trei primesc Oboli, un titlu de onoare și, dacă e ales, un rol; rezultatul
 * se anunță în canalul ales (sau în Top Ora Umbrelor).
 *
 * Setările sunt în gameplayConfig.seasons (Jocul → Sezoane, în panou).
 */
import { EmbedBuilder, type Client, type Guild } from "discord.js";
import { pool } from "@workspace/db";
import { addPlayerGold, setHonorTitle } from "./db";
import { getChannel } from "./channel-config";
import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from "./gameplay-config";
import { getGameplayConfig, isGameplayPaused } from "./gameplay-store";
import { logger } from "../lib/logger";
import type { ProgressCounter } from "./progress";

/** Season points for each deed; messages give none, so chatting cannot buy a season. */
export const SEASON_POINTS: Record<ProgressCounter, number> = { kills: 1, bosses: 5, quests: 3, keys: 2, chests: 3, messages: 0 };

const MONTHS = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];

/** "2026-10" for a date, in UTC. */
export function seasonKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function previousSeasonKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return month === 0 ? `${year - 1}-12` : `${year}-${String(month).padStart(2, "0")}`;
}

/** The season's name; October and December keep the flavour of the seasonal themes. */
export function seasonName(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  if (month === 10) return `Sezonul Dovlecilor de Cenușă ${year}`;
  if (month === 12) return `Sezonul Zăpezii de Cenușă ${year}`;
  return `Sezonul de ${MONTHS[month - 1] ?? "?"} ${year}`;
}

/** When the current season ends (the first moment of next month, UTC). */
export function seasonEndsAt(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

let tablesReady: Promise<void> | null = null;

function ensureSeasonTables(): Promise<void> {
  if (tablesReady) return tablesReady;
  const ready: Promise<void> = pool.query(`
    CREATE TABLE IF NOT EXISTS player_seasons (
      guild_id text NOT NULL, season text NOT NULL, discord_id text NOT NULL, username text NOT NULL DEFAULT '',
      points integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (guild_id, season, discord_id)
    );
    CREATE INDEX IF NOT EXISTS player_seasons_rank_idx ON player_seasons (guild_id, season, points DESC);
    CREATE TABLE IF NOT EXISTS season_results (
      guild_id text NOT NULL, season text NOT NULL, winners jsonb NOT NULL DEFAULT '[]'::jsonb,
      finalized_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (guild_id, season)
    )`).then(() => undefined).catch((error) => {
    tablesReady = null;
    throw error;
  });
  tablesReady = ready;
  return ready;
}

function settingsOf(guildId: string): GameplayConfig["seasons"] {
  try {
    return getGameplayConfig(guildId).seasons ?? DEFAULT_GAMEPLAY_CONFIG.seasons;
  } catch {
    return DEFAULT_GAMEPLAY_CONFIG.seasons;
  }
}

export async function addSeasonPoints(discordId: string, guildId: string, counter: ProgressCounter, amount = 1, now = new Date()): Promise<void> {
  const points = SEASON_POINTS[counter] * Math.max(1, Math.floor(amount));
  if (!points || !settingsOf(guildId).enabled) return;
  await ensureSeasonTables();
  await pool.query(
    `INSERT INTO player_seasons (guild_id, season, discord_id, points) VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, season, discord_id) DO UPDATE SET points = player_seasons.points + EXCLUDED.points, updated_at = now()`,
    [guildId, seasonKey(now), discordId, points],
  );
}

export type SeasonRow = { discordId: string; points: number; rank: number };

export async function seasonTop(guildId: string, season: string, limit = 10): Promise<SeasonRow[]> {
  await ensureSeasonTables();
  const { rows } = await pool.query<{ discord_id: string; points: number }>(
    "SELECT discord_id, points FROM player_seasons WHERE guild_id = $1 AND season = $2 AND points > 0 ORDER BY points DESC, updated_at ASC LIMIT $3",
    [guildId, season, limit],
  );
  return rows.map((row, index) => ({ discordId: String(row.discord_id), points: Number(row.points), rank: index + 1 }));
}

export async function seasonStanding(guildId: string, season: string, discordId: string): Promise<SeasonRow | null> {
  await ensureSeasonTables();
  const { rows } = await pool.query<{ points: number; rank: string }>(
    `SELECT points, (SELECT count(*) + 1 FROM player_seasons o WHERE o.guild_id = p.guild_id AND o.season = p.season AND o.points > p.points) AS rank
     FROM player_seasons p WHERE guild_id = $1 AND season = $2 AND discord_id = $3`,
    [guildId, season, discordId],
  );
  if (!rows[0] || Number(rows[0].points) <= 0) return null;
  return { discordId, points: Number(rows[0].points), rank: Number(rows[0].rank) };
}

const MEDALS = ["🥇", "🥈", "🥉"];
const TITLES = ["Campionul", "Vicecampionul", "Bronzul"];

/** The /sezon card: the top ten, your place and when the season ends. */
export function buildSeasonEmbed(season: string, top: SeasonRow[], mine: SeasonRow | null, settings: GameplayConfig["seasons"], endsAt: Date): EmbedBuilder {
  const lines = top.length
    ? top.map((row) => `${MEDALS[row.rank - 1] ?? `**${row.rank}.**`} <@${row.discordId}> — **${row.points.toLocaleString("ro-RO")}** puncte`)
    : ["Nimeni n-a adunat încă puncte în acest sezon. Fii primul!"];
  const rewards = settings.rewards.map((gold, index) => `${MEDALS[index]} ${gold.toLocaleString("ro-RO")} Oboli`).join(" · ");
  return new EmbedBuilder()
    .setColor(0xd94a2b)
    .setTitle(`🏆 ${seasonName(season)}`)
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "Locul tău", value: mine ? `**${mine.rank}** · ${mine.points.toLocaleString("ro-RO")} puncte` : "Încă nu ai puncte în acest sezon.", inline: true },
      { name: "Se încheie", value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true },
      { name: "Premii", value: rewards || "—" },
      { name: "Puncte", value: "⚔️ monstru 1 · 🐉 boss 5 · 📜 misiune 3 · 🗝️ cheie 2 · 🕯️ cufăr zilnic 3" },
    )
    .setFooter({ text: "Clasamentul pornește de la zero în prima zi a fiecărei luni." });
}

export type SeasonWinner = { discordId: string; points: number; rank: number; gold: number; title: string };

/** The rewards of a finished season, as the settings give them. */
export function seasonWinners(season: string, top: SeasonRow[], settings: GameplayConfig["seasons"]): SeasonWinner[] {
  return top.slice(0, 3).map((row) => ({
    ...row,
    gold: settings.rewards[row.rank - 1] ?? 0,
    title: `${TITLES[row.rank - 1]} ${seasonName(season).replace(/^Sezonul /, "Sezonului ")}`,
  }));
}

async function swapSeasonRoles(guild: Guild, season: string, settings: GameplayConfig["seasons"], winners: SeasonWinner[], previous: SeasonWinner[]): Promise<void> {
  for (const [index, roleId] of settings.roleIds.entries()) {
    if (!roleId) continue;
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) continue;
    for (const old of previous.filter((winner) => winner.rank === index + 1)) {
      const member = await guild.members.fetch(old.discordId).catch(() => null);
      if (member?.roles.cache.has(roleId)) await member.roles.remove(roleId, "Sezonul s-a încheiat").catch(() => undefined);
    }
    const winner = winners.find((item) => item.rank === index + 1);
    const member = winner ? await guild.members.fetch(winner.discordId).catch(() => null) : null;
    if (member) await member.roles.add(roleId, `Locul ${index + 1} în ${seasonName(season)}`.slice(0, 200)).catch((error) => {
      logger.warn({ error, guildId: guild.id, roleId }, "Could not give the season role");
    });
  }
}

/**
 * Closes a finished season once: pays the top three, gives titles and roles and
 * announces the result. Safe to call again; the season_results row decides.
 */
export async function finalizeSeason(client: Client, guildId: string, season: string): Promise<SeasonWinner[] | null> {
  const settings = settingsOf(guildId);
  if (!settings.enabled) return null;
  await ensureSeasonTables();
  const top = await seasonTop(guildId, season, 10);
  const winners = seasonWinners(season, top, settings);
  const claimed = await pool.query(
    "INSERT INTO season_results (guild_id, season, winners) VALUES ($1, $2, $3::text::jsonb) ON CONFLICT (guild_id, season) DO NOTHING RETURNING season",
    [guildId, season, JSON.stringify(winners)],
  );
  if (!claimed.rowCount) return null;
  for (const winner of winners) {
    if (winner.gold > 0) await addPlayerGold(winner.discordId, guildId, winner.gold).catch(() => undefined);
    await setHonorTitle(winner.discordId, guildId, winner.title).catch(() => undefined);
  }
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    const { rows } = await pool.query<{ winners: SeasonWinner[] }>(
      "SELECT winners FROM season_results WHERE guild_id = $1 AND season < $2 ORDER BY season DESC LIMIT 1",
      [guildId, season],
    );
    await swapSeasonRoles(guild, season, settings, winners, rows[0]?.winners ?? []).catch(() => undefined);
    const channelId = settings.channelId || getChannel("eventTop", guildId);
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    // An empty season (e.g. the month before the feature existed) closes silently.
    if (winners.length && channel?.isTextBased() && "send" in channel) {
      const embed = new EmbedBuilder()
        .setColor(0xffc46e)
        .setTitle(`🏆 ${seasonName(season)} s-a încheiat!`)
        .setDescription(winners.map((winner) => `${MEDALS[winner.rank - 1]} <@${winner.discordId}> — **${winner.points.toLocaleString("ro-RO")}** puncte · ${winner.gold.toLocaleString("ro-RO")} Oboli · titlul **${winner.title}**`).join("\n"))
        .setFooter({ text: `${seasonName(seasonKey())} a început. Toată lumea pornește de la zero.` });
      await channel.send({ embeds: [embed], allowedMentions: { users: winners.map((winner) => winner.discordId) } }).catch((error) => {
        logger.warn({ error, guildId }, "Could not announce the season result");
      });
    }
  }
  return winners;
}

let watcher: ReturnType<typeof setInterval> | null = null;

/** Every half hour, closes last month's season on every server where the game runs. */
export function startSeasonWatcher(client: Client): void {
  if (watcher) return;
  const tick = async () => {
    const season = previousSeasonKey();
    for (const guildId of client.guilds.cache.keys()) {
      if (isGameplayPaused(guildId) || !settingsOf(guildId).enabled) continue;
      await finalizeSeason(client, guildId, season).catch((error) => logger.warn({ error, guildId, season }, "Season finalization failed"));
    }
  };
  watcher = setInterval(() => void tick(), 30 * 60_000);
  watcher.unref?.();
  setTimeout(() => void tick(), 60_000).unref?.();
}
