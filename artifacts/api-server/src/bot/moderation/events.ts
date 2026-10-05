import {
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
} from "discord.js";
import type { AutoModerationActionExecution } from "discord.js";
import type { ActivityLogCategory, ModerationAction, ModerationConfig } from "../../moderation/config";
import { logger } from "../../lib/logger";
import { buildActivityLogPresentation } from "./activity-log-presentation";

export type ModerationEventActionInput = {
  guildId: string;
  actorId: string;
  /** Stable gateway-event or bounded-burst incident key required by the engine. */
  idempotencyKey: string;
  type: "warn" | "mute" | "kick" | "ban" | "unmute" | "purge" | "slowmode" | "lock" | "unlock" | "nick" | "role" | "delete";
  targetId?: string;
  messageId?: string;
  reason?: string;
  durationMinutes?: number;
  channelId?: string;
  roleId?: string;
  nickname?: string;
  amount?: number;
  source?: "manual" | "automod" | "raid";
  evidence?: unknown[];
};

/**
 * Deliberately public dependency boundary for the event adapter.  The engine
 * passes its live implementation; this file does not import engine internals,
 * which keeps the adapter testable and prevents an engine/event import cycle.
 */
export type ModerationEventHelpers = {
  getConfig(guildId: string): Promise<ModerationConfig>;
  executeModerationAction(input: ModerationEventActionInput): Promise<unknown>;
  handleMessage(client: Client, message: Message): Promise<boolean>;
  handleNativeAutoModerationExecution(client: Client, execution: AutoModerationActionExecution): Promise<void>;
  notify(config: ModerationConfig, guild: Guild, title: string, description: string, preferredChannelId?: string | null): Promise<void>;
  auditExternal(guildId: string, eventType: string, targetType: string, targetId: string, detail: Record<string, unknown>): Promise<void>;
  recordMemberJoin(guildId: string, userId: string, joinedAt: Date): Promise<void>;
  getMemberJoinAt(guildId: string, userId: string): Promise<Date | null>;
  clearMemberJoinAt(guildId: string, userId: string, joinedAt: Date): Promise<void>;
};

type AuditActor = { id: string; bot: boolean; staff: boolean | null; verified: boolean };
type RateSample = { at: number; count: number };

const MAX_RATE_KEYS = 2_048;
const MAX_SAMPLES_PER_KEY = 1_024;
const AUDIT_CORRELATION_MS = 12_000;

/** A bounded, per-key sliding count. Keys always include the guild ID. */
class BoundedRateMap {
  private readonly samples = new Map<string, RateSample[]>();

  hit(key: string, limit: number, windowMs: number, amount = 1, now = Date.now()): { count: number; exceeded: boolean } {
    const existing = this.samples.get(key) ?? [];
    const since = now - windowMs;
    const retained = existing.filter((sample) => sample.at >= since);
    retained.push({ at: now, count: Math.max(1, Math.min(amount, MAX_SAMPLES_PER_KEY)) });
    while (retained.length > MAX_SAMPLES_PER_KEY) retained.shift();
    if (!this.samples.has(key) && this.samples.size >= MAX_RATE_KEYS) {
      const oldest = this.samples.keys().next().value;
      if (oldest) this.samples.delete(oldest);
    }
    this.samples.set(key, retained);
    const count = retained.reduce((total, sample) => total + sample.count, 0);
    return { count, exceeded: count > limit };
  }
}

const joinRates = new BoundedRateMap();
const joinLeaveRates = new BoundedRateMap();
const editRates = new BoundedRateMap();
const deleteRates = new BoundedRateMap();
const nicknameRates = new BoundedRateMap();
const roleRates = new BoundedRateMap();
const unusualRates = new BoundedRateMap();
const incidentCooldowns = new Map<string, number>();

/** Claims one alert/enforcement signal for a bounded incident window. */
function claimIncident(key: string, cooldownMs: number, now = Date.now()): boolean {
  if ((incidentCooldowns.get(key) ?? 0) > now) return false;
  if (!incidentCooldowns.has(key) && incidentCooldowns.size >= MAX_RATE_KEYS) {
    const oldest = incidentCooldowns.keys().next().value;
    if (oldest) incidentCooldowns.delete(oldest);
  }
  incidentCooldowns.set(key, now + Math.max(1_000, Math.min(cooldownMs, 120_000)));
  return true;
}

function configuredAction(action: ModerationAction): ModerationEventActionInput["type"] | null {
  return action === "none" || action === "delete" ? null : action;
}

function threshold(rule: { thresholds: Record<string, number> }, fallback: number): number {
  for (const key of ["limit", "changes", "edits", "deletes", "joins"]) {
    const value = rule.thresholds[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

function windowMs(rule: { thresholds: Record<string, number> }, fallbackSeconds = 60): number {
  const seconds = rule.thresholds.windowSeconds ?? rule.thresholds.window ?? rule.thresholds.windowMs;
  return (typeof seconds === "number" && Number.isFinite(seconds) ? seconds : fallbackSeconds) * 1_000;
}

function sensitivityThreshold(
  rule: { thresholds: Record<string, number>; severity: "soft" | "normal" | "hard" },
  sensitivity: ModerationConfig["suspiciousBehavior"]["sensitivity"],
  fallback: number,
): number {
  let value = threshold(rule, fallback);
  if (sensitivity === "low") value = Math.ceil(value * 1.5);
  if (sensitivity === "high") value = Math.max(1, Math.floor(value * 0.75));
  if (rule.severity === "soft") value = Math.ceil(value * 1.5);
  if (rule.severity === "hard") value = Math.max(1, Math.floor(value * 0.75));
  return value;
}

function isExcludedChannel(config: ModerationConfig, channelId: string | null | undefined): boolean {
  return !channelId || config.channels.ignoredChannelIds.includes(channelId) || config.channels.protectedChannelIds.includes(channelId);
}

function isExcludedMember(config: ModerationConfig, member: GuildMember | null | undefined): boolean {
  return !member || member.user.bot || member.roles.cache.some((role) =>
    config.roles.ignoredAutoModRoleIds.includes(role.id) || config.roles.protectedRoleIds.includes(role.id),
  );
}

async function resolveMessage(message: Message | PartialMessage): Promise<Message | null> {
  if (!message.partial) return message as Message;
  return message.fetch().catch(() => null);
}

async function findAuditActor(
  guild: Guild,
  config: ModerationConfig,
  action: AuditLogEvent,
  targetId: string,
  channelId?: string | null,
): Promise<AuditActor | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type: action, limit: 6 });
    const now = Date.now();
    const entry = logs.entries.find((candidate) => {
      if (now - candidate.createdTimestamp > AUDIT_CORRELATION_MS) return false;
      if (candidate.targetId === targetId) return true;
      // Discord represents a bulk deletion's target as its channel in some
      // gateway/audit combinations. Never use a merely recent, unrelated row.
      const extra = candidate.extra as { channel?: { id?: string } } | null;
      return action === AuditLogEvent.MessageBulkDelete && Boolean(channelId) &&
        (candidate.targetId === channelId || extra?.channel?.id === channelId);
    });
    if (!entry?.executorId || !entry.executor) return null;
    let staff: boolean | null = null;
    if (!entry.executor.bot) {
      try {
        const executor = await guild.members.fetch(entry.executorId);
        staff = executor.roles.cache.some((role) =>
          config.permissions.staffRoleIds.includes(role.id) || config.roles.specialPermissionRoleIds.includes(role.id),
        ) || executor.permissions.has(PermissionFlagsBits.Administrator) ||
          executor.permissions.has(PermissionFlagsBits.ManageGuild);
      } catch {
        // Attribution remains reliable, but staff status is intentionally
        // unknown rather than guessed from a stale cache.
      }
    }
    return { id: entry.executorId, bot: entry.executor.bot, staff, verified: true };
  } catch (error) {
    logger.debug({ error, guildId: guild.id, action, targetId }, "Discord audit actor correlation unavailable");
    return null;
  }
}

async function actorCanBeSanctioned(guild: Guild, config: ModerationConfig, actor: AuditActor | null): Promise<boolean> {
  if (!actor || actor.bot || actor.staff === true) return false;
  try {
    const member = await guild.members.fetch(actor.id);
    return !isExcludedMember(config, member);
  } catch (error) {
    logger.debug({ error, guildId: guild.id, actorId: actor.id }, "Audit actor membership could not be safely verified");
    return false;
  }
}

function auditDetail(
  config: ModerationConfig,
  actor: AuditActor | null,
  standard: Record<string, unknown>,
  verbose?: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    actorVerified: Boolean(actor?.verified),
    actorId: actor?.id ?? null,
    actorBot: actor?.bot ?? false,
    actorStaff: actor?.staff ?? null,
  };
  if (config.audit.detailLevel === "minimal" && !config.activityLog.enabled) return base;
  Object.assign(base, standard);
  if ((config.audit.detailLevel === "verbose" || config.activityLog.enabled) && verbose) {
    Object.assign(base, verbose);
  }
  return base;
}

async function recordAudit(
  helpers: ModerationEventHelpers,
  config: ModerationConfig,
  guild: Guild,
  eventType: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>,
  activityDisplayDetail: Record<string, unknown> = {},
): Promise<void> {
  await helpers.auditExternal(guild.id, eventType, targetType, targetId, detail);
  // Message text is only sent to the configured Discord activity channel; it
  // is intentionally kept out of the persisted moderation audit record.
  const displayDetail = { ...detail, ...activityDisplayDetail };
  await deliverActivityLog(guild, config, eventType, targetType, targetId, displayDetail);
  if (config.audit.enabled && config.audit.channelId) {
    const actor = detail.actorVerified === true && typeof detail.actorId === "string"
      ? `<@${detail.actorId}>`
      : "Neverificat de Discord";
    const channel = typeof detail.channelId === "string" ? `<#${detail.channelId}>` : "—";
    const normalizedEventType = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();
    const presentation = buildActivityLogPresentation(
      normalizedEventType,
      targetType,
      targetId,
      displayDetail,
      actor,
      channel,
    );
    const eventTitle = activityEventTitle(eventType, displayDetail) ??
      normalizedEventType.split(".").at(-1)?.replace(/_/g, " ") ??
      "Eveniment de moderare";
    const description = [
      presentation.description,
      ...presentation.fields.map((field) => `**${field.name}:**\n${field.value}`),
    ].filter(Boolean).join("\n\n").slice(0, 1_900);
    await helpers.notify(
      config,
      guild,
      eventTitle.charAt(0).toLocaleUpperCase() + eventTitle.slice(1),
      description || "Evenimentul de moderare a fost înregistrat.",
      config.audit.channelId,
    );
  }
}

const ACTIVITY_CATEGORY_LABELS: Record<ActivityLogCategory, string> = {
  messages: "Mesaje",
  members: "Membri",
  channels: "Canale",
  roles: "Roluri",
  voice: "Activitate vocală",
  moderation: "Moderare",
  security: "Securitate",
};

const ACTIVITY_EVENT_TITLES: Record<string, string> = {
  "discord.message_update": "Mesaj editat",
  "discord.message_delete": "Mesaj șters",
  "discord.message_bulk_delete": "Mesaje șterse în masă",
  "discord.member_join": "👋 Membru nou · a intrat pe server",
  "discord.member_leave": "🚪 Membru a părăsit serverul",
  "discord.member_update": "Membru actualizat",
  "discord.voice_state_update": "Stare vocală schimbată",
  "discord.channel_create": "Canal creat",
  "discord.channel_update": "Canal actualizat",
  "discord.channel_delete": "Canal șters",
  "discord.guild_role_create": "Rol creat",
  "discord.guild_role_update": "Rol actualizat",
  "discord.guild_role_delete": "Rol șters",
  "action.applied": "Acțiune de moderare aplicată",
  "action.failed": "Acțiune de moderare eșuată",
  "action.reconciled": "Acțiune de moderare verificată",
  "action.finalized": "Rezultat de moderare confirmat",
  "automod.message_delete_failed": "Ștergere AutoMod eșuată",
  "ai.flagged": "Mesaj semnalat de moderarea AI",
  "spam.edit_burst": "Editări repetate detectate",
  "spam.bulk_delete": "Ștergere în masă detectată",
  "spam.message_delete": "Ștergeri repetate detectate",
  "suspicious.delete_alert_only": "Ștergeri fără sancțiune",
  "suspicious.join_leave_alert_only": "Intrări și plecări suspecte",
  "suspicious.unusual_alert_only": "Activitate neobișnuită",
  "raid.detected": "Activitate anti-raid detectată",
  "raid.lockdown_failed": "Blocare anti-raid eșuată",
};

function isMemberRoleChange(eventType: string, detail: Record<string, unknown>): boolean {
  const normalized = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();
  if (normalized !== "discord.member_update") return false;
  return detail.rolesChanged === true ||
    ["addedRoles", "removedRoles"].some((key) =>
      Array.isArray(detail[key]) && detail[key].length > 0,
    );
}

function activityEventTitle(eventType: string, detail: Record<string, unknown>): string | null {
  if (isMemberRoleChange(eventType, detail)) return "Rolurile membrului au fost schimbate";
  const normalized = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();
  return ACTIVITY_EVENT_TITLES[normalized] ??
    ACTIVITY_EVENT_TITLES[eventType] ??
    null;
}

function activityCategory(eventType: string, detail: Record<string, unknown>): ActivityLogCategory | null {
  const normalized = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();
  if (normalized.startsWith("discord.message_")) return "messages";
  if (isMemberRoleChange(eventType, detail)) return "roles";
  if (normalized.startsWith("discord.member_")) return "members";
  if (normalized.startsWith("discord.channel_")) return "channels";
  if (normalized.startsWith("discord.guild_role_")) return "roles";
  if (normalized.startsWith("discord.voice_")) return "voice";
  if (normalized.startsWith("action.")) return "moderation";
  if (/^(raid\.|suspicious\.|spam\.|automod\.|ai\.|event\.)/.test(normalized)) return "security";
  return null;
}

function memberActivityLogSelected(config: ModerationConfig): boolean {
  return config.activityLog.enabled && config.activityLog.categories.members;
}

function joinedAtForMember(member: GuildMember): Date {
  const timestamp = member.joinedTimestamp;
  return typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp)
    : new Date();
}

function memberActivityIdentity(member: { displayName: string; user: GuildMember["user"] }): {
  memberDisplayName: string;
  memberUsername: string;
  accountCreatedAt: string;
  accountAgeDays: number;
} {
  const now = Date.now();
  const createdAt = member.user.createdTimestamp;
  return {
    memberDisplayName: member.displayName || member.user.globalName || member.user.username,
    memberUsername: member.user.username,
    accountCreatedAt: new Date(createdAt).toISOString(),
    accountAgeDays: Math.max(0, Math.floor((now - createdAt) / 86_400_000)),
  };
}

/** Delivers a readable, mobile-first embed to the configured activity channel. */
export async function deliverActivityLog(
  guild: Guild,
  config: ModerationConfig,
  eventType: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const category = activityCategory(eventType, detail);
  if (!config.activityLog.enabled || !category || !config.activityLog.categories[category]) return;
  const channelId = config.activityLog.channelIds[category];
  if (!channelId) return;
  try {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId);
    if (!channel?.isTextBased() || !("send" in channel) || channel.guildId !== guild.id) {
      logger.warn({ guildId: guild.id, channelId, category }, "Discord activity log destination is unavailable");
      return;
    }
    const verified = detail.actorVerified === true && typeof detail.actorId === "string";
    const actor = verified ? `<@${detail.actorId}>` : "Neverificat de Discord";
    const channelTarget = typeof detail.channelId === "string" ? `<#${detail.channelId}>` : "—";
    const normalizedEventType = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();
    const presentation = buildActivityLogPresentation(
      normalizedEventType,
      targetType,
      targetId,
      detail,
      actor,
      channelTarget,
    );
    const embed = new EmbedBuilder()
      .setColor(
        normalizedEventType === "discord.member_join" ? 0x36a878 :
          normalizedEventType === "discord.member_leave" ? 0xd95050 :
            category === "security" ? 0xd94a2b :
          category === "moderation" ? 0xc38b3b :
            category === "messages" ? 0xd46a3c : 0x5865f2,
      )
      .setTitle(activityEventTitle(eventType, detail) ?? eventType.replace(/[._-]+/g, " "))
      .setFooter({ text: `Jurnal de activitate · ${ACTIVITY_CATEGORY_LABELS[category]}` })
      .setTimestamp();
    if (presentation.description) embed.setDescription(presentation.description);
    embed.addFields(...presentation.fields);
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    // Logging must never block moderation/event processing. Setup failures are
    // surfaced by the configuration route; later permission/channel changes
    // are recorded here so they remain diagnosable in server logs.
    logger.warn({ error, guildId: guild.id, channelId, category }, "Discord activity log post failed");
  }
}

async function alert(
  helpers: ModerationEventHelpers,
  config: ModerationConfig,
  guild: Guild,
  title: string,
  description: string,
  channelId: string | null,
): Promise<void> {
  await helpers.notify(config, guild, title, description, channelId);
}

async function sanction(
  helpers: ModerationEventHelpers,
  client: Client,
  guild: Guild,
  config: ModerationConfig,
  actorId: string,
  action: ModerationEventActionInput["type"] | null,
  reason: string,
  evidence: unknown[],
  idempotencyKey: string,
  source: "automod" | "raid" = "automod",
): Promise<boolean> {
  if (!action || !client.user?.id) return false;
  try {
    const channelId = evidence
      .find((entry): entry is { channelId: string } =>
        !!entry && typeof entry === "object" && "channelId" in entry && typeof entry.channelId === "string")
      ?.channelId;
    await helpers.executeModerationAction({
      guildId: guild.id, actorId: client.user.id, targetId: actorId, type: action,
      reason, evidence, source, idempotencyKey, channelId,
    });
    return true;
  } catch (error) {
    logger.warn({ error, guildId: guild.id, actorId, action }, "Automatic moderation action failed");
    await recordAudit(helpers, config, guild, "event.action_failed", "member", actorId, {
      ...auditDetail(config, { id: actorId, bot: false, staff: false, verified: true }, { action, reason }),
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown action failure",
    });
    return false;
  }
}

async function unusualActivity(
  helpers: ModerationEventHelpers,
  client: Client,
  guild: Guild,
  config: ModerationConfig,
  event: string,
  actor: AuditActor | null,
  policyExcluded: boolean,
): Promise<void> {
  if (!config.protection.enabled) return;
  const rule = config.suspiciousBehavior.unusualActivity;
  if (!config.suspiciousBehavior.enabled || !rule.enabled || policyExcluded) return;
  // "Unusual activity" is a bounded guild-wide stream of independently
  // suspicious moderation events in 60 seconds; it is not a vague heuristic.
  const rate = unusualRates.hit(`${guild.id}:unusual`, sensitivityThreshold(rule, config.suspiciousBehavior.sensitivity, 5), windowMs(rule));
  if (!rate.exceeded) return;
  const idempotencyKey = `unusual:${guild.id}:${Math.floor(Date.now() / windowMs(rule))}`;
  if (!claimIncident(idempotencyKey, windowMs(rule))) return;
  const description = `Activitate neobișnuită: ${rate.count} evenimente corelate în fereastra configurată (ultimul: ${event}).`;
  await alert(helpers, config, guild, "Activitate suspectă", description, config.suspiciousBehavior.alertChannelId);
  const action = configuredAction(rule.action) ?? configuredAction(config.suspiciousBehavior.action);
  if (await actorCanBeSanctioned(guild, config, actor)) {
    await sanction(helpers, client, guild, config, actor!.id, action, `Activitate suspectă: ${event}`, [{ description }], idempotencyKey);
  } else {
    await recordAudit(helpers, config, guild, "suspicious.unusual_alert_only", "guild", guild.id,
      auditDetail(config, actor, { event, count: rate.count, noSanction: "actor unverified, bot, or excluded" }));
  }
}

function memberDiff(
  oldMember: GuildMember | PartialGuildMember,
  member: GuildMember | PartialGuildMember,
): { nicknameChanged: boolean; addedRoles: string[]; removedRoles: string[] } {
  const oldRoles = oldMember.roles.cache;
  const newRoles = member.roles.cache;
  return {
    nicknameChanged: oldMember.nickname !== member.nickname,
    addedRoles: newRoles.filter((role) => !oldRoles.has(role.id)).map((role) => role.id).slice(0, 25),
    removedRoles: oldRoles.filter((role) => !newRoles.has(role.id)).map((role) => role.id).slice(0, 25),
  };
}

function readableRoleName(
  roles: GuildMember["roles"]["cache"] | PartialGuildMember["roles"]["cache"],
  roleId: string,
): string {
  const role = typeof roles.get === "function" ? roles.get(roleId) : undefined;
  return typeof role?.name === "string"
    ? role.name.replace(/@/g, "@\u200b")
    : "rol cu nume indisponibil";
}

function resourceDiff(before: Record<string, unknown> | null, after: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const field of fields) {
    if (before?.[field] !== after[field]) changed[field] = { from: before?.[field] ?? null, to: after[field] ?? null };
  }
  return changed;
}

/**
 * Registers all non-messageCreate moderation events.  It is idempotent per
 * Discord client and every async EventEmitter path is explicitly caught.
 */
export function attachModerationEvents(client: Client, helpers: ModerationEventHelpers): void {
  const attached = client as Client & { __moderationEventsAttached?: boolean };
  if (attached.__moderationEventsAttached) return;
  attached.__moderationEventsAttached = true;

  const safely = (event: string, work: () => Promise<void>, guildId?: string) => {
    void work().catch((error: unknown) => logger.error({ error, event, guildId }, "Moderation event handler failed"));
  };

  client.on(Events.AutoModerationActionExecution, (execution) => safely(
    Events.AutoModerationActionExecution,
    () => helpers.handleNativeAutoModerationExecution(client, execution),
    execution.guild.id,
  ));

  client.on(Events.GuildMemberAdd, (member) => safely(Events.GuildMemberAdd, async () => {
    const config = await helpers.getConfig(member.guild.id);
    const joinedAt = joinedAtForMember(member);
    const identity = memberActivityIdentity(member);
    if (memberActivityLogSelected(config)) {
      try {
        await helpers.recordMemberJoin(member.guild.id, member.id, joinedAt);
      } catch (error) {
        logger.warn({ error, guildId: member.guild.id, memberId: member.id }, "Failed to persist member join time");
      }
    }
    await recordAudit(helpers, config, member.guild, "discord.member_join", "member", member.id,
      auditDetail(config, null, {
        actorVerified: false,
        channelId: null,
        ...identity,
        serverJoinedAt: joinedAt.toISOString(),
      }));
    if (!config.protection.enabled) return;
    const joinLeave = config.suspiciousBehavior.joinLeaveFlood;
    if (config.suspiciousBehavior.enabled && joinLeave.enabled) {
      const rate = joinLeaveRates.hit(
        `${member.guild.id}:join-leave`,
        sensitivityThreshold(joinLeave, config.suspiciousBehavior.sensitivity, 5),
        windowMs(joinLeave),
      );
      if (rate.exceeded) {
        const incidentKey = `join-leave:${member.guild.id}:${Math.floor(Date.now() / windowMs(joinLeave))}`;
        if (claimIncident(incidentKey, windowMs(joinLeave))) {
          const description = `Flux join/leave detectat: ${rate.count} intrări/plecări în fereastra configurată. Nu există un actor sancționabil.`;
          await alert(helpers, config, member.guild, "Activitate suspectă", description, config.suspiciousBehavior.alertChannelId);
          await recordAudit(helpers, config, member.guild, "suspicious.join_leave_alert_only", "member", member.id,
            auditDetail(config, null, { count: rate.count, noSanction: "join/leave stream has no verified actor" }));
          await unusualActivity(helpers, client, member.guild, config, "member_join", null, false);
        }
      }
    }
    const rule = config.antiRaid.rule;
    if (!config.antiRaid.enabled || !rule.enabled || isExcludedMember(config, member)) return;
    const joins = joinRates.hit(
      `${member.guild.id}:joins`,
      threshold(rule, config.antiRaid.joinsPerMinute),
      windowMs(rule),
    );
    const young = Date.now() - member.user.createdTimestamp < config.antiRaid.accountAgeDays * 86_400_000;
    if (!joins.exceeded && !young) return;

    const cooldown = Math.max(15_000, Math.min(windowMs(rule), 120_000));
    const incidentKey = `raid:${member.guild.id}:${Math.floor(Date.now() / cooldown)}`;
    if (!claimIncident(incidentKey, cooldown)) return;

    const description = young
      ? `Cont nou detectat la intrare (< ${config.antiRaid.accountAgeDays} zile).`
      : `Rată de join suspectă (${joins.count} în fereastra configurată).`;
    await alert(helpers, config, member.guild, "Alertă anti-raid", description, config.antiRaid.alertChannelId);
    await recordAudit(helpers, config, member.guild, "raid.detected", "member", member.id,
      auditDetail(config, null, { joins: joins.count, youngAccount: young, lockdown: config.antiRaid.lockdown }));

    if (config.antiRaid.lockdown) {
      const lockdownChannels = new Map(member.guild.channels.cache);
      try {
        const fetchedChannels = await member.guild.channels.fetch();
        for (const [channelId, channel] of fetchedChannels) {
          if (channel) lockdownChannels.set(channelId, channel);
        }
      } catch (error) {
        logger.warn({ error, guildId: member.guild.id }, "Anti-raid guild channel fetch failed; using cached channels");
      }
      for (const channel of lockdownChannels.values()) {
        if (channel.type !== ChannelType.GuildText || isExcludedChannel(config, channel.id)) continue;
        try {
          await helpers.executeModerationAction({
            guildId: member.guild.id, actorId: client.user?.id ?? "system", type: "lock",
            channelId: channel.id, reason: "Lockdown anti-raid reversibil", source: "raid",
            idempotencyKey: `${incidentKey}:lock:${channel.id}`,
          });
        } catch (error) {
          const failure = `Lockdown nereușit pentru <#${channel.id}>: ${error instanceof Error ? error.message : "eroare necunoscută"}`;
          logger.warn({ error, guildId: member.guild.id, channelId: channel.id }, "Anti-raid channel lockdown failed");
          await recordAudit(helpers, config, member.guild, "raid.lockdown_failed", "channel", channel.id,
            auditDetail(config, null, { error: failure }));
          await alert(helpers, config, member.guild, "Eroare lockdown anti-raid", failure, config.antiRaid.alertChannelId);
        }
      }
    }
    await sanction(
      helpers, client, member.guild, config, member.id, configuredAction(rule.action),
      `Anti-raid: ${description}`, [{ description }], `${incidentKey}:member:${member.id}`, "raid",
    );
  }, member.guild.id));

  client.on(Events.GuildMemberRemove, (member) => safely(Events.GuildMemberRemove, async () => {
    const config = await helpers.getConfig(member.guild.id);
    let recordedJoinedAt: Date | null = null;
    try {
      recordedJoinedAt = await helpers.getMemberJoinAt(member.guild.id, member.id);
    } catch (error) {
      logger.warn({ error, guildId: member.guild.id, memberId: member.id }, "Failed to read persisted member join time");
    }
    const joinedAt = recordedJoinedAt ?? (
      typeof member.joinedTimestamp === "number" && Number.isFinite(member.joinedTimestamp) && member.joinedTimestamp > 0
        ? new Date(member.joinedTimestamp)
        : null
    );
    const leftAt = new Date();
    const identity = memberActivityIdentity(member);
    await recordAudit(helpers, config, member.guild, "discord.member_leave", "member", member.id,
      auditDetail(config, null, {
        actorVerified: false,
        channelId: null,
        ...identity,
        serverJoinedAt: joinedAt?.toISOString() ?? null,
        serverLeftAt: leftAt.toISOString(),
      }));
    if (recordedJoinedAt) {
      try {
        await helpers.clearMemberJoinAt(member.guild.id, member.id, recordedJoinedAt);
      } catch (error) {
        logger.warn({ error, guildId: member.guild.id, memberId: member.id }, "Failed to clear persisted member join time");
      }
    }
    if (!config.protection.enabled) return;
    const rule = config.suspiciousBehavior.joinLeaveFlood;
    if (!config.suspiciousBehavior.enabled || !rule.enabled) return;
    const rate = joinLeaveRates.hit(`${member.guild.id}:join-leave`, sensitivityThreshold(rule, config.suspiciousBehavior.sensitivity, 5), windowMs(rule));
    if (!rate.exceeded) return;
    const incidentKey = `join-leave:${member.guild.id}:${Math.floor(Date.now() / windowMs(rule))}`;
    if (!claimIncident(incidentKey, windowMs(rule))) return;
    const description = `Flux join/leave detectat: ${rate.count} plecări/intrări în fereastra configurată. Actorul nu este verificabil; fără sancțiune.`;
    await alert(helpers, config, member.guild, "Activitate suspectă", description, config.suspiciousBehavior.alertChannelId);
    await recordAudit(helpers, config, member.guild, "suspicious.join_leave_alert_only", "member", member.id,
      auditDetail(config, null, { count: rate.count, noSanction: "departure actor is unknown" }));
    await unusualActivity(helpers, client, member.guild, config, "member_leave", null, false);
  }, member.guild.id));

  client.on(Events.MessageUpdate, (oldMessage, incoming) => safely(Events.MessageUpdate, async () => {
    const message = await resolveMessage(incoming);
    if (!message?.guild || !message.guildId || message.author.bot) return;
    const contentChanged = oldMessage.content != null && oldMessage.content !== message.content;
    // Edited content has to take the same AutoMod path as a new message.
    if (oldMessage.content == null || contentChanged) await helpers.handleMessage(client, message);
    const config = await helpers.getConfig(message.guildId);
    await recordAudit(helpers, config, message.guild, "discord.message_update", "message", message.id,
      auditDetail(config, null, {
        actorVerified: false,
        targetAuthorId: message.author.id,
        channelId: message.channelId,
        contentChanged,
      }), {
        displayMessageAuthorId: message.author.id,
        displayBeforeContent: typeof oldMessage.content === "string" ? oldMessage.content : null,
        displayAfterContent: typeof message.content === "string" ? message.content : null,
        displayContentChanged: contentChanged,
      });
    if (!config.protection.enabled) return;
    if (isExcludedChannel(config, message.channelId) || isExcludedMember(config, message.member)) return;

    let sanctioned = false;
    if (contentChanged && config.antiSpam.enabled && config.antiSpam.edit.enabled) {
      const rule = config.antiSpam.edit;
      const rate = editRates.hit(`${message.guildId}:edit:${message.author.id}`, threshold(rule, 5), windowMs(rule, 10));
      if (rate.exceeded) {
        const incidentKey = `edit:${message.guildId}:${message.author.id}:${Math.floor(Date.now() / windowMs(rule, 10))}`;
        if (claimIncident(`edit-cooldown:${message.guildId}:${message.author.id}`, windowMs(rule, 10))) {
        const description = `Spam de editări: ${rate.count} editări în fereastra configurată.`;
        await recordAudit(helpers, config, message.guild, "spam.edit_burst", "member", message.author.id,
          auditDetail(config, { id: message.author.id, bot: false, staff: false, verified: true }, { count: rate.count, messageId: message.id }));
        if (rule.action === "delete") {
          try {
            await helpers.executeModerationAction({
              guildId: message.guildId, actorId: client.user?.id ?? "system", targetId: message.author.id, type: "delete",
              messageId: message.id, channelId: message.channelId, reason: description, source: "automod",
              evidence: [{ messageId: message.id, channelId: message.channelId, kind: "edit-spam" }],
              idempotencyKey: incidentKey,
            });
            sanctioned = true;
          } catch (error) {
            logger.warn({ error, guildId: message.guildId, messageId: message.id }, "Configured edit deletion action failed");
            await recordAudit(helpers, config, message.guild, "event.action_failed", "message", message.id, {
              ...auditDetail(config, { id: message.author.id, bot: false, staff: false, verified: true }, { action: "delete", reason: description }),
              error: error instanceof Error ? error.message.slice(0, 300) : "unknown deletion failure",
            });
          }
        } else {
          sanctioned = await sanction(
            helpers, client, message.guild, config, message.author.id, configuredAction(rule.action), description,
            [{ messageId: message.id, channelId: message.channelId, kind: "edit-spam" }], incidentKey,
          );
        }
        }
      }
    }
    const massEdits = config.suspiciousBehavior.massEdits;
    if (contentChanged && config.suspiciousBehavior.enabled && massEdits.enabled) {
      const rate = editRates.hit(`${message.guildId}:mass-edit:${message.author.id}`, sensitivityThreshold(massEdits, config.suspiciousBehavior.sensitivity, 5), windowMs(massEdits));
      if (rate.exceeded) {
        const incidentKey = `mass-edit:${message.guildId}:${message.author.id}:${Math.floor(Date.now() / windowMs(massEdits))}`;
        if (!claimIncident(`mass-edit-cooldown:${message.guildId}:${message.author.id}`, windowMs(massEdits))) return;
        const description = `Editări în masă: ${rate.count} editări în fereastra configurată.`;
        await alert(helpers, config, message.guild, "Activitate suspectă", description, config.suspiciousBehavior.alertChannelId);
        if (!sanctioned) {
          await sanction(helpers, client, message.guild, config, message.author.id,
            configuredAction(massEdits.action) ?? configuredAction(config.suspiciousBehavior.action),
            description, [{ messageId: message.id, channelId: message.channelId, kind: "mass-edits" }], incidentKey);
        }
        await unusualActivity(helpers, client, message.guild, config, "mass_edits", { id: message.author.id, bot: false, staff: false, verified: true }, false);
      }
    }
  }));

  const deleted = (messages: Array<Message | PartialMessage>, guild: Guild, channelId: string | null, bulk: boolean) => safely(
    bulk ? Events.MessageBulkDelete : Events.MessageDelete,
    async () => {
      const config = await helpers.getConfig(guild.id);
      const rule = config.antiSpam.delete;
      const massDeletes = config.suspiciousBehavior.massDeletes;
      const first = messages[0];
      // A single-message audit target is the message author in Discord's audit
      // schema; this is used only to find the executor, never as the culprit.
      const targetId = bulk ? (channelId ?? guild.id) : first?.author?.id;
      const actor = targetId
        ? await findAuditActor(guild, config, bulk ? AuditLogEvent.MessageBulkDelete : AuditLogEvent.MessageDelete, targetId, channelId)
        : null;
      await recordAudit(
        helpers,
        config,
        guild,
        bulk ? "discord.message_bulk_delete" : "discord.message_delete",
        bulk ? "channel" : "message",
        bulk ? (channelId ?? guild.id) : (first?.id ?? guild.id),
        auditDetail(config, actor, {
          channelId,
          messageCount: messages.length,
          policyExcluded: isExcludedChannel(config, channelId),
        }),
        {
          displayMessageAuthorId: first?.author?.id ?? null,
          displayDeletedMessages: messages.slice(0, 5).map((message) => ({
            authorId: message.author?.id ?? null,
            content: typeof message.content === "string" ? message.content : null,
            attachmentCount: message.attachments?.size ?? 0,
          })),
        },
      );
      if (!config.protection.enabled) return;
      if ((!config.antiSpam.enabled || !rule.enabled) && (!config.suspiciousBehavior.enabled || !massDeletes.enabled)) return;
      if (isExcludedChannel(config, channelId)) return;
      const keyActor = actor?.id ?? "unverified";
      const amount = Math.max(1, messages.length);
      const antiRate = config.antiSpam.enabled && rule.enabled
        ? deleteRates.hit(`${guild.id}:delete:anti:${keyActor}`, sensitivityThreshold(rule, "medium", 5), windowMs(rule, 10), amount)
        : null;
      const massRate = config.suspiciousBehavior.enabled && massDeletes.enabled
        ? deleteRates.hit(
          `${guild.id}:delete:mass:${keyActor}`,
          sensitivityThreshold(massDeletes, config.suspiciousBehavior.sensitivity, 5),
          windowMs(massDeletes),
          amount,
        )
        : null;
      const activeRule = massRate?.exceeded ? massDeletes : antiRate?.exceeded ? rule : null;
      const rate = massRate?.exceeded ? massRate : antiRate?.exceeded ? antiRate : null;
      if (!activeRule || !rate) return;
      const incidentKey = `delete:${guild.id}:${keyActor}:${bulk ? "bulk" : "single"}:${Math.floor(Date.now() / windowMs(activeRule))}`;
      if (!claimIncident(incidentKey, windowMs(activeRule))) return;
      const description = `${bulk ? "Ștergere în masă" : "Ștergeri repetate"}: ${rate.count} mesaje. ${actor ? `Actor verificat: <@${actor.id}>.` : "Actor neverificat; alertă fără sancțiune."}`;
      await alert(helpers, config, guild, "Activitate suspectă", description,
        activeRule === massDeletes ? config.suspiciousBehavior.alertChannelId : config.antiSpam.logChannelId);
      await recordAudit(helpers, config, guild, bulk ? "spam.bulk_delete" : "spam.message_delete", "channel", channelId ?? guild.id,
        auditDetail(config, actor, { count: rate.count, bulk, noSanction: !actor }));
      if (!actor || !await actorCanBeSanctioned(guild, config, actor)) {
        await recordAudit(helpers, config, guild, "suspicious.delete_alert_only", "channel", channelId ?? guild.id,
          auditDetail(config, actor, { count: rate.count, noSanction: "actor unverified, bot, or excluded" }));
        return;
      }
      const action = configuredAction(activeRule.action) ??
        (activeRule === massDeletes ? configuredAction(config.suspiciousBehavior.action) : null);
      await sanction(
        helpers, client, guild, config, actor.id, action, description,
        [{ channelId: channelId ?? undefined, kind: bulk ? "bulk-delete" : "delete-spam" }], incidentKey,
      );
      await unusualActivity(helpers, client, guild, config, bulk ? "bulk_delete" : "message_delete", actor, false);
    },
    guild.id,
  );

  client.on(Events.MessageDelete, (message) => {
    if (message.guild) deleted([message], message.guild, message.channelId, false);
  });
  client.on(Events.MessageBulkDelete, (collection, channel) => {
    if (channel.guild) deleted([...collection.values()], channel.guild, channel.id, true);
  });

  client.on(Events.GuildMemberUpdate, (oldMember, member) => safely(Events.GuildMemberUpdate, async () => {
    const config = await helpers.getConfig(member.guild.id);
    const diff = memberDiff(oldMember, member);
    if (!diff.nicknameChanged && !diff.addedRoles.length && !diff.removedRoles.length) return;
    const auditAction = diff.nicknameChanged && !diff.addedRoles.length && !diff.removedRoles.length
      ? AuditLogEvent.MemberUpdate : AuditLogEvent.MemberRoleUpdate;
    const actor = await findAuditActor(member.guild, config, auditAction, member.id);
    await recordAudit(helpers, config, member.guild, "discord.member_update", "member", member.id,
      auditDetail(config, actor, { nicknameChanged: diff.nicknameChanged, rolesChanged: Boolean(diff.addedRoles.length || diff.removedRoles.length) },
        { oldNickname: oldMember.nickname, newNickname: member.nickname, addedRoles: diff.addedRoles, removedRoles: diff.removedRoles }), {
        addedRoles: diff.addedRoles.map((roleId) => readableRoleName(member.roles.cache, roleId)),
        removedRoles: diff.removedRoles.map((roleId) => readableRoleName(oldMember.roles.cache, roleId)),
      });
    if (!config.protection.enabled) return;
    if (!config.suspiciousBehavior.enabled || isExcludedMember(config, member)) return;

    const process = async (kind: "nickname" | "role", rule: ModerationConfig["suspiciousBehavior"]["nicknameChanges"], changed: boolean) => {
      if (!changed || !rule.enabled) return;
      const rates = kind === "nickname" ? nicknameRates : roleRates;
      const rate = rates.hit(`${member.guild.id}:${kind}:${member.id}`, sensitivityThreshold(rule, config.suspiciousBehavior.sensitivity, 3), windowMs(rule));
      if (!rate.exceeded) return;
      const incidentKey = `${kind}:${member.guild.id}:${member.id}:${Math.floor(Date.now() / windowMs(rule))}`;
      if (!claimIncident(incidentKey, windowMs(rule))) return;
      const description = `${kind === "nickname" ? "Schimbări repetate de nickname" : "Schimbări repetate de roluri"} pentru <@${member.id}> (${rate.count}).`;
      await alert(helpers, config, member.guild, "Activitate suspectă",
        `${description} ${actor ? `Actor verificat: <@${actor.id}>.` : "Actor neverificat; fără sancțiune."}`,
        config.suspiciousBehavior.alertChannelId);
      // Crucially, member is the target of the change, not the actor.
      if (await actorCanBeSanctioned(member.guild, config, actor)) {
        await sanction(helpers, client, member.guild, config, actor!.id,
          configuredAction(rule.action) ?? configuredAction(config.suspiciousBehavior.action),
          description, [{ description: `${kind}-change target=${member.id}` }], incidentKey);
      } else {
        await recordAudit(helpers, config, member.guild, `suspicious.${kind}_alert_only`, "member", member.id,
          auditDetail(config, actor, { count: rate.count, noSanction: "target was never punished; actor unavailable" }));
      }
      await unusualActivity(helpers, client, member.guild, config, `${kind}_changes`, actor, false);
    };
    await process("nickname", config.suspiciousBehavior.nicknameChanges, diff.nicknameChanged);
    await process("role", config.suspiciousBehavior.roleChanges, Boolean(diff.addedRoles.length || diff.removedRoles.length));
  }, member.guild.id));

  const resource = (
    event: string,
    auditAction: AuditLogEvent,
    targetType: "channel" | "role",
    before: Record<string, unknown> | null,
    entity: { id: string; guild: Guild },
  ) => safely(event, async () => {
    const config = await helpers.getConfig(entity.guild.id);
    const excluded = targetType === "channel"
      ? isExcludedChannel(config, entity.id)
      : config.roles.protectedRoleIds.includes(entity.id) || config.roles.ignoredAutoModRoleIds.includes(entity.id);
    const actor = await findAuditActor(entity.guild, config, auditAction, entity.id);
    const fields = targetType === "channel"
      ? ["name", "type", "parentId", "topic", "nsfw", "rateLimitPerUser"]
      : ["name", "color", "hoist", "mentionable", "permissions", "position"];
    const after = entity as unknown as Record<string, unknown>;
    const changes = resourceDiff(before, after, fields);
    const displayChanges = { ...changes };
    const parentChange = changes.parentId;
    if (
      targetType === "channel" &&
      parentChange !== null &&
      typeof parentChange === "object" &&
      !Array.isArray(parentChange)
    ) {
      const parentValues = parentChange as Record<string, unknown>;
      const parentName = (id: unknown) => {
        if (typeof id !== "string" || !id) return "fără categorie";
        const parent = entity.guild.channels.cache.get(id);
        return parent ? `#${parent.name}` : "categorie indisponibilă";
      };
      delete displayChanges.parentId;
      displayChanges.parentCategory = {
        from: parentName(parentValues.from),
        to: parentName(parentValues.to),
      };
    }
    await recordAudit(helpers, config, entity.guild, `discord.${event}`, targetType, entity.id,
      auditDetail(config, actor, {
        excludedByPolicy: excluded,
        changedFields: Object.keys(changes),
        entityName: typeof after.name === "string" ? after.name : "nume indisponibil",
        channelId: targetType === "channel" ? entity.id : null,
      }, { changes }), { changes: displayChanges });
    await unusualActivity(helpers, client, entity.guild, config, event, actor, excluded);
  }, entity.guild.id);

  client.on(Events.ChannelCreate, (channel) => resource(Events.ChannelCreate, AuditLogEvent.ChannelCreate, "channel", null, channel));
  client.on(Events.ChannelUpdate, (before, channel) => {
    if (!channel.isDMBased()) resource(Events.ChannelUpdate, AuditLogEvent.ChannelUpdate, "channel", before as unknown as Record<string, unknown>, channel);
  });
  client.on(Events.ChannelDelete, (channel) => {
    if (!channel.isDMBased()) resource(Events.ChannelDelete, AuditLogEvent.ChannelDelete, "channel", null, channel);
  });
  client.on(Events.GuildRoleCreate, (role) => resource(Events.GuildRoleCreate, AuditLogEvent.RoleCreate, "role", null, role));
  client.on(Events.GuildRoleUpdate, (before, role) => resource(Events.GuildRoleUpdate, AuditLogEvent.RoleUpdate, "role", before as unknown as Record<string, unknown>, role));
  client.on(Events.GuildRoleDelete, (role) => resource(Events.GuildRoleDelete, AuditLogEvent.RoleDelete, "role", null, role));

  client.on(Events.VoiceStateUpdate, (oldState, newState) => safely(Events.VoiceStateUpdate, async () => {
    const guild = newState.guild ?? oldState.guild;
    const memberId = newState.id || oldState.id;
    const config = await helpers.getConfig(guild.id);
    const channelChanged = oldState.channelId !== newState.channelId;
    const actor = channelChanged
      ? await findAuditActor(
        guild,
        config,
        newState.channelId ? AuditLogEvent.MemberMove : AuditLogEvent.MemberDisconnect,
        memberId,
      )
      : null;
    const voiceChannelName = (channelId: string | null) => channelId
      ? `#${guild.channels.cache.get(channelId)?.name ?? "canal indisponibil"}`
      : "în afara unui canal vocal";
    const voiceDisplayDetail = channelChanged
      ? {
          channelId: null,
          oldChannelName: voiceChannelName(oldState.channelId),
          newChannelName: voiceChannelName(newState.channelId),
        }
      : {
          channelId: null,
          channelName: voiceChannelName(newState.channelId),
        };
    await recordAudit(helpers, config, guild, "discord.voice_state_update", "member", memberId,
      auditDetail(config, actor, {
        actorVerified: Boolean(actor?.verified),
        channelId: newState.channelId,
        oldChannelId: oldState.channelId,
        newChannelId: newState.channelId,
        channelChanged,
        selfMute: newState.selfMute,
        serverMute: newState.serverMute,
        selfDeaf: newState.selfDeaf,
        serverDeaf: newState.serverDeaf,
        streaming: newState.streaming,
        video: newState.selfVideo,
      }), voiceDisplayDetail);
  }, newState.guild.id));
}