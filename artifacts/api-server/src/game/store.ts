import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  gameActionLedgerTable,
  gamePlayerSessionsTable,
  type GameGuildSnapshot,
  type GamePlayerSessionRow,
} from "@workspace/db";

const SESSION_TTL_MS = 8 * 60 * 60_000;

export type GamePlayerSession = Omit<GamePlayerSessionRow, "guilds"> & {
  guilds: GameGuildSnapshot[];
};

export function hashGameSessionToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createGamePlayerSession(
  userId: string,
  username: string,
  guilds: GameGuildSnapshot[],
): Promise<{ token: string; session: GamePlayerSession }> {
  const token = makeOpaqueToken();
  const [session] = await db.insert(gamePlayerSessionsTable).values({
    id: randomUUID(),
    userId,
    username,
    guilds,
    tokenHash: hashGameSessionToken(token),
    csrfToken: randomBytes(24).toString("base64url"),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  }).returning();
  if (!session) throw new Error("Could not create browser RPG session");
  return { token, session };
}

export async function getGamePlayerSession(tokenHash: string): Promise<GamePlayerSession | null> {
  const [session] = await db.update(gamePlayerSessionsTable)
    .set({ lastSeenAt: new Date() })
    .where(and(
      eq(gamePlayerSessionsTable.tokenHash, tokenHash),
      isNull(gamePlayerSessionsTable.revokedAt),
      gt(gamePlayerSessionsTable.expiresAt, new Date()),
    ))
    .returning();
  return session ?? null;
}

export async function revokeGamePlayerSession(tokenHash: string): Promise<void> {
  await db.update(gamePlayerSessionsTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(gamePlayerSessionsTable.tokenHash, tokenHash),
      isNull(gamePlayerSessionsTable.revokedAt),
    ));
}

export async function revokeGamePlayerSessionByToken(token: string): Promise<void> {
  await revokeGamePlayerSession(hashGameSessionToken(token));
}

export async function beginGameAction(input: {
  guildId: string;
  actorId: string;
  eventId: number;
  idempotencyKey: string;
  actionType: "join" | "attack";
}): Promise<{ created: boolean; action: typeof gameActionLedgerTable.$inferSelect | null }> {
  const [created] = await db.insert(gameActionLedgerTable)
    .values({ id: randomUUID(), ...input, status: "pending" })
    .onConflictDoNothing()
    .returning();
  if (created) return { created: true, action: created };

  const [existing] = await db.select().from(gameActionLedgerTable).where(and(
    eq(gameActionLedgerTable.guildId, input.guildId),
    eq(gameActionLedgerTable.actorId, input.actorId),
    eq(gameActionLedgerTable.idempotencyKey, input.idempotencyKey),
  ));
  return { created: false, action: existing ?? null };
}

export async function completeGameAction(
  id: string,
  result: Record<string, unknown>,
): Promise<void> {
  await db.update(gameActionLedgerTable)
    .set({ status: "completed", result, updatedAt: new Date() })
    .where(eq(gameActionLedgerTable.id, id));
}

export async function failGameAction(id: string): Promise<void> {
  await db.update(gameActionLedgerTable)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(gameActionLedgerTable.id, id));
}
