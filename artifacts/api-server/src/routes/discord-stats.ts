export interface DiscordGuildCountSource {
  guilds: {
    fetch(options: {
      guild: string;
      withCounts: boolean;
      force: boolean;
    }): Promise<{
      approximatePresenceCount?: number | null;
      approximateMemberCount?: number | null;
      memberCount?: number | null;
    }>;
  };
}

export async function fetchDiscordGuildStats(
  client: DiscordGuildCountSource,
  guildId: string,
): Promise<{ onlineCount: number | null; totalMembers: number | null }> {
  // Discord.js otherwise returns the cached Guild object, which is populated
  // from the gateway and does not contain the REST approximate counts.
  const guild = await client.guilds.fetch({
    guild: guildId,
    withCounts: true,
    force: true,
  });

  return {
    onlineCount: guild.approximatePresenceCount ?? null,
    totalMembers: guild.approximateMemberCount ?? guild.memberCount ?? null,
  };
}