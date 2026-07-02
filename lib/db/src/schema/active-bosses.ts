import { pgTable, text, timestamp, bigint } from "drizzle-orm/pg-core";

// Persists in-progress boss fight state so a server restart doesn't wipe
// active fights. Keyed by eventId (which can be a large Date.now() timestamp
// for standalone bosses, hence bigint). The full BossState is stored as a
// JSON blob; Maps and Sets are encoded as arrays.
export const activeBossesTable = pgTable("active_bosses", {
  eventId: bigint("event_id", { mode: "number" }).primaryKey(),
  guildId: text("guild_id").notNull(),
  stateJson: text("state_json").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActiveBossRow = typeof activeBossesTable.$inferSelect;
