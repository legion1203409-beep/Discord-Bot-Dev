import { db } from "@workspace/db";
import { playersTable, activeEventsTable, eventParticipantsTable, eventClaimsTable } from "@workspace/db";
import { eq, and, gte, gt, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Player, EventParticipant } from "@workspace/db";
import { CLASSES, isClassKey, rollRarity } from "./survival";

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
  const maxHp = 100 + (player?.maxHpBonus ?? 0) + (cls?.hp ?? 0);
  try {
    const [p] = await db.insert(eventParticipantsTable).values({
      eventId,
      discordId,
      username,
      maxHp,
      currentHp: maxHp,
      monsterRarity: rollRarity(1),
      attackBonus: (player?.attackBonus ?? 0) + (cls?.attack ?? 0),
      defenseBonus: player?.defenseBonus ?? 0,
      dodgeBonus: (player?.dodgeBonus ?? 0) + (cls?.dodge ?? 0),
      critBonus: (player?.critBonus ?? 0) + (cls?.crit ?? 0),
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
