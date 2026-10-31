/**
 * Progresul pe termen lung al unui jucător: seria zilnică (zile la rând cu
 * Cufărul Vegherii deschis) și realizările (insigne pentru fapte adunate în
 * timp). Totul stă în player_progress, câte un rând pe jucător și server.
 *
 * Contoarele cresc din recordPersonalActivity (chest-expansions.ts), deci
 * orice faptă care umple cufărul zilnic (monștri, boși, misiuni, chei, mesaje)
 * umple și realizările. Seria avansează la deschiderea cufărului.
 * Setările (pornit/oprit, bonusul pe zi, recompensele) sunt în
 * gameplayConfig.progress, în panou la Jocul → Serii și realizări.
 */
import { EmbedBuilder } from "discord.js";
import { pool } from "@workspace/db";
import { addPlayerGold, addPlayerKey, type KeyType } from "./db";
import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from "./gameplay-config";
import { getGameplayConfig } from "./gameplay-store";
import { logger } from "../lib/logger";

export type ProgressCounter = "kills" | "bosses" | "quests" | "keys" | "messages" | "chests";

export type Achievement = {
  key: string;
  emoji: string;
  name: string;
  description: string;
  counter: ProgressCounter | "streak";
  target: number;
  reward: number;
};

/** In the order they are shown; a counter's steps go from easy to hard. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { key: "kills_100", emoji: "⚔️", name: "Prima Vânătoare", description: "Răpune 100 de monștri.", counter: "kills", target: 100, reward: 300 },
  { key: "kills_1000", emoji: "🗡️", name: "Secerătorul", description: "Răpune 1.000 de monștri.", counter: "kills", target: 1_000, reward: 1_500 },
  { key: "kills_10000", emoji: "💀", name: "Flagelul Umbrelor", description: "Răpune 10.000 de monștri.", counter: "kills", target: 10_000, reward: 8_000 },
  { key: "bosses_10", emoji: "🐉", name: "Vânător de Dragoni", description: "Luptă în 10 bătălii cu boși.", counter: "bosses", target: 10, reward: 500 },
  { key: "bosses_100", emoji: "🔥", name: "Ucigașul de Titani", description: "Luptă în 100 de bătălii cu boși.", counter: "bosses", target: 100, reward: 4_000 },
  { key: "quests_10", emoji: "📜", name: "Ucenicul Misiunilor", description: "Termină 10 misiuni zilnice.", counter: "quests", target: 10, reward: 400 },
  { key: "quests_100", emoji: "📚", name: "Cronicarul Regatului", description: "Termină 100 de misiuni zilnice.", counter: "quests", target: 100, reward: 3_000 },
  { key: "keys_25", emoji: "🗝️", name: "Purtătorul de Chei", description: "Strânge 25 de chei.", counter: "keys", target: 25, reward: 600 },
  { key: "keys_250", emoji: "🔐", name: "Paznicul Porților", description: "Strânge 250 de chei.", counter: "keys", target: 250, reward: 5_000 },
  { key: "messages_500", emoji: "💬", name: "Glasul Cetății", description: "Scrie 500 de mesaje pe server.", counter: "messages", target: 500, reward: 300 },
  { key: "messages_5000", emoji: "📯", name: "Vestitorul", description: "Scrie 5.000 de mesaje pe server.", counter: "messages", target: 5_000, reward: 2_000 },
  { key: "chests_7", emoji: "🕯️", name: "Veghetorul", description: "Deschide de 7 ori Cufărul Vegherii.", counter: "chests", target: 7, reward: 400 },
  { key: "chests_30", emoji: "🏮", name: "Flacăra Neclintită", description: "Deschide de 30 de ori Cufărul Vegherii.", counter: "chests", target: 30, reward: 2_500 },
  { key: "streak_7", emoji: "🔥", name: "O Săptămână de Foc", description: "Ajungi la o serie de 7 zile.", counter: "streak", target: 7, reward: 800 },
  { key: "streak_30", emoji: "☄️", name: "Neînfrânt", description: "Ajungi la o serie de 30 de zile.", counter: "streak", target: 30, reward: 6_000 },
];

export type PlayerProgress = {
  streak: number;
  bestStreak: number;
  lastDay: string | null;
  counters: Record<ProgressCounter, number>;
  /** Achievement key → ISO date it was unlocked. */
  achievements: Record<string, string>;
  /** Unlocked since the player last looked; shown once on the next profile, /realizari or chest. */
  unseen: string[];
};

const EMPTY_COUNTERS: Record<ProgressCounter, number> = { kills: 0, bosses: 0, quests: 0, keys: 0, messages: 0, chests: 0 };

let tableReady: Promise<void> | null = null;

export function ensureProgressTable(): Promise<void> {
  if (tableReady) return tableReady;
  const ready: Promise<void> = pool.query(`
    CREATE TABLE IF NOT EXISTS player_progress (
      guild_id text NOT NULL, discord_id text NOT NULL,
      streak integer NOT NULL DEFAULT 0, best_streak integer NOT NULL DEFAULT 0, last_day text,
      counters jsonb NOT NULL DEFAULT '{}'::jsonb, achievements jsonb NOT NULL DEFAULT '{}'::jsonb,
      unseen jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (guild_id, discord_id)
    )`).then(() => undefined).catch((error) => {
    tableReady = null;
    throw error;
  });
  tableReady = ready;
  return ready;
}

function progressFromRow(row: Record<string, unknown> | undefined): PlayerProgress {
  const counters = (row?.counters && typeof row.counters === "object" ? row.counters : {}) as Partial<Record<ProgressCounter, number>>;
  return {
    streak: Number(row?.streak ?? 0),
    bestStreak: Number(row?.best_streak ?? 0),
    lastDay: typeof row?.last_day === "string" ? row.last_day : null,
    counters: { ...EMPTY_COUNTERS, ...counters },
    achievements: (row?.achievements && typeof row.achievements === "object" ? row.achievements : {}) as Record<string, string>,
    unseen: Array.isArray(row?.unseen) ? (row!.unseen as string[]) : [],
  };
}

export async function getPlayerProgress(discordId: string, guildId: string): Promise<PlayerProgress> {
  await ensureProgressTable();
  const { rows } = await pool.query<Record<string, unknown>>("SELECT * FROM player_progress WHERE guild_id = $1 AND discord_id = $2", [guildId, discordId]);
  return progressFromRow(rows[0]);
}

function settingsOf(guildId: string): GameplayConfig["progress"] {
  try {
    return getGameplayConfig(guildId).progress ?? DEFAULT_GAMEPLAY_CONFIG.progress;
  } catch {
    return DEFAULT_GAMEPLAY_CONFIG.progress;
  }
}

/** The achievements a progress has reached but not yet unlocked. */
export function newlyReached(progress: Pick<PlayerProgress, "counters" | "achievements" | "bestStreak">): Achievement[] {
  return ACHIEVEMENTS.filter((achievement) => {
    if (progress.achievements[achievement.key]) return false;
    const value = achievement.counter === "streak" ? progress.bestStreak : progress.counters[achievement.counter];
    return value >= achievement.target;
  });
}

/** Unlocks what was reached, pays the rewards (when on) and remembers them as unseen. */
async function unlockReached(discordId: string, guildId: string, progress: PlayerProgress): Promise<Achievement[]> {
  const settings = settingsOf(guildId);
  if (!settings.achievementsEnabled) return [];
  const reached = newlyReached(progress);
  if (!reached.length) return [];
  const now = new Date().toISOString();
  // Only what this call really adds (another call may have unlocked it first) is paid.
  const client = await pool.connect();
  let added: Set<string>;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ achievements: Record<string, string> }>(
      "SELECT achievements FROM player_progress WHERE guild_id = $1 AND discord_id = $2 FOR UPDATE",
      [guildId, discordId],
    );
    const current = rows[0]?.achievements ?? {};
    const fresh = reached.filter((achievement) => !current[achievement.key]).map((achievement) => achievement.key);
    if (fresh.length) {
      await client.query(
        `UPDATE player_progress SET achievements = achievements || $3::text::jsonb, unseen = unseen || $4::text::jsonb, updated_at = now()
         WHERE guild_id = $1 AND discord_id = $2`,
        [guildId, discordId, JSON.stringify(Object.fromEntries(fresh.map((key) => [key, now]))), JSON.stringify(fresh)],
      );
    }
    await client.query("COMMIT");
    added = new Set(fresh);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const unlocked = reached.filter((achievement) => added.has(achievement.key));
  if (settings.achievementRewards) {
    const gold = unlocked.reduce((sum, achievement) => sum + achievement.reward, 0);
    if (gold > 0) await addPlayerGold(discordId, guildId, gold);
  }
  return unlocked;
}

/** Adds to a lifetime counter; called with every activity that fills the daily chest. */
export async function recordProgress(discordId: string, guildId: string, counter: ProgressCounter, amount = 1): Promise<Achievement[]> {
  const safe = Math.max(1, Math.floor(amount));
  await ensureProgressTable();
  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO player_progress (guild_id, discord_id, counters)
     VALUES ($1, $2, jsonb_build_object($3::text, $4::int))
     ON CONFLICT (guild_id, discord_id) DO UPDATE SET
       counters = jsonb_set(player_progress.counters, ARRAY[$3::text], to_jsonb(COALESCE((player_progress.counters->>$3)::int, 0) + $4::int), true),
       updated_at = now()
     RETURNING *`,
    [guildId, discordId, counter, safe],
  );
  return unlockReached(discordId, guildId, progressFromRow(rows[0]));
}

export type StreakResult = {
  streak: number;
  bestStreak: number;
  /** The extra Oboli and XP of today's chest, in percent. */
  bonusPercent: number;
  /** A key given for reaching a full week (every N-th day of the streak). */
  milestoneKey: KeyType | null;
  /** The streak had broken and starts again from 1. */
  restarted: boolean;
  unlocked: Achievement[];
};

/** Today's day and yesterday's, in the same UTC days as the daily chest. */
export function dayKeys(now = new Date()): { today: string; yesterday: string } {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return { today, yesterday };
}

/** The bonus a streak gives, as the settings describe it. */
export function streakBonusPercent(streak: number, settings: Pick<GameplayConfig["progress"], "streakBonusPercent" | "streakMaxDays">): number {
  return Math.max(0, Math.min(streak, settings.streakMaxDays) - 1) * settings.streakBonusPercent;
}

/** The streak after one more day: on the next day it grows, the same day it stays, after a gap it starts again. */
export function nextStreak(previous: Pick<PlayerProgress, "streak" | "lastDay">, now = new Date()): { streak: number; restarted: boolean; sameDay: boolean } {
  const { today, yesterday } = dayKeys(now);
  if (previous.lastDay === today) return { streak: previous.streak, restarted: false, sameDay: true };
  if (previous.lastDay === yesterday) return { streak: previous.streak + 1, restarted: false, sameDay: false };
  return { streak: 1, restarted: previous.streak > 1, sameDay: false };
}

/** Moves the streak on when the daily chest is opened, and counts the chest. */
export async function advanceStreak(discordId: string, guildId: string, now = new Date()): Promise<StreakResult> {
  const settings = settingsOf(guildId);
  await ensureProgressTable();
  const client = await pool.connect();
  let progress: PlayerProgress;
  let restarted = false;
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO player_progress (guild_id, discord_id) VALUES ($1, $2) ON CONFLICT (guild_id, discord_id) DO NOTHING",
      [guildId, discordId],
    );
    const { rows } = await client.query<Record<string, unknown>>(
      "SELECT * FROM player_progress WHERE guild_id = $1 AND discord_id = $2 FOR UPDATE",
      [guildId, discordId],
    );
    const before = progressFromRow(rows[0]);
    const next = settings.streakEnabled ? nextStreak(before, now) : { streak: before.streak, restarted: false, sameDay: true };
    restarted = next.restarted;
    const best = Math.max(before.bestStreak, next.streak);
    const updated = await client.query<Record<string, unknown>>(
      `UPDATE player_progress SET streak = $3, best_streak = $4, last_day = $5,
         counters = jsonb_set(counters, '{chests}', to_jsonb(COALESCE((counters->>'chests')::int, 0) + 1), true),
         updated_at = now()
       WHERE guild_id = $1 AND discord_id = $2 RETURNING *`,
      [guildId, discordId, next.streak, best, settings.streakEnabled && !next.sameDay ? dayKeys(now).today : before.lastDay ?? dayKeys(now).today],
    );
    await client.query("COMMIT");
    progress = progressFromRow(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const milestone = settings.streakEnabled && settings.weeklyKey && progress.streak > 0 && progress.streak % 7 === 0 && progress.lastDay === dayKeys(now).today;
  if (milestone) await addPlayerKey(discordId, guildId, "epic");
  const unlocked = await unlockReached(discordId, guildId, progress);
  return {
    streak: progress.streak,
    bestStreak: progress.bestStreak,
    bonusPercent: settings.streakEnabled ? streakBonusPercent(progress.streak, settings) : 0,
    milestoneKey: milestone ? "epic" : null,
    restarted,
    unlocked,
  };
}

/** Takes the unseen achievements (and marks them seen), for a line in the player's next reply. */
export async function takeUnseen(discordId: string, guildId: string): Promise<Achievement[]> {
  await ensureProgressTable();
  const client = await pool.connect();
  let keys: string[] = [];
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ unseen: string[] }>(
      "SELECT unseen FROM player_progress WHERE guild_id = $1 AND discord_id = $2 FOR UPDATE",
      [guildId, discordId],
    );
    keys = Array.isArray(rows[0]?.unseen) ? rows[0]!.unseen : [];
    if (keys.length) await client.query("UPDATE player_progress SET unseen = '[]'::jsonb WHERE guild_id = $1 AND discord_id = $2", [guildId, discordId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const wanted = new Set(keys);
  return ACHIEVEMENTS.filter((achievement) => wanted.has(achievement.key));
}

export function unseenLine(unlocked: Achievement[]): string {
  if (!unlocked.length) return "";
  return `🏅 **Realizare nouă:** ${unlocked.map((achievement) => `${achievement.emoji} ${achievement.name} (+${achievement.reward.toLocaleString("ro-RO")} Oboli)`).join(", ")}`;
}

function bar(value: number, target: number): string {
  const filled = Math.max(0, Math.min(10, Math.floor((value / target) * 10)));
  return `${"▰".repeat(filled)}${"▱".repeat(10 - filled)}`;
}

/** The /realizari card. */
export function buildAchievementsEmbed(name: string, progress: PlayerProgress, settings: GameplayConfig["progress"] = DEFAULT_GAMEPLAY_CONFIG.progress): EmbedBuilder {
  const unlockedCount = ACHIEVEMENTS.filter((achievement) => progress.achievements[achievement.key]).length;
  const lines = ACHIEVEMENTS.map((achievement) => {
    const at = progress.achievements[achievement.key];
    if (at) return `${achievement.emoji} **${achievement.name}** · <t:${Math.floor(new Date(at).getTime() / 1000)}:d>`;
    const value = achievement.counter === "streak" ? progress.bestStreak : progress.counters[achievement.counter];
    return `🔒 ${achievement.name} — ${achievement.description} \`${bar(value, achievement.target)}\` ${Math.min(value, achievement.target).toLocaleString("ro-RO")}/${achievement.target.toLocaleString("ro-RO")}`;
  });
  const bonus = streakBonusPercent(progress.streak, settings);
  const embed = new EmbedBuilder()
    .setColor(0xd94a2b)
    .setTitle(`🏅 Realizările lui ${name.slice(0, 80)}`)
    .setDescription(lines.join("\n").slice(0, 4_000))
    .addFields({ name: "Realizări", value: `${unlockedCount}/${ACHIEVEMENTS.length}`, inline: true })
    .setFooter({ text: "Seria crește cu fiecare zi la rând în care deschizi Cufărul Vegherii (/cufarpersonal)." });
  if (settings.streakEnabled) {
    embed.addFields(
      { name: "🔥 Seria", value: `${progress.streak} ${progress.streak === 1 ? "zi" : "zile"}${bonus ? ` · +${bonus}% la cufăr` : ""}`, inline: true },
      { name: "Cea mai lungă", value: `${progress.bestStreak} ${progress.bestStreak === 1 ? "zi" : "zile"}`, inline: true },
    );
  }
  return embed;
}

/** One short line for /profil. */
export function profileProgressLine(progress: PlayerProgress, settings: GameplayConfig["progress"] = DEFAULT_GAMEPLAY_CONFIG.progress): string {
  const unlocked = ACHIEVEMENTS.filter((achievement) => progress.achievements[achievement.key]);
  const badges = unlocked.slice(-5).map((achievement) => achievement.emoji).join(" ");
  const streak = settings.streakEnabled ? `🔥 Serie: **${progress.streak}** ${progress.streak === 1 ? "zi" : "zile"} · ` : "";
  return `${streak}🏅 **${unlocked.length}/${ACHIEVEMENTS.length}** realizări${badges ? ` ${badges}` : ""}`;
}

export function logProgressFailure(error: unknown, context: Record<string, unknown>): void {
  logger.warn({ error, ...context }, "Player progress update failed");
}
