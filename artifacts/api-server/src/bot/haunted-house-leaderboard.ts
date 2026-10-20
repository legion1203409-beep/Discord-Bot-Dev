import type { Message, TextChannel } from "discord.js";
import {
  loadHauntedHouseLeaderboardMessage,
  saveHauntedHouseLeaderboardMessage,
} from "./db";

const MARKER_PREFIX = "\u2063hh-session:";
const MARKER_SUFFIX = "\u2063";
const publishQueues = new Map<string, Promise<void>>();
const knownMessages = new Map<string, { sessionId: string; channelId: string; messageId: string }>();
const finalizedSessions = new Set<string>();

function sessionMarker(sessionId: string): string {
  return `${MARKER_PREFIX}${sessionId}${MARKER_SUFFIX}`;
}

function isUnknownMessage(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 10008);
}

async function fetchSavedMessage(channel: TextChannel, messageId: string): Promise<Message | null> {
  try {
    return await channel.messages.fetch(messageId);
  } catch (error) {
    if (isUnknownMessage(error)) return null;
    throw error;
  }
}

async function publishNow(
  guildId: string,
  sessionId: string,
  channel: TextChannel,
  getContent: () => string,
  final: boolean,
): Promise<void> {
  if (channel.guildId !== guildId) throw new Error("Canalul clasamentului aparține altui server.");
  if (finalizedSessions.has(`${guildId}:${sessionId}`) && !final) return;
  const markedContent = `${getContent()}\n${sessionMarker(sessionId)}`;
  let ref = knownMessages.get(guildId);
  if (!ref) {
    ref = await loadHauntedHouseLeaderboardMessage(guildId) ?? undefined;
    if (ref) knownMessages.set(guildId, ref);
  }

  if (ref?.sessionId === sessionId && ref.channelId === channel.id) {
    const existing = await fetchSavedMessage(channel, ref.messageId);
    if (existing) {
      if (existing.guildId !== guildId || existing.channelId !== channel.id) {
        throw new Error("Mesajul salvat al clasamentului nu aparține canalului configurat.");
      }
      await existing.edit({ content: markedContent, allowedMentions: { parse: [] } });
      return;
    }
  }

  // Recover the narrow window where Discord accepted send(), but the process
  // stopped before the new message ID was persisted.
  const recentMessages = await channel.messages.fetch({ limit: 100 });
  const recovered = recentMessages.find((message) =>
    message.author.bot &&
    message.guildId === guildId &&
    message.channelId === channel.id &&
    message.content.includes(sessionMarker(sessionId)),
  );
  if (recovered) {
    await recovered.edit({ content: markedContent, allowedMentions: { parse: [] } });
    const recoveredRef = { sessionId, channelId: channel.id, messageId: recovered.id };
    knownMessages.set(guildId, recoveredRef);
    await saveHauntedHouseLeaderboardMessage(guildId, recoveredRef);
    return;
  }

  const sent = await channel.send({ content: markedContent, allowedMentions: { parse: [] } });
  const sentRef = { sessionId, channelId: channel.id, messageId: sent.id };
  // Cache before persistence so a transient DB error cannot make the next
  // in-process retry create a second message.
  knownMessages.set(guildId, sentRef);
  await saveHauntedHouseLeaderboardMessage(guildId, sentRef);
}

export function publishHauntedHouseLeaderboard(
  guildId: string,
  sessionId: string,
  channel: TextChannel,
  content: string | (() => string),
  final = false,
): Promise<void> {
  const sessionKey = `${guildId}:${sessionId}`;
  if (final) finalizedSessions.add(sessionKey);
  const previous = publishQueues.get(guildId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => {
    if (finalizedSessions.has(sessionKey) && !final) return;
    return publishNow(guildId, sessionId, channel, typeof content === "function" ? content : () => content, final);
  });
  publishQueues.set(guildId, current);
  void current.finally(() => {
    if (publishQueues.get(guildId) === current) publishQueues.delete(guildId);
  }).catch(() => undefined);
  return current;
}

export function resetHauntedHouseLeaderboardForTests(): void {
  publishQueues.clear();
  knownMessages.clear();
  finalizedSessions.clear();
}
