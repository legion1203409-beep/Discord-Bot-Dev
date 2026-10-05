/** Dependency-free catalog shared by the bot and the message-customization UI. */
export const ACTIVITY_LOG_GROUPS = {
  messages: "Loguri de mesaje",
  members: "Loguri de membri",
  channels: "Loguri de canale",
  roles: "Loguri de roluri",
  voice: "Loguri de voce",
  moderation: "Loguri de moderare",
  security: "Loguri de securitate",
} as const;

export type ActivityLogGroup = keyof typeof ACTIVITY_LOG_GROUPS;
export type ActivityLogTextTemplate = { title: string; description: string };

export const ACTIVITY_LOG_TEMPLATES = [
  { key: "message_update", event: "discord.message_update", group: "messages", title: "Mesaj editat" },
  { key: "message_delete", event: "discord.message_delete", group: "messages", title: "Mesaj șters" },
  { key: "message_bulk_delete", event: "discord.message_bulk_delete", group: "messages", title: "Mesaje șterse în masă" },
  { key: "member_join", event: "discord.member_join", group: "members", title: "👋 Membru nou · a intrat pe server" },
  { key: "member_leave", event: "discord.member_leave", group: "members", title: "🚪 Membru a părăsit serverul" },
  { key: "member_update", event: "discord.member_update", group: "members", title: "Membru actualizat" },
  { key: "member_roles", event: "discord.member_update", group: "roles", title: "Rolurile membrului au fost schimbate" },
  { key: "voice_state_update", event: "discord.voice_state_update", group: "voice", title: "Stare vocală schimbată" },
  { key: "channel_create", event: "discord.channel_create", group: "channels", title: "Canal creat" },
  { key: "channel_update", event: "discord.channel_update", group: "channels", title: "Canal actualizat" },
  { key: "channel_delete", event: "discord.channel_delete", group: "channels", title: "Canal șters" },
  { key: "guild_role_create", event: "discord.guild_role_create", group: "roles", title: "Rol creat" },
  { key: "guild_role_update", event: "discord.guild_role_update", group: "roles", title: "Rol actualizat" },
  { key: "guild_role_delete", event: "discord.guild_role_delete", group: "roles", title: "Rol șters" },
  { key: "action_applied", event: "action.applied", group: "moderation", title: "Acțiune de moderare aplicată" },
  { key: "action_failed", event: "action.failed", group: "moderation", title: "Acțiune de moderare eșuată" },
  { key: "action_reconciled", event: "action.reconciled", group: "moderation", title: "Acțiune de moderare verificată" },
  { key: "action_finalized", event: "action.finalized", group: "moderation", title: "Rezultat de moderare confirmat" },
  { key: "automod_message_delete_failed", event: "automod.message_delete_failed", group: "security", title: "Ștergere AutoMod eșuată" },
  { key: "ai_flagged", event: "ai.flagged", group: "security", title: "Mesaj semnalat de moderarea AI" },
  { key: "spam_edit_burst", event: "spam.edit_burst", group: "security", title: "Editări repetate detectate" },
  { key: "spam_bulk_delete", event: "spam.bulk_delete", group: "security", title: "Ștergere în masă detectată" },
  { key: "spam_message_delete", event: "spam.message_delete", group: "security", title: "Ștergeri repetate detectate" },
  { key: "suspicious_delete_alert_only", event: "suspicious.delete_alert_only", group: "security", title: "Ștergeri fără sancțiune" },
  { key: "suspicious_join_leave_alert_only", event: "suspicious.join_leave_alert_only", group: "security", title: "Intrări și plecări suspecte" },
  { key: "suspicious_unusual_alert_only", event: "suspicious.unusual_alert_only", group: "security", title: "Activitate neobișnuită" },
  { key: "raid_detected", event: "raid.detected", group: "security", title: "Activitate anti-raid detectată" },
  { key: "raid_lockdown_failed", event: "raid.lockdown_failed", group: "security", title: "Blocare anti-raid eșuată" },
  { key: "event_action_failed", event: "event.action_failed", group: "security", title: "Acțiune automată eșuată" },
] as const satisfies ReadonlyArray<{ key: string; event: string; group: ActivityLogGroup; title: string }>;

export type ActivityLogTemplateKey = typeof ACTIVITY_LOG_TEMPLATES[number]["key"];
export const ACTIVITY_LOG_TEMPLATE_KEYS = ACTIVITY_LOG_TEMPLATES.map((item) => item.key) as [ActivityLogTemplateKey, ...ActivityLogTemplateKey[]];

export const ACTIVITY_LOG_VARIABLES = {
  common: ["guild", "event", "category", "title", "member", "moderator", "channel", "target", "action", "reason", "timestamp", "timestamp_relative", "details"],
  messages: ["before", "after", "content", "count"],
  members: ["member_name", "username", "old_nickname", "new_nickname"],
  channels: ["name", "changes"],
  roles: ["name", "roles_added", "roles_removed", "changes"],
  voice: ["old_channel", "new_channel"],
  moderation: ["duration", "count", "error"],
  security: ["count", "error"],
} as const;

export function activityLogTemplateKey(eventType: string, detail: Record<string, unknown>): ActivityLogTemplateKey | null {
  const event = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  if (event === "discord.member_update" && (detail.rolesChanged === true ||
      ["addedRoles", "removedRoles"].some((key) => Array.isArray(detail[key]) && detail[key].length > 0))) return "member_roles";
  return ACTIVITY_LOG_TEMPLATES.find((item) => item.event === event)?.key ?? null;
}

export function renderActivityLogText(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match);
}
