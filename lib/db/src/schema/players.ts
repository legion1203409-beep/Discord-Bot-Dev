import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  discordId: text("discord_id").primaryKey(),
  username: text("username").notNull(),
  gold: integer("gold").notNull().default(100),
  arcasi: integer("arcasi").notNull().default(0),
  cavaleri: integer("cavaleri").notNull().default(0),
  nivelMina: integer("nivel_mina").notNull().default(1),
  ultimaAdunare: timestamp("ultima_adunare", { withTimezone: true }).notNull().defaultNow(),
  victorii: integer("victorii").notNull().default(0),
  infrangeri: integer("infrangeri").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  nivel: integer("nivel").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({
  createdAt: true,
  ultimaAdunare: true,
});
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
