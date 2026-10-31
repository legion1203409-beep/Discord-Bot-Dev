/** The official community, whose public invite above is the default one. */
export const PUBLIC_DISCORD_GUILD_ID = "1382035307607883816";

export const DEFAULT_PUBLIC_DISCORD_INVITE = "https://discord.gg/regatulcenusii";

export const PUBLIC_DISCORD_INVITE =
  process.env.PUBLIC_DISCORD_INVITE?.trim() || DEFAULT_PUBLIC_DISCORD_INVITE;