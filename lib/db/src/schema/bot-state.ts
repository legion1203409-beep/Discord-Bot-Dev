import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const botStateTable = pgTable("bot_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BotState = typeof botStateTable.$inferSelect;
