import { db } from "@workspace/db";
import { playersTable, activeEventsTable, eventParticipantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Player, EventParticipant } from "@workspace/db";

export async function upsertPlayer(discordId: string, username: string): Promise<Player> {
  const [existing] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  if (existing) {
    const [u] = await db.update(playersTable).set({ username }).where(eq(playersTable.discordId, discordId)).returning();
    return u!;
  }
  const [c] = await db.insert(playersTable).values({ discordId, username }).returning();
  return c!;
}

export async function addPlayerXp(discordId: string, xp: number): Promise<void> {
  const [p] = await db.select().from(playersTable).where(eq(playersTable.discordId, discordId));
  if (p) await db.update(playersTable).set({ xp: p.xp + xp }).where(eq(playersTable.discordId, discordId));
}

export async function createEvent(eventType: string, messageId: string, expiresAt: Date) {
  const [ev] = await db.insert(activeEventsTable).values({ eventType, messageId, expiresAt }).returning();
  return ev!;
}

export async function getActiveEvent(id: number) {
  const [ev] = await db.select().from(activeEventsTable).where(eq(activeEventsTable.id, id));
  return ev ?? null;
}

export async function deactivateEvent(id: number) {
  await db.update(activeEventsTable).set({ isActive: false }).where(eq(activeEventsTable.id, id));
}

export async function getExpiredActiveEvents() {
  const all = await db.select().from(activeEventsTable).where(eq(activeEventsTable.isActive, true));
  return all.filter((e) => e.expiresAt.getTime() < Date.now());
}

export async function joinEvent(eventId: number, discordId: string, username: string): Promise<EventParticipant | null> {
  const [existing] = await db.select().from(eventParticipantsTable)
    .where(and(eq(eventParticipantsTable.eventId, eventId), eq(eventParticipantsTable.discordId, discordId)));
  if (existing) return existing;
  try {
    const [p] = await db.insert(eventParticipantsTable).values({ eventId, discordId, username }).returning();
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

export async function getLatestActiveEvent() {
  const all = await db.select().from(activeEventsTable).where(eq(activeEventsTable.isActive, true));
  const valid = all.filter((e) => e.expiresAt.getTime() > Date.now());
  return valid.sort((a, b) => b.id - a.id)[0] ?? null;
}

export async function getTopPlayers(): Promise<Player[]> {
  const rows = await db.select().from(playersTable).orderBy(playersTable.xp);
  return rows.slice(-10).reverse();
}
