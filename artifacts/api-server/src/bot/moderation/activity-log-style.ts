/**
 * Cum arată un jurnal când se postează: o culoare și o iconiță pentru fiecare
 * fel de eveniment (verde pentru ce se adaugă, roșu pentru ce dispare, auriu
 * pentru ce se schimbă), ca să se deosebească dintr-o privire în canal.
 */
import type { ActivityLogCategory } from "../../moderation/config";

export type ActivityStyle = { color: number; emoji: string };

const GREEN = 0x36a878;
const RED = 0xd95050;
const GOLD = 0xd8a964;
const BLUE = 0x5865f2;
const ORANGE = 0xd46a3c;
const VIOLET = 0x8f5bff;

const BY_EVENT: Record<string, ActivityStyle> = {
  "discord.member_join": { color: GREEN, emoji: "👋" },
  "discord.member_leave": { color: RED, emoji: "🚪" },
  "discord.member_update": { color: GOLD, emoji: "🧑" },
  "discord.message_update": { color: GOLD, emoji: "✏️" },
  "discord.message_delete": { color: RED, emoji: "🗑️" },
  "discord.message_bulk_delete": { color: RED, emoji: "🧹" },
  "discord.channel_create": { color: GREEN, emoji: "➕" },
  "discord.channel_update": { color: GOLD, emoji: "🛠️" },
  "discord.channel_delete": { color: RED, emoji: "➖" },
  "discord.guild_role_create": { color: GREEN, emoji: "🎭" },
  "discord.guild_role_update": { color: GOLD, emoji: "🎭" },
  "discord.guild_role_delete": { color: RED, emoji: "🎭" },
  "discord.voice_state_update": { color: VIOLET, emoji: "🎙️" },
  "discord.guild_ban_add": { color: RED, emoji: "⛔" },
  "discord.guild_ban_remove": { color: GREEN, emoji: "🕊️" },
  "discord.invite_create": { color: GREEN, emoji: "🔗" },
  "discord.invite_delete": { color: RED, emoji: "🔗" },
  "discord.thread_create": { color: GREEN, emoji: "🧵" },
  "discord.thread_update": { color: GOLD, emoji: "🧵" },
  "discord.thread_delete": { color: RED, emoji: "🧵" },
  "discord.emoji_create": { color: GREEN, emoji: "😀" },
  "discord.emoji_update": { color: GOLD, emoji: "😀" },
  "discord.emoji_delete": { color: RED, emoji: "😀" },
  "discord.guild_update": { color: GOLD, emoji: "🏰" },
};

const BY_CATEGORY: Record<ActivityLogCategory, ActivityStyle> = {
  messages: { color: ORANGE, emoji: "💬" },
  members: { color: BLUE, emoji: "👥" },
  channels: { color: BLUE, emoji: "📚" },
  roles: { color: BLUE, emoji: "🎭" },
  voice: { color: VIOLET, emoji: "🎙️" },
  moderation: { color: 0xc38b3b, emoji: "🛡️" },
  security: { color: 0xd94a2b, emoji: "🚨" },
};

/** The style of an event; an event without its own look takes its category's. */
export function activityStyle(normalizedEvent: string, category: ActivityLogCategory): ActivityStyle {
  if (category === "security") return BY_CATEGORY.security;
  if (normalizedEvent === "discord.member_update" && category === "roles") return { color: GOLD, emoji: "🎭" };
  return BY_EVENT[normalizedEvent] ?? BY_CATEGORY[category];
}

export function categoryEmoji(category: ActivityLogCategory): string {
  return BY_CATEGORY[category].emoji;
}
