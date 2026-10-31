import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export interface GameGuildSnapshot {
  id: string;
  name: string;
  iconUrl: string | null;
}

export const gamePlayerSessionsTable = pgTable(
  "game_player_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    guilds: jsonb("guilds").$type<GameGuildSnapshot[]>().notNull().default([]),
    tokenHash: text("token_hash").notNull().unique(),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("game_player_sessions_token_idx").on(table.tokenHash)],
);

export const gameActionLedgerTable = pgTable(
  "game_action_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    actorId: text("actor_id").notNull(),
    eventId: integer("event_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actionType: text("action_type").notNull(),
    status: text("status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("game_action_ledger_actor_key_unique").on(
      table.guildId,
      table.actorId,
      table.idempotencyKey,
    ),
    index("game_action_ledger_guild_event_idx").on(table.guildId, table.eventId),
  ],
);

export type GamePlayerSessionRow = typeof gamePlayerSessionsTable.$inferSelect;
export type GameActionLedgerRow = typeof gameActionLedgerTable.$inferSelect;
