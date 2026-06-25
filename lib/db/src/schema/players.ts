import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  discordId: text("discord_id").primaryKey(),
  username: text("username").notNull(),
  xp: integer("xp").notNull().default(0),
  gold: integer("gold").notNull().default(0),
  reputation: integer("reputation").notNull().default(0),
  hp: integer("hp").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
