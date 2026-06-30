import { db, pool } from "@workspace/db";
import { playersTable, activeEventsTable, eventParticipantsTable, eventClaimsTable, botStateTable, activeBossesTable } from "@workspace/db";
import type { ActiveBossRow } from "@workspace/db";
import { eq, and, gte, gt, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Player, EventParticipant } from "@workspace/db";
import { CLASSES, isClassKey, rollRarity, isCompanionKey, companionStats } from "./survival";

export type UpgradeKey = "atac" | "def" | "dodge" | "crit" | "hp";

export async function upsertPlayer(discordId: string, username: string): Promise<Player> {
  const [existing] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  if (existing) {
    const [u] = await db.update(playersTable).set({ username }).where(eq(playersTable.discordId, discordId)).returning();
    return u!;
  }
  const [c] = await db.insert(playersTable).values({ discordId, username }).returning();
  return c!;
}

export async function recordPlayerDeath(discordId: string, deathLevel: number): Promise<void> {
  const [p] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  if (!p) return;
  await db.update(playersTable)
    .set({ deaths: p.deaths + 1, deathLevel })
    .where(eq(playersTable.discordId, discordId));
}

export async function recordPlayerRetreat(discordId: string, retreatLevel: number): Promise<void> {
  const [p] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  if (!p) return;
  await db.update(playersTable)
    .set({ retreats: p.retreats + 1, retreatLevel })
    .where(eq(playersTable.discordId, discordId));
}

export async function getPlayerById(discordId: string): Promise<Player | null> {
  const [p] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  return p ?? null;
}

export async function updateMaxLevel(discordId: string, level: number): Promise<void> {
  await db.update(playersTable)
    .set({ maxLevel: sql`GREATEST(${playersTable.maxLevel}, ${level})` })
    .where(eq(playersTable.discordId, discordId));
}

// Permanent: only sets the class if the player has none yet. Returns the
// updated player, or null if a class was already chosen.
export async function setPlayerClass(discordId: string, classKey: string): Promise<Player | null> {
  if (!isClassKey(classKey)) return null;
  const [u] = await db.update(playersTable)
    .set({ class: classKey })
    .where(and(eq(playersTable.discordId, discordId), sql`${playersTable.class} IS NULL`))
    .returning();
  return u ?? null;
}

// Buys a companion with Oboli (gold). Permanent: only if the player has none
// yet and can afford it. Returns the updated player, or null on failure.
export async function buyCompanion(discordId: string, companionKey: string, cost: number): Promise<Player | null> {
  if (!isCompanionKey(companionKey)) return null;
  const [u] = await db.update(playersTable)
    .set({ companion: companionKey, companionLevel: 1, gold: sql`${playersTable.gold} - ${cost}` })
    .where(and(eq(playersTable.discordId, discordId), sql`${playersTable.companion} IS NULL`, gte(playersTable.gold, cost)))
    .returning();
  return u ?? null;
}

// Upgrades the owned companion: consumes Oboli + XP, raises companion_level.
// `expectedLevel` guards against concurrent clicks paying the same lower tier:
// the row only updates if its level still matches the one the price was based on.
export async function upgradeCompanion(discordId: string, expectedLevel: number, cost: number, xpCost: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({
      companionLevel: sql`${playersTable.companionLevel} + 1`,
      gold: sql`${playersTable.gold} - ${cost}`,
      xp: sql`${playersTable.xp} - ${xpCost}`,
    })
    .where(and(
      eq(playersTable.discordId, discordId),
      sql`${playersTable.companion} IS NOT NULL`,
      eq(playersTable.companionLevel, expectedLevel),
      gte(playersTable.gold, cost),
      gte(playersTable.xp, xpCost),
    ))
    .returning();
  return u ?? null;
}

export type AbilityKind = "empower" | "shield";

// Unlocks an ability (level 0 → 1) with Oboli. Returns null if already owned
// or unaffordable.
export async function buyAbility(discordId: string, kind: AbilityKind, cost: number): Promise<Player | null> {
  const col = kind === "empower" ? playersTable.abilityEmpowerLevel : playersTable.abilityShieldLevel;
  const setObj = kind === "empower" ? { abilityEmpowerLevel: 1 } : { abilityShieldLevel: 1 };
  const [u] = await db.update(playersTable)
    .set({ ...setObj, gold: sql`${playersTable.gold} - ${cost}` })
    .where(and(eq(playersTable.discordId, discordId), eq(col, 0), gte(playersTable.gold, cost)))
    .returning();
  return u ?? null;
}

// Upgrades an owned ability: consumes Oboli + XP, raises its level.
// `expectedLevel` guards against concurrent clicks paying the same lower tier.
export async function upgradeAbility(discordId: string, kind: AbilityKind, expectedLevel: number, cost: number, xpCost: number): Promise<Player | null> {
  const col = kind === "empower" ? playersTable.abilityEmpowerLevel : playersTable.abilityShieldLevel;
  const setObj = kind === "empower"
    ? { abilityEmpowerLevel: sql`${playersTable.abilityEmpowerLevel} + 1` }
    : { abilityShieldLevel: sql`${playersTable.abilityShieldLevel} + 1` };
  const [u] = await db.update(playersTable)
    .set({ ...setObj, gold: sql`${playersTable.gold} - ${cost}`, xp: sql`${playersTable.xp} - ${xpCost}` })
    .where(and(eq(playersTable.discordId, discordId), eq(col, expectedLevel), gte(col, 1), gte(playersTable.gold, cost), gte(playersTable.xp, xpCost)))
    .returning();
  return u ?? null;
}

// Mirrors a freshly-bought/upgraded ability level onto the active participant so
// it becomes usable in the current fight (participants snapshot at join time).
export async function applyAbilityLevelToActiveParticipant(discordId: string, kind: AbilityKind, level: number): Promise<void> {
  const activeIds = db
    .select({ id: activeEventsTable.id })
    .from(activeEventsTable)
    .where(and(eq(activeEventsTable.isActive, true), gt(activeEventsTable.expiresAt, new Date())));
  const setObj = kind === "empower" ? { empowerLevel: level } : { shieldLevel: level };
  await db.update(eventParticipantsTable)
    .set(setObj)
    .where(and(
      eq(eventParticipantsTable.discordId, discordId),
      eq(eventParticipantsTable.isAlive, true),
      inArray(eventParticipantsTable.eventId, activeIds),
    ));
}

export async function setHonorTitle(discordId: string, title: string): Promise<void> {
  await db.update(playersTable).set({ honorTitle: title }).where(eq(playersTable.discordId, discordId));
}

// Records a one-time final-boss hit using the unique (eventId, discordId)
// claim row. Returns true only on the first hit per player per event.
export async function recordFinalBossHit(eventId: number, discordId: string): Promise<boolean> {
  try {
    const [row] = await db.insert(eventClaimsTable)
      .values({ eventId, discordId })
      .onConflictDoNothing()
      .returning();
    return !!row;
  } catch {
    return false;
  }
}

export async function addPlayerGold(discordId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ gold: sql`${playersTable.gold} + ${amount}` })
    .where(eq(playersTable.discordId, discordId));
}

export async function deductPlayerGold(discordId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ gold: sql`GREATEST(0, ${playersTable.gold} - ${amount})` })
    .where(eq(playersTable.discordId, discordId));
}

export const UPGRADE_DELTA: Record<UpgradeKey, number> = { atac: 2, def: 2, dodge: 3, crit: 2, hp: 10 };

const UPGRADE_SET: Record<UpgradeKey, Record<string, SQL>> = {
  atac: { attackBonus: sql`${playersTable.attackBonus} + ${UPGRADE_DELTA.atac}`, shopAttackCount: sql`${playersTable.shopAttackCount} + 1` },
  def: { defenseBonus: sql`${playersTable.defenseBonus} + ${UPGRADE_DELTA.def}`, shopDefenseCount: sql`${playersTable.shopDefenseCount} + 1` },
  dodge: { dodgeBonus: sql`${playersTable.dodgeBonus} + ${UPGRADE_DELTA.dodge}`, shopDodgeCount: sql`${playersTable.shopDodgeCount} + 1` },
  crit: { critBonus: sql`${playersTable.critBonus} + ${UPGRADE_DELTA.crit}`, shopCritCount: sql`${playersTable.shopCritCount} + 1` },
  hp: { maxHpBonus: sql`${playersTable.maxHpBonus} + ${UPGRADE_DELTA.hp}`, shopHpCount: sql`${playersTable.shopHpCount} + 1` },
};

// Mirrors UPGRADE_SET deltas onto the active event participant so a mid-event
// purchase takes effect in the current fight (the participant snapshots player
// bonuses at join time and would otherwise stay stale until the next event).
const PARTICIPANT_UPGRADE_SET: Record<UpgradeKey, Record<string, SQL>> = {
  atac: { attackBonus: sql`${eventParticipantsTable.attackBonus} + ${UPGRADE_DELTA.atac}` },
  def: { defenseBonus: sql`${eventParticipantsTable.defenseBonus} + ${UPGRADE_DELTA.def}` },
  dodge: { dodgeBonus: sql`${eventParticipantsTable.dodgeBonus} + ${UPGRADE_DELTA.dodge}` },
  crit: { critBonus: sql`${eventParticipantsTable.critBonus} + ${UPGRADE_DELTA.crit}` },
  hp: {
    maxHp: sql`${eventParticipantsTable.maxHp} + ${UPGRADE_DELTA.hp}`,
    currentHp: sql`${eventParticipantsTable.currentHp} + ${UPGRADE_DELTA.hp}`,
  },
};

export async function buyPlayerUpgrade(discordId: string, key: UpgradeKey, cost: number): Promise<Player | null> {
  const [u] = await db.update(playersTable)
    .set({ gold: sql`${playersTable.gold} - ${cost}`, ...UPGRADE_SET[key] })
    .where(and(eq(playersTable.discordId, discordId), gte(playersTable.gold, cost)))
    .returning();
  return u ?? null;
}

export async function applyUpgradeToActiveParticipant(discordId: string, key: UpgradeKey): Promise<void> {
  const activeIds = db
    .select({ id: activeEventsTable.id })
    .from(activeEventsTable)
    .where(and(eq(activeEventsTable.isActive, true), gt(activeEventsTable.expiresAt, new Date())));
  await db.update(eventParticipantsTable)
    .set(PARTICIPANT_UPGRADE_SET[key])
    .where(and(
      eq(eventParticipantsTable.discordId, discordId),
      eq(eventParticipantsTable.isAlive, true),
      inArray(eventParticipantsTable.eventId, activeIds),
    ));
}

export async function createEvent(type: string, messageId: string, expiresAt: Date) {
  const [ev] = await db.insert(activeEventsTable).values({ eventType: type, messageId, expiresAt }).returning();
  return ev!;
}

export async function getActiveEvent(id: number) {
  const [ev] = await db.select().from(activeEventsTable).where(eq(activeEventsTable.id, id));
  return ev ?? null;
}

export async function getLatestActiveEvent() {
  const all = await db.select().from(activeEventsTable).where(eq(activeEventsTable.isActive, true));
  const valid = all.filter((e) => e.expiresAt.getTime() > Date.now());
  return valid.sort((a, b) => b.id - a.id)[0] ?? null;
}

export async function getExpiredActiveEvents() {
  const all = await db.select().from(activeEventsTable).where(eq(activeEventsTable.isActive, true));
  return all.filter((e) => e.expiresAt.getTime() < Date.now());
}

export async function getAllEvents() {
  return db.select().from(activeEventsTable);
}

export async function setEventDecreeMessage(id: number, decreeMessageId: string) {
  await db.update(activeEventsTable).set({ decreeMessageId }).where(eq(activeEventsTable.id, id));
}

export async function deleteEvent(id: number) {
  await db.delete(eventParticipantsTable).where(eq(eventParticipantsTable.eventId, id));
  await db.delete(activeEventsTable).where(eq(activeEventsTable.id, id));
}

export async function deactivateEvent(id: number) {
  await db.update(activeEventsTable).set({ isActive: false }).where(eq(activeEventsTable.id, id));
}

export async function joinEvent(eventId: number, discordId: string, username: string): Promise<EventParticipant | null> {
  const [existing] = await db.select().from(eventParticipantsTable)
    .where(and(eq(eventParticipantsTable.eventId, eventId), eq(eventParticipantsTable.discordId, discordId)));
  if (existing) return existing;
  const player = await getPlayerById(discordId);
  const cls = player?.class && isClassKey(player.class) ? CLASSES[player.class] : null;
  const comp = player?.companion && isCompanionKey(player.companion)
    ? companionStats(player.companion, player.companionLevel ?? 1)
    : null;
  const maxHp = 100 + (player?.maxHpBonus ?? 0) + (cls?.hp ?? 0) + (comp?.hp ?? 0);
  try {
    const [p] = await db.insert(eventParticipantsTable).values({
      eventId,
      discordId,
      username,
      maxHp,
      currentHp: maxHp,
      monsterRarity: rollRarity(1),
      attackBonus: (player?.attackBonus ?? 0) + (cls?.attack ?? 0) + (comp?.attack ?? 0),
      defenseBonus: (player?.defenseBonus ?? 0) + (comp?.defense ?? 0),
      dodgeBonus: (player?.dodgeBonus ?? 0) + (cls?.dodge ?? 0),
      critBonus: (player?.critBonus ?? 0) + (cls?.crit ?? 0) + (comp?.crit ?? 0),
      empowerLevel: player?.abilityEmpowerLevel ?? 0,
      shieldLevel: player?.abilityShieldLevel ?? 0,
    }).returning();
    return p!;
  } catch { return null; }
}

export async function getParticipant(eventId: number, discordId: string): Promise<EventParticipant | null> {
  const [p] = await db.select().from(eventParticipantsTable)
    .where(and(eq(eventParticipantsTable.eventId, eventId), eq(eventParticipantsTable.discordId, discordId)));
  return p ?? null;
}

export async function updateParticipant(id: number, values: Partial<Omit<EventParticipant, "id" | "eventId" | "discordId" | "joinedAt">>): Promise<EventParticipant> {
  const [u] = await db.update(eventParticipantsTable).set(values).where(eq(eventParticipantsTable.id, id)).returning();
  return u!;
}

export async function getEventParticipants(eventId: number): Promise<EventParticipant[]> {
  return db.select().from(eventParticipantsTable).where(eq(eventParticipantsTable.eventId, eventId));
}

export async function addPlayerReputation(discordId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ reputation: sql`${playersTable.reputation} + ${amount}` })
    .where(eq(playersTable.discordId, discordId));
}

export async function addPlayerXp(discordId: string, amount: number): Promise<void> {
  await db.update(playersTable)
    .set({ xp: sql`${playersTable.xp} + ${amount}` })
    .where(eq(playersTable.discordId, discordId));
}

export async function getTopPlayers(): Promise<Player[]> {
  const rows = await db.select().from(playersTable).orderBy(playersTable.xp);
  return rows.slice(-10).reverse();
}


// ─── Key inventory ────────────────────────────────────────────────────────────
export type KeyType = "rar" | "epic" | "regal";

export async function getPlayerKeys(discordId: string): Promise<{ rar: number; epic: number; regal: number } | null> {
  const [p] = await db.select({
    keyRar: playersTable.keyRar,
    keyEpic: playersTable.keyEpic,
    keyRegal: playersTable.keyRegal,
  }).from(playersTable).where(eq(playersTable.discordId, discordId));
  if (!p) return null;
  return { rar: p.keyRar, epic: p.keyEpic, regal: p.keyRegal };
}

export async function addPlayerKey(discordId: string, keyType: KeyType): Promise<void> {
  const setObj =
    keyType === "rar"   ? { keyRar:   sql`${playersTable.keyRar}   + 1` } :
    keyType === "epic"  ? { keyEpic:  sql`${playersTable.keyEpic}  + 1` } :
                          { keyRegal: sql`${playersTable.keyRegal} + 1` };
  await db.update(playersTable).set(setObj).where(eq(playersTable.discordId, discordId));
}

// Returns true if a key was consumed, false if the player had none.
export async function consumePlayerKey(discordId: string, keyType: KeyType): Promise<boolean> {
  const col =
    keyType === "rar"   ? playersTable.keyRar   :
    keyType === "epic"  ? playersTable.keyEpic  :
                          playersTable.keyRegal;
  const setObj =
    keyType === "rar"   ? { keyRar:   sql`${playersTable.keyRar}   - 1` } :
    keyType === "epic"  ? { keyEpic:  sql`${playersTable.keyEpic}  - 1` } :
                          { keyRegal: sql`${playersTable.keyRegal} - 1` };
  const [u] = await db.update(playersTable)
    .set(setObj)
    .where(and(eq(playersTable.discordId, discordId), gte(col, 1)))
    .returning();
  return u != null;
}

// ─── Active boss persistence ───────────────────────────────────────────────────
// Creates the active_bosses table if it doesn't exist yet. Called once at bot
// startup so schema changes apply without a manual migration step.
export async function createActiveBossesTableIfNotExists(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_bosses (
      event_id  bigint      PRIMARY KEY,
      state_json text       NOT NULL,
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

// Ensure the durable key/value store exists. The production DB may not have had
// the Drizzle migration applied, so chest rehydration, the Oracle recovery
// marker and the trader message ID all fail with `relation "bot_state" does not
// exist`. Creating it idempotently at startup self-heals a missing migration.
export async function createBotStateTableIfNotExists(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key        text        PRIMARY KEY,
      value      text        NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

// Cached promise so the CREATE TABLE runs at most once, regardless of which
// bot_state-dependent path fires first (ShardReady trader setup, ClientReady
// rehydration, or the login-error Oracle marker). Every bot_state helper awaits
// this first, so a missing migration can never surface as a runtime query error.
// On failure the cache is reset so a later call retries.
let botStateTableReady: Promise<void> | null = null;
export function ensureBotStateTable(): Promise<void> {
  if (!botStateTableReady) {
    botStateTableReady = createBotStateTableIfNotExists().catch((err) => {
      botStateTableReady = null;
      throw err;
    });
  }
  return botStateTableReady;
}

// Upsert the serialized boss state. Called after every meaningful change so
// a restart can reconstruct the fight from the latest snapshot.
export async function persistActiveBoss(eventId: number, stateJson: string, expiresAt: Date): Promise<void> {
  const now = new Date();
  await db.insert(activeBossesTable)
    .values({ eventId, stateJson, expiresAt, updatedAt: now })
    .onConflictDoUpdate({
      target: activeBossesTable.eventId,
      set: { stateJson, expiresAt, updatedAt: now },
    });
}

// Load all persisted rows — used on startup to rehydrate activeBossMap.
export async function loadAllActiveBossRows(): Promise<ActiveBossRow[]> {
  return db.select().from(activeBossesTable);
}

// Remove a row once a boss is defeated or flees. Idempotent.
export async function deleteActiveBoss(eventId: number): Promise<void> {
  await db.delete(activeBossesTable).where(eq(activeBossesTable.eventId, eventId));
}

// Durable marker (in the DB, not os.tmpdir()) recording that the Oracle fell
// back to degraded reply mode because the "Message Content" portal toggle was
// missing (code 4014). Stored in the DB so the state survives a full redeploy
// or autoscale instance swap — a fresh container wipes os.tmpdir(), which would
// otherwise silently drop the pending recovery alert.
const ORACLE_FELLBACK_KEY = "oracle_fellback";

// Record that the Oracle fell back, so a later full-mode boot can confirm the
// recovery. Idempotent — repeated fallbacks just refresh the timestamp.
export async function recordOracleFellBack(): Promise<void> {
  await ensureBotStateTable();
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key: ORACLE_FELLBACK_KEY, value: now.toISOString() })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: now.toISOString(), updatedAt: now },
    });
}

// Atomically clear the fallback marker and report whether one was set. The
// DELETE ... RETURNING is atomic, so if several boots race (autoscale), only
// the boot that actually removed the row sees `true` — no duplicate alerts.
export async function consumeOracleFellBack(): Promise<boolean> {
  await ensureBotStateTable();
  const [deleted] = await db
    .delete(botStateTable)
    .where(eq(botStateTable.key, ORACLE_FELLBACK_KEY))
    .returning();
  return deleted != null;
}

// ─── Active chest persistence ─────────────────────────────────────────────────
// Persists the currently-live chest message so it can be expired cleanly on
// restart instead of leaving a stale interactive button in Discord.

const ACTIVE_CHEST_KEY = "active_chest";

/** DB key constants for each chest variant — exported for use in scheduler. */
export const CHEST_DBKEY     = "active_chest";
export const KEYCHEST_DBKEY  = "active_keychest";
export const LOCKCHEST_DBKEY = "active_lockchest";

export interface ActiveChestRecord {
  messageId: string;
  channelId: string;
  chestId: string;
  gold: number;
  rarityKey: string;
  /** Admin-forced multiplier (×2/×3). Absent for scheduler chests. */
  mult?: 2 | 3;
  /** Expiry epoch ms — when the chest button should be disabled. */
  expiresAt: number;
  /** Chest variant — drives expiry label and embed choice during rehydration. */
  kind?: "chest" | "keychest" | "lockchest";
  /** Key type for key-chest records (e.g. "rar", "epic", "regal"). */
  keyType?: string;
}

// ── Trader message ID persistence ───────────────────────────────────────────
const TRADER_MESSAGE_KEY = "trader_message_id";

export async function saveTraderMessageId(messageId: string): Promise<void> {
  await ensureBotStateTable();
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key: TRADER_MESSAGE_KEY, value: messageId })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: messageId, updatedAt: now },
    });
}

export async function loadTraderMessageId(): Promise<string | null> {
  await ensureBotStateTable();
  const [row] = await db.select().from(botStateTable).where(eq(botStateTable.key, TRADER_MESSAGE_KEY));
  return row?.value ?? null;
}

export async function clearTraderMessageId(): Promise<void> {
  await ensureBotStateTable();
  await db.delete(botStateTable).where(eq(botStateTable.key, TRADER_MESSAGE_KEY));
}

export async function persistActiveChest(record: ActiveChestRecord, dbKey = ACTIVE_CHEST_KEY): Promise<void> {
  await ensureBotStateTable();
  const now = new Date();
  await db
    .insert(botStateTable)
    .values({ key: dbKey, value: JSON.stringify(record) })
    .onConflictDoUpdate({
      target: botStateTable.key,
      set: { value: JSON.stringify(record), updatedAt: now },
    });
}

export async function loadActiveChest(dbKey = ACTIVE_CHEST_KEY): Promise<ActiveChestRecord | null> {
  await ensureBotStateTable();
  const [row] = await db.select().from(botStateTable).where(eq(botStateTable.key, dbKey));
  if (!row) return null;
  try {
    return JSON.parse(row.value) as ActiveChestRecord;
  } catch {
    return null;
  }
}

export async function clearActiveChest(dbKey = ACTIVE_CHEST_KEY): Promise<void> {
  await ensureBotStateTable();
  await db.delete(botStateTable).where(eq(botStateTable.key, dbKey));
}
