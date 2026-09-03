import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../lib/logger";
import { buildStartEmbed, buildExpiredCronica, buildChestEmbed, buildExpiredChestEmbed, rollChest, oracleMessage, buildFinalBossEmbed, buildBossLeaderboard, buildEventLeaderboard, buildLockedChestEmbed, buildKeyChestEmbed, spawnLockedChest, rollKeyChestType, computeBossRewards, prestigeGoldMult, finalBossRow, bossMaxHp, veteranRank, veteranMult, CHEST_RARITIES, type ChestVariant, type BossRarity, type BossPlayerStats } from "./survival";
import { triggerRandomBattleEvent } from "./combat-events";
import { getRewardMultipliers } from "./status-effects";
import { startOracle, setOracleExtatic } from "./oracle";
import { rehydrateCouncilDecree, startOracleCouncilScheduler, stopOracleCouncilScheduler } from "./oracle-council";
import { createEvent, deactivateEvent, getExpiredActiveEvents, getEventParticipants, getAllEvents, setEventDecreeMessage, deleteEvent, getLatestActiveEvent, getActiveEvent, setHonorTitle, addPlayerReputation, addPlayerGold, addPlayerXp, getPrestigeLevels, persistActiveBoss, loadActiveBossRowsByGuild, deleteActiveBoss, createActiveBossesTableIfNotExists, persistActiveChest, loadActiveChest, clearActiveChest, getFinalBossKills, KEYCHEST_DBKEY, LOCKCHEST_DBKEY, runMultiGuildMigrations } from "./db";
import { getChannel, initChannelConfig, hasAnyChannelConfigured, type EventType } from "./channel-config";
import {
  openFratiaVote,
  rehydrateFratiaVote,
  spawnSeasonalChest,
  rehydrateSeasonalChest,
  settleExpiredAuction,
  SEASONAL_CHEST_INTERVAL_MS,
} from "./chest-expansions";
import { startTributeScheduler, stopTributeScheduler } from "./tribute";

const APPLICATION_ID = "1472675543777280071";
export const EVENT_DURATION_MS = 60 * 60 * 1000;
const FINAL_BOSS_ACTIVE_MS = 30 * 60 * 1000;
const BOSS_RESULT_TTL_MS = 10 * 60 * 1000;
const MIN_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const CHEST_INTERVAL_MS = 30 * 60 * 1000;
const KEY_CHEST_INTERVAL_MS = 45 * 60 * 1000;
const CHEST_EXPIRE_MS = 10 * 60 * 1000;
/** The legacy ordinary/key chest spawns stay available in code for compatibility,
 * but the new chest system is now the only one scheduled for players. */
export const LEGACY_CHEST_SPAWNS_ENABLED = false;

const ORACLE_INTERVAL_MS = 25 * 60 * 1000;
const BATTLE_EVENT_INTERVAL_MS = 7 * 60 * 1000;

// ─── Activity-gated chest spawn tuning ────────────────────────────────────────

function readEnvInt(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    logger.warn({ name, value: raw, fallback }, "Invalid chest-activity tuning value — using default");
    return fallback;
  }
  if (parsed > max) {
    logger.warn({ name, value: raw, max }, "Chest-activity tuning value above max — clamping");
    return max;
  }
  return parsed;
}

/** Minutes of chat silence before chest/key-chest timers skip their spawn.
 *  Env: ACTIVITY_WINDOW_MINUTES (default 20, max 120). Requires bot restart. */
export const ACTIVITY_WINDOW_MINUTES = readEnvInt("ACTIVITY_WINDOW_MINUTES", 20, 120);
const ACTIVITY_WINDOW_MS = ACTIVITY_WINDOW_MINUTES * 60_000;

/** Non-bot messages per guild between bonus chest rolls.
 *  Env: CHEST_MSG_MILESTONE (default 25, max 200). Requires bot restart. */
export const CHEST_MSG_MILESTONE = readEnvInt("CHEST_MSG_MILESTONE", 25, 200);

/** Non-bot messages in the main channel per guild between key-chest bonus rolls
 *  (15% chance each). Independent counter from the chest milestone.
 *  Env: KEY_CHEST_MSG_MILESTONE (default 50, max 400). Requires bot restart. */
export const KEY_CHEST_MSG_MILESTONE = readEnvInt("KEY_CHEST_MSG_MILESTONE", 50, 400);
const SERVER_CHEST_MSG_MILESTONE = readEnvInt("SERVER_CHEST_MSG_MILESTONE", 75, 1000);

// ─── Per-guild scheduler state ─────────────────────────────────────────────────

interface GuildSchedulerState {
  claimedChests: Set<string>;
  activeBossMap: Map<number, BossState>;
  firingChest: boolean;
  firingKeyChest: boolean;
  firingEvent: boolean;
  lastChestMessageId: string | null;
  lastChestTimeout: ReturnType<typeof setTimeout> | null;
  standaloneBossId: number | null;
  started: boolean;
  stopped: boolean;
  /** Timestamp (ms) of the last non-bot message in this guild. 0 = never seen. */
  lastActivityAt: number;
  /** Rolling count of non-bot messages since the last milestone chest roll. */
  activityMsgCount: number;
  /** Rolling count of non-bot messages since the last milestone key-chest roll. */
  keyMsgCount: number;
}

export const guildStates = new Map<string, GuildSchedulerState>();

function getOrCreateGuildState(guildId: string): GuildSchedulerState {
  let state = guildStates.get(guildId);
  if (!state) {
    state = {
      claimedChests: new Set(),
      activeBossMap: new Map(),
      firingChest: false,
      firingKeyChest: false,
      firingEvent: false,
      lastChestMessageId: null,
      lastChestTimeout: null,
      standaloneBossId: null,
      started: false,
      stopped: false,
      lastActivityAt: 0,
      activityMsgCount: 0,
      keyMsgCount: 0,
    };
    guildStates.set(guildId, state);
  }
  return state;
}

function buildChestRow(
  chestId: string,
  rarity: { key: string; emoji: string },
  gold: number,
  mult?: 2 | 3,
): ActionRowBuilder<ButtonBuilder> {
  const choices = rarity.key === "bronz"
    ? [{ key: "gold", label: `Aur (${gold})`, emoji: "💰", style: ButtonStyle.Success }, { key: "xp", label: "Experiență", emoji: "✨", style: ButtonStyle.Primary }]
    : rarity.key === "argint"
      ? [{ key: "gold", label: `Aur (${gold})`, emoji: "💰", style: ButtonStyle.Success }, { key: "xp", label: "Experiență", emoji: "✨", style: ButtonStyle.Primary }, { key: "blessing", label: "Binecuvântare", emoji: "🕯️", style: ButtonStyle.Secondary }]
      : [{ key: "gold", label: `Aur${mult ? ` ×${mult}` : ""}`, emoji: "💰", style: ButtonStyle.Success }, { key: "blessing", label: "Binecuvântare", emoji: "🕯️", style: ButtonStyle.Secondary }, { key: "relic", label: "Fragment relicvă", emoji: "💎", style: ButtonStyle.Primary }];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...choices.map((choice) => new ButtonBuilder()
      .setCustomId(`${chestId}_${choice.key}`)
      .setLabel(choice.label)
      .setEmoji(choice.emoji)
      .setStyle(choice.style)),
  );
}

function rollChestVariant(): ChestVariant {
  const roll = Math.random();
  if (roll < 0.18) return "razboi";
  if (roll < 0.34) return "blestemat";
  if (roll < 0.50) return "oracolului";
  if (roll < 0.70) return "umbrelor";
  if (roll < 0.84) return "fratie";
  return "aur";
}

// ─── Activity tracking (per-guild) ────────────────────────────────────────────

/**
 * Pure helper — true when `lastActivityAt` is within the given window.
 * Exported for unit tests; call site is `recordGuildActivity`.
 */
export function isGuildActive(lastActivityAt: number, windowMs: number, now = Date.now()): boolean {
  return lastActivityAt > 0 && now - lastActivityAt <= windowMs;
}

/**
 * Biased rarity roll for activity-triggered bonus chests.
 * Intentionally weaker than the normal timer roll: no Mitic, scarce Gold.
 * Weights: Bronz 70%, Argint 25%, Aur 5%.
 * Exported for unit testing; call sites are within this module only.
 */
export function rollActivityRarityKey(): string {
  const r = Math.random() * 100;
  if (r < 70) return "bronz";
  if (r < 95) return "argint";
  return "aur";
}

/**
 * Key type for activity-triggered bonus key chests: "rar" or "epic".
 * Rar = 60%, Epic = 40% — intentionally skews toward the cheaper key.
 * Exported for unit testing; call sites are within this module only.
 */
export function rollActivityKeyType(): "rar" | "epic" {
  return Math.random() < 0.60 ? "rar" : "epic";
}

/**
 * Called by the MessageCreate handler for non-bot messages in the guild's
 * configured main channel only. Three effects:
 *  1. Updates the guild's last-activity timestamp — used as the gate in
 *     `fireChest` / `fireKeyChest` to suppress spawns on silent servers.
 *  2. Increments `activityMsgCount`; at each `CHEST_MSG_MILESTONE` a 30%
 *     roll fires a bonus chest with a Bronze/Silver-biased rarity via
 *     `fireChestForced` (gate bypassed — server is active by definition).
 *  3. Increments `keyMsgCount` (independent counter); at each
 *     `KEY_CHEST_MSG_MILESTONE` a 15% roll fires a bonus key chest
 *     (Rar 60% / Epic 40%) via `fireKeyChest(..., bypassGate=true)`.
 */
export function recordGuildActivity(client: Client, guildId: string): void {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return;
  gs.lastActivityAt = Date.now();

  gs.activityMsgCount += 1;
  if (gs.activityMsgCount >= CHEST_MSG_MILESTONE) {
    gs.activityMsgCount = 0;
    if (LEGACY_CHEST_SPAWNS_ENABLED && Math.random() < 0.30) {
      void fireChestForced(client, guildId, rollActivityRarityKey());
    }
  }

  gs.keyMsgCount += 1;
  if (gs.keyMsgCount >= KEY_CHEST_MSG_MILESTONE) {
    gs.keyMsgCount = 0;
    if (LEGACY_CHEST_SPAWNS_ENABLED && Math.random() < 0.15) {
      void fireKeyChest(client, guildId, rollActivityKeyType(), true);
    }
  }

  // The Frăția meter is durable and shared by the whole guild. It deliberately
  // advances on every human message, while the existing rolling counters retain
  // their lightweight in-memory behavior for the ordinary bonus rolls.
  // Resolve this helper lazily so older test doubles and partially deployed
  // bot modules continue to work while the migration rolls out.
  void import("./db").then((dbModule) => {
    const updateMeter = (dbModule as typeof import("./db") & {
      incrementServerChestProgress?: (guildId: string, target: number) => Promise<{ progress: number; triggered: boolean }>;
    }).incrementServerChestProgress;
    if (typeof updateMeter !== "function") return;
    return updateMeter(guildId, SERVER_CHEST_MSG_MILESTONE).then((meter) => {
      if (meter.triggered && !gs.stopped) {
        void openFratiaVote(client, guildId).catch((err) =>
          logger.warn({ err, guildId }, "Failed to open Chivotul Frăției"),
        );
      }
    });
  }).catch((err) => logger.debug({ err, guildId }, "Server chest meter update skipped"));
}

/** Stop the scheduler for a guild (e.g. bot left the server). Future timer
 *  callbacks will no-op via the stopped flag; existing timers cannot be
 *  cancelled without tracking refs, but they become inert after this call. */
export function stopGuildScheduler(guildId: string) {
  stopOracleCouncilScheduler(guildId);
  stopTributeScheduler(guildId);
  const gs = guildStates.get(guildId);
  if (gs) {
    gs.stopped = true;
    gs.started = false;
    // Keep the state object in the Map so isStopped() closures (which read
    // guildStates.get(guildId)?.stopped) correctly see stopped=true even after
    // the guild is gone. If the bot later rejoins, startGuildScheduler resets
    // the flags before registering new timers.
  }
  logger.info({ guildId }, "Guild scheduler stopped — bot left guild");
}

/** Get the claimedChests set for a guild (creates state if missing). */
export function getGuildClaimedChests(guildId: string): Set<string> {
  return getOrCreateGuildState(guildId).claimedChests;
}

/** Get the activeBossMap for a guild (creates state if missing). */
export function getGuildActiveBossMap(guildId: string): Map<number, BossState> {
  return getOrCreateGuildState(guildId).activeBossMap;
}

// ─── Boss shared HP state ─────────────────────────────────────────────────────
export type { BossPlayerStats };

export interface BossState {
  eventId: number;
  /** Guild this boss belongs to — used for DB calls and channel lookups. */
  guildId: string;
  level: number;
  rarity: BossRarity;
  maxHp: number;
  currentHp: number;
  messageId: string;
  channelId: string;
  lastHitAt: Map<string, number>;
  damageBy: Map<string, number>;
  hitsBy: Map<string, number>; // attack count per player (for reward scaling)
  playerHp: Map<string, number>;
  playerNames: Map<string, string>;
  playerStats: Map<string, BossPlayerStats>;
  participants: Array<{ username: string; discordId: string; monsterLevel: number; totalDamage: number; isAlive: boolean }>;
  expiresAt: number;
  standalone: boolean;
  abilityReadyAt: Map<string, number>;
  empowerNext: Set<string>;
  /** Active Ash Shields: per player, the shield's remaining HP and ability level. */
  shieldNext: Map<string, { hp: number; level: number }>;
  defeated: boolean;
  /** Shared ability charge bar — fills with every player hit. */
  charge: number;
  /** Veteran rank 0–5 from the guild's past final-boss defeats — +20% HP/dmg per rank. */
  veteranRank: number;
}

// ─── Boss state serialization / deserialization ────────────────────────────────

interface SerializedBossState {
  eventId: number;
  guildId: string;
  level: number;
  rarity: BossRarity;
  maxHp: number;
  currentHp: number;
  messageId: string;
  channelId: string;
  lastHitAt: [string, number][];
  damageBy: [string, number][];
  hitsBy: [string, number][];
  playerHp: [string, number][];
  playerNames: [string, string][];
  playerStats: [string, BossPlayerStats][];
  participants: Array<{ username: string; discordId: string; monsterLevel: number; totalDamage: number; isAlive: boolean }>;
  expiresAt: number;
  standalone: boolean;
  abilityReadyAt: [string, number][];
  empowerNext: string[];
  /** Old saves stored a plain string[]; new saves store [id, {hp, level}] entries. */
  shieldNext: string[] | [string, { hp: number; level: number }][];
  defeated: boolean;
  charge?: number;
  veteranRank?: number;
}

function serializeBoss(boss: BossState): string {
  const s: SerializedBossState = {
    eventId: boss.eventId,
    guildId: boss.guildId,
    level: boss.level,
    rarity: boss.rarity,
    maxHp: boss.maxHp,
    currentHp: boss.currentHp,
    messageId: boss.messageId,
    channelId: boss.channelId,
    lastHitAt: [...boss.lastHitAt.entries()],
    damageBy: [...boss.damageBy.entries()],
    hitsBy: [...boss.hitsBy.entries()],
    playerHp: [...boss.playerHp.entries()],
    playerNames: [...boss.playerNames.entries()],
    playerStats: [...boss.playerStats.entries()],
    participants: boss.participants,
    expiresAt: boss.expiresAt,
    standalone: boss.standalone,
    abilityReadyAt: [...boss.abilityReadyAt.entries()],
    empowerNext: [...boss.empowerNext],
    shieldNext: [...boss.shieldNext.entries()],
    defeated: boss.defeated,
    charge: boss.charge,
    veteranRank: boss.veteranRank,
  };
  return JSON.stringify(s);
}

function deserializeBoss(json: string, fallbackGuildId?: string): BossState {
  const s = JSON.parse(json) as SerializedBossState;
  return {
    eventId: s.eventId,
    guildId: s.guildId ?? fallbackGuildId ?? "1382035307607883816",
    level: s.level,
    rarity: s.rarity,
    maxHp: s.maxHp,
    currentHp: s.currentHp,
    messageId: s.messageId,
    channelId: s.channelId,
    lastHitAt: new Map(s.lastHitAt),
    damageBy: new Map(s.damageBy),
    hitsBy: new Map(s.hitsBy ?? []),
    playerHp: new Map(s.playerHp),
    playerNames: new Map(s.playerNames),
    playerStats: new Map(s.playerStats),
    participants: s.participants,
    expiresAt: s.expiresAt,
    standalone: s.standalone,
    abilityReadyAt: new Map(s.abilityReadyAt),
    empowerNext: new Set(s.empowerNext),
    // Old saves stored just the player ids (mana-backed shields) — those
    // shields can't be restored to the new own-HP model, so they are dropped.
    shieldNext: new Map(
      (s.shieldNext ?? []).filter((e): e is [string, { hp: number; level: number }] => Array.isArray(e)),
    ),
    defeated: s.defeated,
    charge: s.charge ?? 0,
    veteranRank: s.veteranRank ?? 0,
  };
}

// Persist the current snapshot of a boss fight to DB.
export async function persistBossState(boss: BossState): Promise<void> {
  try {
    await persistActiveBoss(boss.eventId, boss.guildId, serializeBoss(boss), new Date(boss.expiresAt));
  } catch (err) {
    logger.error({ err, eventId: boss.eventId }, "Failed to persist boss state");
  }
}

// ─── Final-boss eligibility guard ─────────────────────────────────────────────
export type BossEligibilityResult =
  | { ok: true }
  | { ok: false; reason: "no_boss" | "defeated" | "dead" };

export function checkBossEligibility(
  boss: BossState | undefined,
  uid: string,
): BossEligibilityResult {
  if (!boss) return { ok: false, reason: "no_boss" };
  if (boss.defeated) return { ok: false, reason: "defeated" };
  const bossHp = boss.playerHp.get(uid);
  if (bossHp !== undefined && bossHp <= 0) return { ok: false, reason: "dead" };
  return { ok: true };
}

// ─── Boss hit cooldown guard ───────────────────────────────────────────────────
export const BOSS_HIT_COOLDOWN_MS = 4000;

export type BossCooldownResult =
  | { onCooldown: false }
  | { onCooldown: true; remainingSeconds: number };

export function checkBossHitCooldown(
  lastHitAt: Map<string, number>,
  uid: string,
  now = Date.now(),
): BossCooldownResult {
  const lastHit = lastHitAt.get(uid) ?? 0;
  const elapsed = now - lastHit;
  if (elapsed < BOSS_HIT_COOLDOWN_MS) {
    return { onCooldown: true, remainingSeconds: Math.ceil((BOSS_HIT_COOLDOWN_MS - elapsed) / 1000) };
  }
  return { onCooldown: false };
}

export const BOSS_RARITY_WEIGHTS: [BossRarity, number][] = [
  ["comun", 60], ["rar", 25], ["epic", 12], ["legendar", 3],
];
function rollBossRarity(): BossRarity {
  const total = BOSS_RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of BOSS_RARITY_WEIGHTS) {
    if ((roll -= w) <= 0) return r;
  }
  return "comun";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function randomCooldown() {
  return Math.floor(Math.random() * (MAX_COOLDOWN_MS - MIN_COOLDOWN_MS + 1)) + MIN_COOLDOWN_MS;
}

// ─── Event expiry ──────────────────────────────────────────────────────────────

async function expireOldEvents(client: Client, guildId: string) {
  const expired = await getExpiredActiveEvents(guildId);
  for (const ev of expired) {
    try {
      const channel = await fetchChannel(client, "event", guildId);
      if (channel instanceof TextChannel) {
        const msg = await channel.messages.fetch(ev.messageId).catch(() => null);
        if (msg) {
          const participants = await getEventParticipants(ev.id, guildId);
          const survivors = participants.filter((p) => p.isAlive);
          const fled = participants.filter((p) => !p.isAlive && p.fled);
          const fallen = participants.filter((p) => !p.isAlive && !p.fled);
          const cronica = buildExpiredCronica(survivors, fallen, fled);
          const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`expired_${ev.id}`)
              .setLabel("Ora Umbrelor s-a încheiat")
              .setEmoji("⌛")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
          await msg.edit({ embeds: [cronica], components: [disabledRow] });

          const topCh = await fetchChannel(client, "eventTop", guildId);
          if (topCh instanceof TextChannel) {
            await topCh.send({ embeds: [cronica] }).catch(() => null);
            const leaderboard = buildEventLeaderboard(participants);
            await topCh.send({ embeds: [leaderboard] }).catch(() => null);
          }

          const ranked = [...participants].sort((a, b) => {
            if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
            if (b.monsterLevel !== a.monsterLevel) return b.monsterLevel - a.monsterLevel;
            return b.totalDamage - a.totalDamage;
          });
          const HONOR_TITLES = ["Eroul Umbrelor", "Supraviețuitorul Cenușii", "Vânătorul Stins"];
          for (let i = 0; i < Math.min(3, ranked.length); i++) {
            const r = ranked[i]!;
            if (r.monsterLevel <= 1) continue;
            await setHonorTitle(r.discordId, guildId, HONOR_TITLES[i]!).catch(() => null);
          }
        }
      }
      await fireFinalBoss(client, guildId, ev.id);
      await deactivateEvent(ev.id);
      logger.info({ eventId: ev.id, guildId }, "Event expired");
    } catch (err) {
      logger.error({ err, eventId: ev.id, guildId }, "Failed to expire event");
    }
  }
}

// ─── Chest — forced (admin) ────────────────────────────────────────────────────

export async function fireChestForced(
  client: Client,
  guildId: string,
  rarityKey: string,
  mult?: 2 | 3,
  forcedVariant?: ChestVariant,
) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.firingChest) {
    logger.warn({ guildId }, "fireChestForced already in progress, skipping duplicate trigger");
    return null;
  }
  gs.firingChest = true;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!(channel instanceof TextChannel)) return null;

    if (gs.lastChestTimeout) {
      clearTimeout(gs.lastChestTimeout);
      gs.lastChestTimeout = null;
    }
    if (gs.lastChestMessageId) {
      const old = await channel.messages.fetch(gs.lastChestMessageId).catch(() => null);
      if (old) await old.delete().catch(() => null);
      gs.lastChestMessageId = null;
    }

    const { buildChestEmbed: bce, spawnChest: sc } = await import("./survival");
    const result = sc(rarityKey);
    if (!result) return null;
    const { rarity, gold } = result;
    const variant = forcedVariant ?? rollChestVariant();
    const chestId = mult != null
      ? `chest_${Date.now()}_${rarity.key}_${gold}_${variant}_x${mult}`
      : `chest_${Date.now()}_${rarity.key}_${gold}_${variant}`;
    const expireAt = Date.now() + CHEST_EXPIRE_MS;

    const row = buildChestRow(chestId, rarity, gold, mult);

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    const content = mult != null
      ? `🔮 **Cufăr Binecuvântat** — ${rarity.label} apare în Regat! **×${mult} Oboli** pentru cel mai rapid!`
      : `📦 Cufăr de **${rarity.label}** apare în Regat! Revendică-l repede!`;

    const msg = await channel.send({
      content,
       embeds: [bce(gold, rarity, mult, variant, expireAt)],
      components: [lockedRow],
    });
    gs.lastChestMessageId = msg.id;
     void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold, rarityKey: rarity.key, mult, variant, expiresAt: expireAt }).catch(() => null);

    await sleep(5000);
    if (!gs.claimedChests.has(chestId)) {
       await msg.edit({ embeds: [bce(gold, rarity, mult, variant, expireAt)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, gold, rarity: rarity.key, mult, guildId }, "Chest spawned (forced)");

    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(chestId)) {
        gs.claimedChests.add(chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel(mult != null ? "Cufărul binecuvântat a dispărut…" : "Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ embeds: [buildExpiredChestEmbed(gold, rarity, mult)], components: [disabledRow] }).catch(() => null);
        logger.info({ chestId, guildId }, "Chest expired unclaimed (forced)");
      }
      void clearActiveChest(guildId).catch(() => null);
    }, CHEST_EXPIRE_MS);

    timeout.unref?.();
    gs.lastChestTimeout = timeout;

    return { chestId, gold, expireAt };
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire chest (forced)");
    return null;
  } finally {
    gs.firingChest = false;
  }
}

// ─── Chest — scheduled ────────────────────────────────────────────────────────

export async function fireChest(client: Client, guildId: string, bypassGate = false) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.firingChest) {
    logger.warn({ guildId }, "fireChest already in progress, skipping duplicate trigger");
    return null;
  }
  if (!bypassGate && !isGuildActive(gs.lastActivityAt, ACTIVITY_WINDOW_MS)) {
    logger.debug({ guildId, lastActivityAt: gs.lastActivityAt, windowMinutes: ACTIVITY_WINDOW_MINUTES }, "Chest spawn skipped — no recent chat activity");
    return null;
  }
  gs.firingChest = true;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!(channel instanceof TextChannel)) return null;

    if (gs.lastChestTimeout) {
      clearTimeout(gs.lastChestTimeout);
      gs.lastChestTimeout = null;
    }
    if (gs.lastChestMessageId) {
      const old = await channel.messages.fetch(gs.lastChestMessageId).catch(() => null);
      if (old) await old.delete().catch(() => null);
      gs.lastChestMessageId = null;
    }

    const { rarity, gold } = rollChest();
    const variant = rollChestVariant();

    const chestId = `chest_${Date.now()}_${rarity.key}_${gold}_${variant}`;
    const expireAt = Date.now() + CHEST_EXPIRE_MS;

    const row = buildChestRow(chestId, rarity, gold);

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    const frames: Array<{ content: string; delay: number }> =
      rarity.key === "mitic"
        ? [
            { content: "🌑 *Cenușa înnegrește cerul…*", delay: 700 },
            { content: "💜 *O energie arcană pulsează prin aer…*", delay: 700 },
            { content: "⚡💎⚡ *Puterea veche se trezește!*", delay: 700 },
            { content: "💎🔮💎 **UN CUFĂR MITIC ÎȘI FACE APARIȚIA!!**", delay: 800 },
          ]
        : rarity.key === "aur"
        ? [
            { content: "✨ *O lumină aurie pâlpâie în depărtare…*", delay: 800 },
            { content: "🟡✨ *Podeaua tremură. Ceva prețios se ridică…*", delay: 800 },
            { content: "🥇🌟💰 **UN CUFĂR DE AUR!**", delay: 800 },
          ]
        : rarity.key === "argint"
        ? [
            { content: "🌫️ *Un fior rece trece prin aer…*", delay: 800 },
            { content: "🥈✨ *Un cufăr argintiu apare din ceață!*", delay: 900 },
          ]
        : [
            { content: "✨ *Ceva strălucește în cenușă…*", delay: 900 },
            { content: "🪙📦 *Un cufăr de bronz răsare din praf…*", delay: 900 },
          ];

    const msg = await channel.send({ content: frames[0]!.content });
    gs.lastChestMessageId = msg.id;
    void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold, rarityKey: rarity.key, variant, expiresAt: expireAt }).catch(() => null);

    for (let i = 1; i < frames.length; i++) {
      await sleep(frames[i - 1]!.delay);
      await msg.edit({ content: frames[i]!.content }).catch(() => null);
    }
    await sleep(frames[frames.length - 1]!.delay);
    await msg.edit({ content: `${rarity.emoji}✨`, embeds: [buildChestEmbed(gold, rarity, undefined, variant, expireAt)], components: [lockedRow] }).catch(() => null);
    await sleep(500);
    await msg.edit({ content: "", embeds: [buildChestEmbed(gold, rarity, undefined, variant, expireAt)], components: [lockedRow] }).catch(() => null);

    await sleep(5000);
    if (!gs.claimedChests.has(chestId)) {
      await msg.edit({ embeds: [buildChestEmbed(gold, rarity, undefined, variant, expireAt)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, gold, rarity: rarity.key, guildId }, "Chest spawned");

    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(chestId)) {
        gs.claimedChests.add(chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel("Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ embeds: [buildExpiredChestEmbed(gold, rarity)], components: [disabledRow] }).catch(() => null);
        logger.info({ chestId, guildId }, "Chest expired unclaimed");
      }
      void clearActiveChest(guildId).catch(() => null);
    }, CHEST_EXPIRE_MS);

    timeout.unref?.();
    gs.lastChestTimeout = timeout;

    return { chestId, gold, expireAt };
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire chest");
    return null;
  } finally {
    gs.firingChest = false;
  }
}

// ─── Old event cleanup ────────────────────────────────────────────────────────

async function cleanupOldEvents(client: Client, guildId: string) {
  const old = await getAllEvents(guildId);
  if (old.length === 0) return;

  const eventChannel = await fetchChannel(client, "event", guildId);
  const mainChannel = await fetchChannel(client, "main", guildId);

  for (const ev of old) {
    try {
      if (eventChannel instanceof TextChannel) {
        const msg = await eventChannel.messages.fetch(ev.messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => null);
      }
      if (ev.decreeMessageId && mainChannel instanceof TextChannel) {
        const decree = await mainChannel.messages.fetch(ev.decreeMessageId).catch(() => null);
        if (decree) await decree.delete().catch(() => null);
      }
      await deleteEvent(ev.id);
    } catch (err) {
      logger.error({ err, eventId: ev.id, guildId }, "Failed to cleanup old event");
    }
  }
  logger.info({ count: old.length, guildId }, "Old events cleaned up");
}

// ─── Fire event ───────────────────────────────────────────────────────────────

export async function fireEvent(client: Client, guildId: string) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.firingEvent) {
    logger.warn({ guildId }, "fireEvent already in progress, skipping duplicate trigger");
    return;
  }
  gs.firingEvent = true;
  try {
    const channel = await fetchChannel(client, "event", guildId);
    if (!channel) {
      return;
    }

    void cleanupOldEvents(client, guildId).catch(() => null);

    const expiresAt = new Date(Date.now() + EVENT_DURATION_MS);

    const placeholder = await channel.send({ embeds: [buildStartEmbed()] });
    const ev = await createEvent(guildId, "ora_umbrelor", placeholder.id, expiresAt);

    const joinRowFinal = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ora_join_${ev.id}`)
        .setLabel("Intră în Luptă")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Danger),
    );
    await placeholder.edit({ embeds: [buildStartEmbed(expiresAt)], components: [joinRowFinal] }).catch(() => null);

    logger.info({ eventId: ev.id, guildId }, "Ora Umbrelor fired");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire event");
  } finally {
    gs.firingEvent = false;
  }
}

// ─── Final boss ───────────────────────────────────────────────────────────────

export async function fireFinalBoss(client: Client, guildId: string, eventId: number) {
  const gs = getOrCreateGuildState(guildId);
  try {
    const ev = await getActiveEvent(eventId, guildId);
    if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) return;

    const channel = await fetchChannel(client, "boss", guildId);
    if (!channel) return;

    const participants = await getEventParticipants(eventId, guildId);
    const aliveParticipants = participants.filter((p) => p.isAlive);
    const avgLevel = aliveParticipants.length
      ? Math.ceil(aliveParticipants.reduce((s, p) => s + p.monsterLevel, 0) / aliveParticipants.length)
      : 1;
    const bossLevel = Math.max(5, Math.ceil(avgLevel / 2));
    const rarity = rollBossRarity();
    const maxHp = bossMaxHp(bossLevel, rarity);
    const bossExpiresAt = Date.now() + FINAL_BOSS_ACTIVE_MS;

    const msg = await channel.send({
      embeds: [buildFinalBossEmbed(bossLevel, rarity, maxHp, maxHp, undefined, undefined, undefined, undefined, bossExpiresAt, 0, 0)],
      components: [finalBossRow(eventId)],
    });

    const boss: BossState = {
      eventId,
      guildId,
      level: bossLevel,
      rarity,
      maxHp,
      currentHp: maxHp,
      messageId: msg.id,
      channelId: channel.id,
      expiresAt: bossExpiresAt,
      standalone: false,
      lastHitAt: new Map(),
      damageBy: new Map(),
      hitsBy: new Map(),
      playerHp: new Map(),
      playerNames: new Map(),
      playerStats: new Map(),
      participants: participants.map((p) => ({
        username: p.username,
        discordId: p.discordId,
        monsterLevel: p.monsterLevel,
        totalDamage: p.totalDamage,
        isAlive: p.isAlive,
      })),
      abilityReadyAt: new Map(),
      empowerNext: new Set(),
      shieldNext: new Map(),
      defeated: false,
      charge: 0,
      veteranRank: 0,
    };
    gs.activeBossMap.set(eventId, boss);
    await persistBossState(boss);
    setOracleExtatic();
    scheduleEscapeTimer(boss, client);

    logger.info({ eventId, bossLevel, rarity, maxHp, guildId }, "Final boss summoned");
  } catch (err) {
    logger.error({ err, eventId, guildId }, "Failed to summon final boss");
  }
}

// ─── Standalone boss ──────────────────────────────────────────────────────────

const STANDALONE_BOSS_MIN_MS = 30 * 60_000;
const STANDALONE_BOSS_MAX_MS = 60 * 60_000;
const STANDALONE_BOSS_ACTIVE_MS = 60 * 60_000;

/**
 * Fetch a guild's configured channel. Returns null if the channel is not
 * configured (guild must run /setcanal) or cannot be fetched from Discord.
 * All scheduler actions that post to a channel MUST guard on null return.
 */
async function fetchChannel(client: Client, type: EventType, guildId: string): Promise<TextChannel | null> {
  const id = getChannel(type, guildId);
  if (!id) {
    logger.warn({ guildId, type }, "Channel not configured for guild — action skipped (run /setcanal)");
    return null;
  }
  const ch = await client.channels.fetch(id).catch(() => null);
  return ch instanceof TextChannel ? ch : null;
}

// ─── Flee resolution ──────────────────────────────────────────────────────────

async function runFleeResolution(boss: BossState, client: Client): Promise<void> {
  try {
    const fightCh = await client.channels.fetch(boss.channelId).catch(() => null);
    if (fightCh instanceof TextChannel) {
      const bossMsg = await fightCh.messages.fetch(boss.messageId).catch(() => null);
      await bossMsg?.delete().catch(() => null);
    }
    const bossRewards = computeBossRewards(boss.damageBy, boss.rarity, boss.hitsBy, boss.veteranRank ?? 0);
    const prestigeLevels = await getPrestigeLevels(boss.guildId, [...bossRewards.keys()]).catch(() => new Map<string, number>());
    for (const [discordId, r] of bossRewards) {
      // Pass guildId so the guild-wide admin boost applies here too, matching the boss-defeat path
      const rmods = getRewardMultipliers(discordId, boss.guildId);
      r.gold = Math.round(r.gold * rmods.goldMult * prestigeGoldMult(prestigeLevels.get(discordId) ?? 0));
      r.xp = Math.round(r.xp * rmods.xpMult);
    }
    await Promise.all([...bossRewards.entries()].flatMap(([discordId, r]) => [
      addPlayerReputation(discordId, boss.guildId, r.rep),
      addPlayerGold(discordId, boss.guildId, r.gold),
      addPlayerXp(discordId, boss.guildId, r.xp),
    ]));
    const topCh = await fetchChannel(client, "bossTop", boss.guildId);
    if (topCh instanceof TextChannel) {
      const leaderboard = buildBossLeaderboard(boss, boss.damageBy, boss.participants, boss.playerNames, boss.playerHp, boss.hitsBy);
      const lbMsg = await topCh.send({ embeds: [leaderboard] }).catch(() => null);
      if (lbMsg) setTimeout(() => void lbMsg.delete().catch(() => {}), BOSS_RESULT_TTL_MS);
    }
  } catch { /* ignore */ }
}

// ─── Shared escape timer ──────────────────────────────────────────────────────

function scheduleEscapeTimer(boss: BossState, client: Client): ReturnType<typeof setTimeout> {
  const remaining = Math.max(0, boss.expiresAt - Date.now());
  const timer = setTimeout(async () => {
    if (boss.defeated) return;
    boss.defeated = true;
    const gs = guildStates.get(boss.guildId);
    if (gs) {
      gs.activeBossMap.delete(boss.eventId);
      if (boss.standalone && gs.standaloneBossId === boss.eventId) gs.standaloneBossId = null;
    }
    await deleteActiveBoss(boss.eventId, boss.guildId).catch(() => null);
    await runFleeResolution(boss, client);
  }, remaining);
  timer.unref?.();
  return timer;
}

// ─── Startup rehydration ──────────────────────────────────────────────────────

async function rehydrateActiveBosses(client: Client, guildId: string): Promise<void> {
  try {
    await createActiveBossesTableIfNotExists();
    const rows = await loadActiveBossRowsByGuild(guildId);
    if (rows.length === 0) return;

    const now = Date.now();
    let loaded = 0;

    for (const row of rows) {
      const rowGuildId = guildId;
      if (row.expiresAt.getTime() <= now) {
        try {
          const expiredBoss = deserializeBoss(row.stateJson, rowGuildId);
          logger.info({ eventId: row.eventId, damageBy: expiredBoss.damageBy.size }, "Resolving flee for boss that expired during downtime");
          await runFleeResolution(expiredBoss, client);
        } catch (err) {
          logger.error({ err, eventId: row.eventId }, "Failed to resolve expired boss on startup — rewards may be lost");
        }
        await deleteActiveBoss(row.eventId, rowGuildId).catch(() => null);
        continue;
      }
      try {
        const boss = deserializeBoss(row.stateJson, rowGuildId);
        boss.defeated = false;
        const gs = getOrCreateGuildState(boss.guildId);
        gs.activeBossMap.set(boss.eventId, boss);
        if (boss.standalone) gs.standaloneBossId = boss.eventId;
        scheduleEscapeTimer(boss, client);
        loaded++;
        logger.info({ eventId: boss.eventId, guildId: boss.guildId, remainingMs: boss.expiresAt - now }, "Boss fight rehydrated from DB");
      } catch (err) {
        logger.error({ err, eventId: row.eventId }, "Failed to deserialize boss state — dropping row");
        await deleteActiveBoss(row.eventId, rowGuildId).catch(() => null);
      }
    }

    if (loaded > 0) {
      logger.info({ count: loaded }, "Active boss fights restored from DB");
    }
  } catch (err) {
    logger.error({ err }, "Failed to rehydrate active bosses on startup");
  }
}

// ─── Chest rehydration ────────────────────────────────────────────────────────

export async function rehydrateActiveChest(client: Client, guildId: string): Promise<void> {
  const gs = getOrCreateGuildState(guildId);
  try {
    const record = await loadActiveChest(guildId);
    if (!record) return;

    const now = Date.now();
    const ch = await client.channels.fetch(record.channelId).catch(() => null);
    if (!(ch instanceof TextChannel)) {
      await clearActiveChest(guildId).catch(() => null);
      logger.warn({ chestId: record.chestId, guildId }, "Chest channel not found on rehydration — row cleared");
      return;
    }

    const msg = await ch.messages.fetch(record.messageId).catch(() => null);
    const rarity = CHEST_RARITIES.find((r) => r.key === record.rarityKey) ?? CHEST_RARITIES[0]!;

    if (now >= record.expiresAt || !msg) {
      if (msg) {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${record.chestId}_expired`)
            .setLabel(record.mult != null ? "Cufărul binecuvântat a dispărut…" : "Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ embeds: [buildExpiredChestEmbed(record.gold, rarity, record.mult)], components: [disabledRow] }).catch(() => null);
      }
      gs.claimedChests.add(record.chestId);
      gs.lastChestMessageId = null;
      await clearActiveChest(guildId).catch(() => null);
      logger.info({ chestId: record.chestId, hadMessage: !!msg, guildId }, "Stale chest expired on bot restart");
      return;
    }

    gs.lastChestMessageId = record.messageId;
    const remaining = record.expiresAt - now;
    // Re-enable the full Cufere 2.0 choice row after a restart. The active
    // record contains the variant in new saves; old records fall back safely.
    await msg.edit({
      embeds: [buildChestEmbed(record.gold, rarity, record.mult, record.variant, record.expiresAt)],
      components: [buildChestRow(record.chestId, rarity, record.gold, record.mult)],
    }).catch(() => null);

    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(record.chestId)) {
        gs.claimedChests.add(record.chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${record.chestId}_expired`)
            .setLabel(record.mult != null ? "Cufărul binecuvântat a dispărut…" : "Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ embeds: [buildExpiredChestEmbed(record.gold, rarity, record.mult)], components: [disabledRow] }).catch(() => null);
        logger.info({ chestId: record.chestId, guildId }, "Rehydrated chest expired unclaimed");
      }
      gs.lastChestMessageId = null;
      await clearActiveChest(guildId).catch(() => null);
    }, remaining);

    timeout.unref?.();
    gs.lastChestTimeout = timeout;

    logger.info({ chestId: record.chestId, remainingMs: remaining, guildId }, "Active chest rehydrated from DB");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to rehydrate active chest on startup");
  }
}

export async function rehydrateSimpleChest(client: Client, guildId: string, dbKey: string): Promise<void> {
  const gs = getOrCreateGuildState(guildId);
  try {
    const record = await loadActiveChest(guildId, dbKey);
    if (!record) return;

    const now = Date.now();
    const ch = await client.channels.fetch(record.channelId).catch(() => null);
    if (!(ch instanceof TextChannel)) {
      await clearActiveChest(guildId, dbKey).catch(() => null);
      logger.warn({ chestId: record.chestId, dbKey, guildId }, "Simple chest channel not found on rehydration — row cleared");
      return;
    }

    const msg = await ch.messages.fetch(record.messageId).catch(() => null);
    const expiredLabel = record.kind === "keychest" ? "Cheia s-a topit în fum..." : "Cufărul a dispărut...";

    if (now >= record.expiresAt || !msg) {
      if (msg) {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${record.chestId}_expired`)
            .setLabel(expiredLabel)
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ components: [disabledRow] }).catch(() => null);
      }
      gs.claimedChests.add(record.chestId);
      await clearActiveChest(guildId, dbKey).catch(() => null);
      logger.info({ chestId: record.chestId, dbKey, hadMessage: !!msg, guildId }, "Stale simple chest expired on bot restart");
      return;
    }

    const remaining = record.expiresAt - now;
    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(record.chestId)) {
        gs.claimedChests.add(record.chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${record.chestId}_expired`)
            .setLabel(expiredLabel)
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ components: [disabledRow] }).catch(() => null);
        logger.info({ chestId: record.chestId, guildId }, "Rehydrated simple chest expired unclaimed");
      }
      await clearActiveChest(guildId, dbKey).catch(() => null);
    }, remaining);
    timeout.unref?.();

    logger.info({ chestId: record.chestId, dbKey, remainingMs: remaining, guildId }, "Simple chest rehydrated from DB");
  } catch (err) {
    logger.error({ err, dbKey, guildId }, "Failed to rehydrate simple chest on startup");
  }
}

// ─── Standalone boss ──────────────────────────────────────────────────────────

export async function fireStandaloneBoss(client: Client, guildId: string) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.standaloneBossId !== null && gs.activeBossMap.has(gs.standaloneBossId)) {
    logger.info({ standaloneBossId: gs.standaloneBossId, guildId }, "Standalone boss already active, skipping spawn");
    return;
  }

  try {
    const channel = await fetchChannel(client, "boss", guildId);
    if (!channel) {
      return;
    }

    const bossId = Date.now();
    const level = Math.floor(Math.random() * 21) + 10;
    const rarity = rollBossRarity();
    const kills = await getFinalBossKills(guildId).catch(() => 0);
    const vRank = veteranRank(kills);
    const maxHp = Math.round(bossMaxHp(level, rarity) * veteranMult(vRank));
    const bossExpiresAt = Date.now() + STANDALONE_BOSS_ACTIVE_MS;

    const msg = await channel.send({
      embeds: [buildFinalBossEmbed(level, rarity, maxHp, maxHp, undefined, undefined, undefined, undefined, bossExpiresAt, 0, vRank)],
      components: [finalBossRow(bossId)],
    });

    const boss: BossState = {
      eventId: bossId,
      guildId,
      level,
      rarity,
      maxHp,
      currentHp: maxHp,
      messageId: msg.id,
      channelId: channel.id,
      expiresAt: bossExpiresAt,
      standalone: true,
      lastHitAt: new Map(),
      damageBy: new Map(),
      hitsBy: new Map(),
      playerHp: new Map(),
      playerNames: new Map(),
      playerStats: new Map(),
      participants: [],
      abilityReadyAt: new Map(),
      empowerNext: new Set(),
      shieldNext: new Map(),
      defeated: false,
      charge: 0,
      veteranRank: vRank,
    };
    gs.activeBossMap.set(bossId, boss);
    gs.standaloneBossId = bossId;
    await persistBossState(boss);
    setOracleExtatic();
    scheduleEscapeTimer(boss, client);

    logger.info({ bossId, level, rarity, maxHp, veteranRank: vRank, guildId }, "Standalone boss summoned");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to summon standalone boss");
    const gs2 = guildStates.get(guildId);
    if (gs2) gs2.standaloneBossId = null;
  }
}

// ─── Locked chest ─────────────────────────────────────────────────────────────

export async function fireLockedChest(client: Client, guildId: string, rarityKey: string): Promise<void> {
  const gs = getOrCreateGuildState(guildId);
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!channel) return;

    const result = spawnLockedChest(rarityKey);
    if (!result) {
      logger.warn({ rarityKey, guildId }, "fireLockedChest: invalid rarity");
      return;
    }
    const { rarity, gold } = result;
    const chestId = `lockchest_${Date.now()}_${rarity.key}_${gold}`;
    const expiresAt = Date.now() + CHEST_EXPIRE_MS;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("🗝️ Deschide cu Cheia")
        .setStyle(ButtonStyle.Primary),
    );

    const msg = await channel.send({
      content: `🔒 **Cufăr Blocat** apare în Regat! Cel cu cheia potrivită îl poate deschide!`,
       embeds: [buildLockedChestEmbed(rarity.key, gold, expiresAt)],
      components: [row],
    });

    logger.info({ chestId, rarityKey: rarity.key, gold, guildId }, "Locked chest spawned");
    void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold, rarityKey: rarity.key, kind: "lockchest", expiresAt }, LOCKCHEST_DBKEY).catch(() => null);

    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(chestId)) {
        gs.claimedChests.add(chestId);
        const expiredRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel("Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ components: [expiredRow] }).catch(() => null);
        logger.info({ chestId, guildId }, "Locked chest expired unclaimed");
      }
      void clearActiveChest(guildId, LOCKCHEST_DBKEY).catch(() => null);
    }, CHEST_EXPIRE_MS);
    timeout.unref?.();
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire locked chest");
  }
}

// ─── Key chest ────────────────────────────────────────────────────────────────

export async function fireKeyChest(client: Client, guildId: string, keyType?: string, bypassGate = false): Promise<{ chestId: string } | null> {
  const gs = getOrCreateGuildState(guildId);
  if (gs.firingKeyChest) {
    logger.warn({ guildId }, "fireKeyChest already in progress, skipping duplicate trigger");
    return null;
  }
  if (!bypassGate && !isGuildActive(gs.lastActivityAt, ACTIVITY_WINDOW_MS)) {
    logger.debug({ guildId, lastActivityAt: gs.lastActivityAt, windowMinutes: ACTIVITY_WINDOW_MINUTES }, "Key-chest spawn skipped — no recent chat activity");
    return null;
  }
  gs.firingKeyChest = true;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!channel) return null;

    const kt = keyType && keyType !== "random" ? keyType : rollKeyChestType();
    const chestId = `keychest_${Date.now()}_${kt}`;
    const expiresAt = Date.now() + CHEST_EXPIRE_MS;

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("🗝️ Ia cheia")
        .setStyle(ButtonStyle.Primary),
    );

    const frames: Array<{ content: string; delay: number }> = [
      { content: "🌫️ *Ceva metalic zornăie în cenușă…*", delay: 800 },
      { content: "🗝️✨ *O cheie a fost găsită în umbre!*", delay: 900 },
    ];

    const msg = await channel.send({ content: frames[0]!.content });
    for (let i = 1; i < frames.length; i++) {
      await sleep(frames[i - 1]!.delay);
      await msg.edit({ content: frames[i]!.content }).catch(() => null);
    }
    await sleep(frames[frames.length - 1]!.delay);
    await msg.edit({ content: "", embeds: [buildKeyChestEmbed(kt)], components: [lockedRow] }).catch(() => null);

    await sleep(5000);
    if (!gs.claimedChests.has(chestId)) {
      await msg.edit({ embeds: [buildKeyChestEmbed(kt)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, keyType: kt, guildId }, "Key chest spawned");
    void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold: 0, rarityKey: kt, keyType: kt, kind: "keychest", expiresAt }, KEYCHEST_DBKEY).catch(() => null);

    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(chestId)) {
        gs.claimedChests.add(chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel("Cheia s-a topit în fum...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ components: [disabledRow] }).catch(() => null);
        logger.info({ chestId, guildId }, "Key chest expired unclaimed");
      }
      void clearActiveChest(guildId, KEYCHEST_DBKEY).catch(() => null);
    }, CHEST_EXPIRE_MS);
    timeout.unref?.();

    return { chestId };
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire key chest");
    return null;
  } finally {
    gs.firingKeyChest = false;
  }
}

// ─── Oracle / battle event ────────────────────────────────────────────────────

async function fireOracle(client: Client, guildId: string) {
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!channel) return;
    await channel.send({ content: oracleMessage() });
  } catch (err) {
    logger.error({ err, guildId }, "Failed to send oracle message");
  }
}

async function fireBattleEvent(client: Client, guildId: string) {
  try {
    const ev = await getLatestActiveEvent(guildId);
    if (!ev) return;
    const channel = await fetchChannel(client, "event", guildId);
    if (!channel) return;
    const battle = triggerRandomBattleEvent();
    const sent = await channel.send({ content: battle.announce });
    const ttl = Math.max(0, battle.expiresAt - Date.now());
    setTimeout(() => { void sent.delete().catch(() => {}); }, ttl);
    logger.info({ eventId: ev.id, battle: battle.key, guildId }, "Battle event triggered");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to trigger battle event");
  }
}

// ─── Per-guild scheduler startup ──────────────────────────────────────────────

export function startGuildScheduler(client: Client, guildId: string) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.started) {
    logger.info({ guildId }, "Guild scheduler already running — skipping re-init");
    return;
  }
  gs.stopped = false; // reset in case the bot had previously left and rejoined this guild
  gs.started = true;

  void rehydrateCouncilDecree(guildId).catch((err) =>
    logger.warn({ err, guildId }, "Council decree could not be rehydrated"),
  );
  void rehydrateActiveBosses(client, guildId);
  if (LEGACY_CHEST_SPAWNS_ENABLED) {
    void rehydrateActiveChest(client, guildId);
    void rehydrateSimpleChest(client, guildId, KEYCHEST_DBKEY);
    void rehydrateSimpleChest(client, guildId, LOCKCHEST_DBKEY);
  }
  void rehydrateSeasonalChest(client, guildId).catch((err) =>
    logger.warn({ err, guildId }, "Failed to rehydrate seasonal chest"),
  );
  void rehydrateFratiaVote(client, guildId).catch((err) =>
    logger.warn({ err, guildId }, "Failed to rehydrate Frăția vote"),
  );

  const isStopped = () => guildStates.get(guildId)?.stopped === true;

  setInterval(() => { if (!isStopped()) void expireOldEvents(client, guildId); }, 60 * 1000);
  setInterval(() => {
    if (!isStopped()) {
      void settleExpiredAuction(guildId).catch((err) =>
        logger.warn({ err, guildId }, "Failed to settle expired auction"),
      );
    }
  }, 60 * 1000);

  const scheduleNext = () => {
    if (isStopped()) return;
    const cooldown = randomCooldown();
    logger.info({ nextInHours: (cooldown / 3600000).toFixed(2), guildId }, "Next event scheduled");
    setTimeout(async () => { if (!isStopped()) { await fireEvent(client, guildId); scheduleNext(); } }, cooldown);
  };

  setTimeout(async () => { if (!isStopped()) { await fireEvent(client, guildId); scheduleNext(); } }, 5 * 60 * 1000);
  logger.info({ guildId }, "First Ora Umbrelor in 5 minutes");

  if (LEGACY_CHEST_SPAWNS_ENABLED) {
    setInterval(() => { if (!isStopped()) void fireChest(client, guildId); }, CHEST_INTERVAL_MS);
    logger.info({ everyMinutes: CHEST_INTERVAL_MS / 60000, guildId }, "Chest scheduler started — fixed interval");

    setTimeout(() => { if (!isStopped()) void fireKeyChest(client, guildId); }, 12 * 60 * 1000);
    setInterval(() => { if (!isStopped()) void fireKeyChest(client, guildId); }, KEY_CHEST_INTERVAL_MS);
    logger.info({ everyMinutes: KEY_CHEST_INTERVAL_MS / 60000, guildId }, "Key-chest scheduler started");
  } else {
    logger.info({ guildId }, "Legacy chest and key-chest schedulers disabled — new chest system remains active");
  }

  const seasonalInterval = SEASONAL_CHEST_INTERVAL_MS;
  const scheduleSeasonal = () => {
    if (isStopped()) return;
    const seasonalDelay = seasonalInterval - (Date.now() % seasonalInterval);
    const timer = setTimeout(async () => {
      if (!isStopped()) {
        await spawnSeasonalChest(client, guildId).catch((err) =>
          logger.warn({ err, guildId }, "Failed to spawn seasonal chest"),
        );
        scheduleSeasonal();
      }
    }, seasonalDelay);
    timer.unref?.();
  };
  scheduleSeasonal();

  // Oracle messages disabled — user requested only chest in chat
  // setInterval(() => { void fireOracle(client, guildId); }, ORACLE_INTERVAL_MS);

  setInterval(() => { if (!isStopped()) void fireBattleEvent(client, guildId); }, BATTLE_EVENT_INTERVAL_MS);
  logger.info({ everyMinutes: BATTLE_EVENT_INTERVAL_MS / 60000, guildId }, "Battle-event scheduler started");

  const scheduleNextStandaloneBoss = () => {
    if (isStopped()) return;
    const delay = STANDALONE_BOSS_MIN_MS +
      Math.floor(Math.random() * (STANDALONE_BOSS_MAX_MS - STANDALONE_BOSS_MIN_MS + 1));
    const t = setTimeout(async () => {
      if (!isStopped()) { await fireStandaloneBoss(client, guildId); scheduleNextStandaloneBoss(); }
    }, delay);
    t.unref?.();
    logger.info({ nextInMinutes: (delay / 60_000).toFixed(1), guildId }, "Next standalone boss scheduled");
  };
  scheduleNextStandaloneBoss();

  if (!hasAnyChannelConfigured(guildId)) {
    logger.warn(
      { guildId },
      "Guild has no channel config — scheduled events will be skipped on each tick until /setcanal is run by a server admin",
    );
  }

  void startTributeScheduler(client, guildId).catch((err) =>
    logger.warn({ err, guildId }, "Failed to start Tributul Regatului scheduler"),
  );

  const oracleChannelId = getChannel("main", guildId);
  if (oracleChannelId) {
    startOracle(client, oracleChannelId, guildId);
    startOracleCouncilScheduler(client, guildId, oracleChannelId, isStopped);
  }
}

export { APPLICATION_ID };
