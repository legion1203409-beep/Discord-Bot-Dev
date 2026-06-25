import { pgTable, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";

export const eventParticipantsTable = pgTable(
  "event_participants",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    eventId: integer("event_id").notNull(),
    discordId: text("discord_id").notNull(),
    username: text("username").notNull(),
    currentHp: integer("current_hp").notNull().default(100),
    maxHp: integer("max_hp").notNull().default(100),
    monsterLevel: integer("monster_level").notNull().default(1),
    monsterCurrentHp: integer("monster_current_hp").notNull().default(55),
    totalDamage: integer("total_damage").notNull().default(0),
    oboli: integer("oboli").notNull().default(0),
    attackBonus: integer("attack_bonus").notNull().default(0),
    defenseBonus: integer("defense_bonus").notNull().default(0),
    dodgeBonus: integer("dodge_bonus").notNull().default(0),
    critBonus: integer("crit_bonus").notNull().default(0),
    shopAttackCount: integer("shop_attack_count").notNull().default(0),
    shopDefenseCount: integer("shop_defense_count").notNull().default(0),
    shopDodgeCount: integer("shop_dodge_count").notNull().default(0),
    shopCritCount: integer("shop_crit_count").notNull().default(0),
    shopHpCount: integer("shop_hp_count").notNull().default(0),
    isAlive: boolean("is_alive").notNull().default(true),
    fled: boolean("fled").notNull().default(false),
    pendingLevelup: boolean("pending_levelup").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.eventId, t.discordId)],
);

export type EventParticipant = typeof eventParticipantsTable.$inferSelect;
