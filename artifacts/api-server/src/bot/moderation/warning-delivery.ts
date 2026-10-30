import type { Guild } from "discord.js";
import { logger } from "../../lib/logger";

/**
 * Warnings are shown in their source guild channel. A private message comes
 * only from sanction-dm.ts, when the server turned it on in the panel.
 */
export async function deliverWarningInGuild(
  guild: Guild,
  channelId: string | undefined,
  targetId: string,
  explanation: string,
): Promise<boolean> {
  if (!channelId) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased() || !("send" in channel) || channel.guildId !== guild.id) return false;
  try {
    await channel.send({
      content: `⚠️ <@${targetId}>, ai primit un avertisment.\nMotiv: ${explanation}`,
      allowedMentions: { users: [targetId], parse: [] },
    });
    return true;
  } catch (error) {
    logger.warn({ error, guildId: guild.id, channelId }, "Moderation warning could not be posted in the guild channel");
    return false;
  }
}