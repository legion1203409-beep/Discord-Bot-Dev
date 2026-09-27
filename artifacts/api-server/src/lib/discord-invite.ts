export const DEFAULT_PUBLIC_DISCORD_INVITE = "https://discord.gg/regatulcenusii";

export const PUBLIC_DISCORD_INVITE =
  process.env.PUBLIC_DISCORD_INVITE?.trim() || DEFAULT_PUBLIC_DISCORD_INVITE;