import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const discordServerSetupTable = pgTable("discord_server_setup", {
  guildId: text("guild_id").primaryKey(),
  journal: jsonb("journal").notNull().default({}),
});
