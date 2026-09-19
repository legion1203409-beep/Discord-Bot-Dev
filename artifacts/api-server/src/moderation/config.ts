import { z } from "zod";

const snowflake = z.string().regex(/^\d{5,25}$/, "Expected a Discord snowflake");
const idList = z.array(snowflake).max(100);
const textList = z.array(z.string().trim().min(1).max(200)).max(500);
const action = z.enum(["none", "warn", "mute", "kick", "ban", "delete"]);
const severity = z.enum(["soft", "normal", "hard"]);
const safeHttpsUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const privateIpv4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  return url.protocol === "https:" && host !== "localhost" && host !== "::1" && !privateIpv4;
}, "URL must use public HTTPS");
const safeGifUrl = safeHttpsUrl.refine((value) => new URL(value).pathname.toLowerCase().endsWith(".gif"), "Animation URL must point to a GIF");

export const EvidenceItemSchema = z.object({
  messageId: snowflake.optional(),
  channelId: snowflake.optional(),
  kind: z.string().trim().min(1).max(64).optional(),
  url: safeHttpsUrl.optional(),
  description: z.string().trim().min(1).max(1_000).optional(),
}).strict().refine((value) => value.messageId || value.channelId || value.url || value.description, {
  message: "Evidence must contain a message, channel, URL, or description",
});
export const EvidenceSchema = z.array(EvidenceItemSchema).max(25);

export const RuleSchema = z.object({
  enabled: z.boolean().default(false),
  action: action.default("none"),
  severity: severity.default("normal"),
  // A zero threshold silently sanctions every event (or creates a zero-length
  // rate window), so thresholds are always positive integers.
  thresholds: z.record(z.number().int().finite().min(1).max(100_000)).default({}),
});

type ThresholdBound = readonly [minimum: number, maximum: number];
function validateRuleThresholds(
  rule: { thresholds: Record<string, number> },
  path: Array<string | number>,
  allowed: Record<string, ThresholdBound>,
  ctx: z.RefinementCtx,
): void {
  for (const [key, value] of Object.entries(rule.thresholds)) {
    const bounds = allowed[key];
    if (!bounds) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "thresholds", key], message: `Unsupported threshold for this rule: ${key}` });
    } else if (value < bounds[0] || value > bounds[1]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "thresholds", key], message: `Threshold must be between ${bounds[0]} and ${bounds[1]}` });
    }
  }
}

const commandName = z.enum([
  "warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock",
  "unlock", "nick", "role",
]);

export const ModerationConfigSchema = z.object({
  // Global protection switch. Module settings remain stored while the
  // category is disabled so an operator can turn protection back on without
  // rebuilding every rule.
  protection: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
  // 1. AutoMod
  autoMod: z.object({
    enabled: z.boolean().default(false),
    wordFilter: RuleSchema.default({}),
    linkBlock: RuleSchema.default({}),
    emojiLimit: RuleSchema.default({}),
    capsLimit: RuleSchema.default({}),
    repeatBlock: RuleSchema.default({}),
    forbiddenWords: textList.default([]),
    forbiddenLinks: textList.default([]),
  }).default({}),
  // 2. Anti-raid
  antiRaid: z.object({
    enabled: z.boolean().default(false),
    joinsPerMinute: z.number().int().min(1).max(10_000).default(10),
    accountAgeDays: z.number().int().min(0).max(3650).default(7),
    lockdown: z.boolean().default(false),
    alertChannelId: snowflake.nullable().default(null),
    rule: RuleSchema.default({}),
  }).default({}),
  // 3. Anti-spam
  antiSpam: z.object({
    enabled: z.boolean().default(false),
    message: RuleSchema.default({}),
    edit: RuleSchema.default({}),
    delete: RuleSchema.default({}),
    mention: RuleSchema.default({}),
    emoji: RuleSchema.default({}),
    logChannelId: snowflake.nullable().default(null),
  }).default({}),
  // 4. Anti-flood
  antiFlood: z.object({
    enabled: z.boolean().default(false),
    longMessage: RuleSchema.default({}),
    character: RuleSchema.default({}),
    caps: RuleSchema.default({}),
    symbol: RuleSchema.default({}),
  }).default({}),
  // 5. Manual staff tools and independent command grants
  manualTools: z.object({
    enabled: z.boolean().default(false),
    commandGrants: z.record(commandName, idList).default({}),
    logActions: z.boolean().default(false),
  }).default({}),
  // 6. Cases
  cases: z.object({
    enabled: z.boolean().default(false),
    allowStaffClose: z.boolean().default(true),
    allowStaffNotes: z.boolean().default(true),
    allowStaffExport: z.boolean().default(false),
    retentionDays: z.number().int().min(1).max(3650).default(365),
  }).default({}),
  // 7. Audit
  audit: z.object({
    enabled: z.boolean().default(false),
    detailLevel: z.enum(["minimal", "standard", "verbose"]).default("standard"),
    channelId: snowflake.nullable().default(null),
  }).default({}),
  // 8. Roles
  roles: z.object({
    sanctionableRoleIds: idList.default([]),
    protectedRoleIds: idList.default([]),
    ignoredAutoModRoleIds: idList.default([]),
    specialPermissionRoleIds: idList.default([]),
  }).default({}),
  // 9. Channels
  channels: z.object({
    ignoredChannelIds: idList.default([]),
    protectedChannelIds: idList.default([]),
    autoSlowmodeChannelIds: idList.default([]),
    strictChannelIds: idList.default([]),
    softChannelIds: idList.default([]),
  }).default({}),
  // 10. Time profiles
  timeProfiles: z.object({
    timezone: z.string().trim().min(1).max(64).refine((timezone) => {
      try { Intl.DateTimeFormat(undefined, { timeZone: timezone }); return true; } catch { return false; }
    }, "Timezone must be a valid IANA timezone").default("UTC"),
    strictNight: z.object({ enabled: z.boolean().default(false), startHour: z.number().int().min(0).max(23).default(22), endHour: z.number().int().min(0).max(23).default(7) }).default({}),
    softDay: z.object({ enabled: z.boolean().default(false), startHour: z.number().int().min(0).max(23).default(8), endHour: z.number().int().min(0).max(23).default(21) }).default({}),
    weekend: z.object({ enabled: z.boolean().default(false), severity: severity.default("normal") }).default({}),
    majorEvent: z.object({ enabled: z.boolean().default(false), severity: severity.default("hard") }).default({}),
  }).default({}),
  // 11. Suspicious behaviour
  suspiciousBehavior: z.object({
    enabled: z.boolean().default(false),
    sensitivity: z.enum(["low", "medium", "high"]).default("medium"),
    action: action.default("none"),
    alertChannelId: snowflake.nullable().default(null),
    nicknameChanges: RuleSchema.default({}),
    roleChanges: RuleSchema.default({}),
    massEdits: RuleSchema.default({}),
    massDeletes: RuleSchema.default({}),
    joinLeaveFlood: RuleSchema.default({}),
    unusualActivity: RuleSchema.default({}),
  }).default({}),
  // 12. AI moderation
  ai: z.object({
    enabled: z.boolean().default(false),
    sensitivity: z.enum(["low", "medium", "high"]).default("medium"),
    tone: z.enum(["serious", "calm", "strict"]).default("calm"),
    action: action.default("none"),
    logChannelId: snowflake.nullable().default(null),
    categories: z.object({
      toxicity: z.boolean().default(false),
      profanity: z.boolean().default(false),
      attacks: z.boolean().default(false),
      bullying: z.boolean().default(false),
      intelligentSpam: z.boolean().default(false),
      trolling: z.boolean().default(false),
    }).default({}),
  }).default({}),
  // 13. Multi-server isolation
  multiServer: z.object({
    enabled: z.boolean().default(false),
    // Guild scoping is a privacy invariant, not an operator-selectable mode.
    isolatedData: z.literal(true).default(true),
  }).default({}),
  // 14. Escalation levels
  escalation: z.object({
    enabled: z.boolean().default(false),
    resetAfterDays: z.number().int().min(1).max(3650).default(30),
    levels: z.array(z.object({
      level: z.number().int().min(1).max(4),
      violations: z.number().int().min(1).max(10_000),
      action,
    })).min(1).max(4).default([
      { level: 1, violations: 1, action: "warn" },
      { level: 2, violations: 2, action: "mute" },
      { level: 3, violations: 3, action: "kick" },
      { level: 4, violations: 4, action: "ban" },
    ]),
  }).default({}),
  // 15. Embed builder / visual moderation
  embeds: z.object({
    enabled: z.boolean().default(false),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#5865F2"),
    iconUrl: safeHttpsUrl.nullable().default(null),
    titleTemplate: z.string().max(200).default("Moderation action"),
    descriptionTemplate: z.string().max(2_000).default("{action}: {reason}"),
    style: z.enum(["plain", "compact", "detailed"]).default("plain"),
    animations: z.boolean().default(false),
    animationUrl: safeGifUrl.nullable().default(null),
  }).default({}).refine((embed) => !embed.animations || Boolean(embed.animationUrl), {
    message: "An HTTPS GIF animationUrl is required when animations are enabled",
    path: ["animationUrl"],
  }),
  // Discord moderation is slash-command based. Prefix is intentionally
  // read-only rather than storing a non-functional custom prefix.
  bot: z.object({ prefix: z.literal("/").default("/") }).default({}),
  permissions: z.object({
    staffRoleIds: idList.default([]),
    allowManageGuild: z.boolean().default(true),
    allowAdminsSettings: z.boolean().default(false),
  }).default({}),
}).superRefine((config, ctx) => {
  validateRuleThresholds(config.autoMod.wordFilter, ["autoMod", "wordFilter"], { matches: [1, 100] }, ctx);
  validateRuleThresholds(config.autoMod.linkBlock, ["autoMod", "linkBlock"], { matches: [1, 100] }, ctx);
  validateRuleThresholds(config.autoMod.emojiLimit, ["autoMod", "emojiLimit"], { emoji: [1, 200], limit: [1, 200], max: [1, 200] }, ctx);
  validateRuleThresholds(config.autoMod.capsLimit, ["autoMod", "capsLimit"], { capsPercent: [1, 100], percent: [1, 100], limit: [1, 100] }, ctx);
  validateRuleThresholds(config.autoMod.repeatBlock, ["autoMod", "repeatBlock"], { repeat: [2, 200], limit: [2, 200], max: [2, 200] }, ctx);
  validateRuleThresholds(config.antiRaid.rule, ["antiRaid", "rule"], { joins: [1, 10_000], limit: [1, 10_000], windowSeconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.message, ["antiSpam", "message"], { messages: [1, 1_000], limit: [1, 1_000], max: [1, 1_000], windowMs: [1, 3_600], window: [1, 3_600], seconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.edit, ["antiSpam", "edit"], { edits: [1, 1_000], limit: [1, 1_000], max: [1, 1_000], windowMs: [1, 3_600], window: [1, 3_600], seconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.delete, ["antiSpam", "delete"], { deletes: [1, 1_000], limit: [1, 1_000], max: [1, 1_000], windowMs: [1, 3_600], window: [1, 3_600], seconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.mention, ["antiSpam", "mention"], { mentions: [1, 100], limit: [1, 100], max: [1, 100] }, ctx);
  validateRuleThresholds(config.antiSpam.emoji, ["antiSpam", "emoji"], { emoji: [1, 200], limit: [1, 200], max: [1, 200] }, ctx);
  validateRuleThresholds(config.antiFlood.longMessage, ["antiFlood", "longMessage"], { length: [1, 10_000], maxLength: [1, 10_000], limit: [1, 10_000] }, ctx);
  validateRuleThresholds(config.antiFlood.character, ["antiFlood", "character"], { run: [2, 2_000], limit: [2, 2_000], max: [2, 2_000] }, ctx);
  validateRuleThresholds(config.antiFlood.caps, ["antiFlood", "caps"], { capsPercent: [1, 100], percent: [1, 100], limit: [1, 100] }, ctx);
  validateRuleThresholds(config.antiFlood.symbol, ["antiFlood", "symbol"], { run: [2, 2_000], limit: [2, 2_000], max: [2, 2_000] }, ctx);
  for (const key of ["nicknameChanges", "roleChanges", "massEdits", "massDeletes", "joinLeaveFlood", "unusualActivity"] as const) {
    validateRuleThresholds(config.suspiciousBehavior[key], ["suspiciousBehavior", key], { changes: [1, 1_000], limit: [1, 1_000] }, ctx);
  }
});

export type ModerationConfig = z.infer<typeof ModerationConfigSchema>;
export type ModerationAction = z.infer<typeof action>;
export type ModerationCommand = z.infer<typeof commandName>;

export const defaultModerationConfig: ModerationConfig = ModerationConfigSchema.parse({});

export function parseModerationConfig(value: unknown): ModerationConfig {
  return ModerationConfigSchema.parse(value);
}