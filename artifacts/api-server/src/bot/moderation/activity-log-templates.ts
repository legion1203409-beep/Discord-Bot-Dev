import { ACTIVITY_LOG_GROUPS, renderActivityLogText, type ActivityLogGroup } from "../../moderation/activity-log-template-definitions";
import { renderMemberActivityTemplate, type ActivityLogPresentation } from "./activity-log-presentation";

function text(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map(text).join(", ").slice(0, 1000);
  if (typeof value === "object") return "—";
  return String(value).replace(/@/g, "@\u200b").replace(/`/g, "ˋ").slice(0, 1000);
}

/** Text-only customization never changes destinations, evidence fields or verified identity. */
export function renderActivityLogTemplate(template: string, context: {
  guildName: string; category: ActivityLogGroup; eventType: string; defaultTitle: string;
  targetType: string; targetId: string; detail: Record<string, unknown>; presentation: ActivityLogPresentation;
  now?: number;
}): string {
  const { detail, targetId, targetType, eventType, presentation } = context;
  const now = context.now ?? Date.now();
  const memberTarget = targetType === "member" || targetType === "user";
  const authorId = detail.displayMessageAuthorId ?? detail.targetAuthorId;
  const snowflake = (value: unknown): value is string => typeof value === "string" && /^\d{5,25}$/.test(value);
  const memberId = memberTarget ? targetId : snowflake(authorId) ? authorId : null;
  const actor = detail.actorVerified === true && snowflake(detail.actorId) ? `<@${detail.actorId}>` : "Neverificat de Discord";
  const channel = snowflake(detail.channelId) ? `<#${detail.channelId}>` : targetType === "channel" && snowflake(targetId) ? `<#${targetId}>` : "—";
  const values: Record<string, string> = {
    guild: text(context.guildName), event: eventType, category: ACTIVITY_LOG_GROUPS[context.category],
    title: context.defaultTitle, member: memberId && snowflake(memberId) ? `<@${memberId}>` : "—",
    moderator: actor, channel,
    target: memberTarget && snowflake(targetId) ? `<@${targetId}>` : targetType === "channel" && snowflake(targetId) ? `<#${targetId}>` : targetType === "role" && snowflake(targetId) ? `<@&${targetId}>` : text(detail.entityName ?? detail.name),
    action: text(detail.action), reason: text(detail.reason),
    timestamp: `<t:${Math.floor(now / 1000)}:F>`, timestamp_relative: `<t:${Math.floor(now / 1000)}:R>`,
    details: [presentation.description, ...presentation.fields.map((field) => `**${field.name}:**\n${field.value}`)].filter(Boolean).join("\n\n"),
    before: text(detail.displayBeforeContent), after: text(detail.displayAfterContent),
    content: text(detail.messageContent ?? detail.displayBeforeContent),
    count: text(detail.messageCount ?? detail.count ?? detail.joins ?? detail.amount),
    name: text(detail.entityName ?? detail.name ?? detail.channelName),
    changes: presentation.fields.filter((field) => field.name === "Detalii" || field.name.includes("Modificări")).map((field) => field.value).join("\n") || "—",
    roles_added: text(detail.addedRoles), roles_removed: text(detail.removedRoles),
    old_channel: text(detail.oldChannelName), new_channel: text(detail.newChannelName ?? detail.channelName),
    old_nickname: text(detail.oldNickname), new_nickname: text(detail.newNickname),
    duration: detail.durationMinutes == null ? "—" : `${text(detail.durationMinutes)} minute`,
    error: text(detail.error),
  };
  if (memberId) {
    for (const variable of ["member_name", "username", "account_created_at", "account_created_at_relative", "account_age", "account_age_years", "account_age_days", "server_joined_at", "server_joined_at_relative", "server_left_at", "server_left_at_relative", "server_duration"]) {
      values[variable] = renderMemberActivityTemplate(`{${variable}}`, eventType, memberId, detail);
    }
  } else {
    values.member_name = "—";
    values.username = "—";
  }
  return renderActivityLogText(template, values);
}
