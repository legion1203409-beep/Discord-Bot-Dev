import { db } from "@workspace/db";
import { playersTable, activeEventsTable, eventClaimsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Player } from "@workspace/db";

export async function upsertPlayer(discordId: string, username: string): Promise<Player> {
  const existing = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  if (existing[0]) {
    const [updated] = await db
      .update(playersTable)
      .set({ username })
      .where(eq(playersTable.discordId, discordId))
      .returning();
    return updated!;
  }
  const [created] = await db.insert(playersTable).values({ discordId, username }).returning();
  return created!;
}

export async function applyRewards(
  discordId: string,
  delta: { xp: number; gold: number; reputation: number; hpChange: number },
): Promise<Player> {
  const [player] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  if (!player) throw new Error("Player not found");

  const newHp = Math.max(1, Math.min(100, player.hp + delta.hpChange));
  const [updated] = await db
    .update(playersTable)
    .set({
      xp: Math.max(0, player.xp + delta.xp),
      gold: Math.max(0, player.gold + delta.gold),
      reputation: Math.max(0, player.reputation + delta.reputation),
      hp: newHp,
    })
    .where(eq(playersTable.discordId, discordId))
    .returning();
  return updated!;
}

export async function createEvent(
  eventType: string,
  messageId: string,
  expiresAt: Date,
) {
  const [ev] = await db
    .insert(activeEventsTable)
    .values({ eventType, messageId, expiresAt })
    .returning();
  return ev!;
}

export async function getActiveEvent(id: number) {
  const [ev] = await db.select().from(activeEventsTable).where(eq(activeEventsTable.id, id));
  return ev ?? null;
}

export async function deactivateEvent(id: number) {
  await db.update(activeEventsTable).set({ isActive: false }).where(eq(activeEventsTable.id, id));
}

export async function claimEvent(eventId: number, discordId: string): Promise<boolean> {
  try {
    await db.insert(eventClaimsTable).values({ eventId, discordId });
    return true;
  } catch {
    return false;
  }
}

export async function hasClaimedEvent(eventId: number, discordId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(eventClaimsTable)
    .where(and(eq(eventClaimsTable.eventId, eventId), eq(eventClaimsTable.discordId, discordId)));
  return rows.length > 0;
}

export async function getExpiredActiveEvents() {
  const all = await db.select().from(activeEventsTable).where(eq(activeEventsTable.isActive, true));
  const now = Date.now();
  return all.filter((e) => e.expiresAt.getTime() < now);
}
