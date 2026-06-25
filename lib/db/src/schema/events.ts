import { pgTable, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";

export const activeEventsTable = pgTable("active_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  eventType: text("event_type").notNull(),
  messageId: text("message_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActiveEvent = typeof activeEventsTable.$inferSelect;

export const eventClaimsTable = pgTable(
  "event_claims",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    eventId: integer("event_id").notNull(),
    discordId: text("discord_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.eventId, t.discordId)],
);
