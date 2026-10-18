import { PUBLIC_DISCORD_INVITE } from "../lib/discord-invite";
import { SUPER_ADMIN_ID } from "../bot/constants";
import { setupDraftSchema, setupDraftSaveSchema, setupTemplate } from "./server-setup-schema";
import { setupSuggestionSchema, suggestSetup } from "./server-setup-ai";
import {
  inspectSetup, inspectSetupResources, applySetup, deleteSelectedSetupResources,
  inspectUncertainSetup, listUncertainSetup, reconcileUncertainSetup,
  inspectServerSetupAudit, fixServerSetupAuditFinding,
} from "./server-setup";
import { withSetupJournal } from "./server-setup-storage";
import { getSavedSetupDraft, saveSetupDraft, SetupDraftRevisionConflictError } from "./server-setup-drafts";
import { getActivityRankConfig, saveActivityRankConfig, isSafeActivityRewardRole } from "../bot/activity-ranks";
import { normalizeActivityRankConfig } from "../bot/activity-ranks-core";
import { isSupportedActivityBannerSource } from "../bot/activity-rank-banner-source";
import {
  ModerationGetActivityRankChannelBotAccessResponse,
  ModerationSetActivityRankChannelBotAccessBody,
  ModerationSetActivityRankChannelBotAccessResponse,
} from "@workspace/api-zod";

import 
{

 Router, type ErrorRequestHandler, type RequestHandler, type Response 
}

 from "express"
;


import 
{

 z, ZodError 
}

 from "zod"
;


import 
{

  TextChannel,
 GatewayIntentBits,
  PermissionFlagsBits,
 Routes,
}

 from "discord.js"
;


import 
{


  assertCsrf,
  assertLoginRateLimit,
  assertMutationRateLimit,
  assertGuildAccess,
  clearSessionCookie,
  createModerationSession,
  getModerationClient,
  listAccessibleGuilds,
  ModerationAuthError,
  requireSession,
  revokeRequestSessionIfPresent,
  setSessionCookie,
  type AuthenticatedRequest,
}

 from "./auth"
;


import 
{

 ActivityLogCategorySchema, EvidenceSchema, ModerationConfigSchema, type ModerationConfig
}

 from "./config"
;


import 
{

 ModerationRevisionConflictError 
}

 from "./errors"
;


import 
{


  beginDiscordOAuth,
  beginVerificationOAuth,
  consumeDiscordOAuthRequest,
  consumeDiscordOAuthState,
  exchangeDiscordOAuthCode,
  fetchBotGuildSnapshot,
  fetchDiscordOAuthIdentity,
  getDiscordBotInviteUrl,
  getVerificationWebsiteUrl,
  isDiscordOAuthConfigured,
}

 from "./oauth"
;


import type 
{

 DiscordOAuthFailureStage,
 PendingOAuthState,
}

 from "./oauth"
;


import 
{

 moderationStore 
}

 from "./store"
;


import 
{

 syncNativeAutoMod 
}

 from "../bot/native-automod"
;


import 
{

 logger 
}

 from "../lib/logger"
;


import 
{

 initChannelConfig 
}

 from "../bot/channel-config"
;


import 
{

 DEFAULT_INVITE_TRACKING_CONFIG, INVITE_REPORT_TIME_ZONES, loadInviteTrackingConfig, saveInviteTrackingConfig, loadDailyStatsEmbedConfig, loadAllianceRecruitmentText, loadChannelConfig, loadTicketConfig, loadProvisioningPermissions, saveProvisioningPermissions, saveAllianceRecruitmentText, saveChannelConfig, saveDailyStatsEmbedConfig, saveTicketConfig, loadHauntedHouseConfig, saveHauntedHouseConfig, type ChannelConfig
}

 from "../bot/db"
;


import 
{

 normalizeTicketConfig, setTicketConfig, type TicketConfig 
}

 from "../bot/ticket-config"
;


import 
{

 saveGuildGameplayConfig, getGameplayConfig, initGameplayConfig, isGameplayPaused, setGameplayPaused
}

 from "../bot/gameplay-store"
;


import 
{
 startGuildScheduler, stopGuildScheduler 
}
 from "../bot/scheduler"
;

import {
  beginHauntedHouseStop,
  buildHauntedHouseOpenAnnouncement,
  cancelHauntedHouseStop,
  completeHauntedHouseStop,
  getHauntedHouseLeaderboard,
  getHauntedHouseStatus,
  publishHauntedHouseLeaderboard,
  startHauntedHouse,
  stopHauntedHouse,
} from "../bot/haunted-house";

import 
{
 MODERATION_DESTINATION_KEYS, provisionActivityLogChannels, provisionGuildChannels, provisionModerationDestination,
 type ModerationDestinationKey
}
 from "../bot/channel-provisioning"
;

import 
{
 applyInviteTrackingConfig, getInviteStats, syncGuildInviteSnapshot 
}
 from "../bot/invite-stats"
;


import 
{

  DEFAULT_VERIFICATION_CONFIG,
  VerificationPanelPersistenceError,
  normalizeVerificationConfig,
  publishVerificationPanel,
  verifyMember,
  createVerificationIdentityToken,
  parseVerificationIdentityToken,
  verificationCookieName,
}
 from "../bot/verification"
;


import 
{
 loadVerificationConfig, saveVerificationConfig 
}
 from "../bot/db"
;


const router = Router()
;


const snowflake = z.string().regex(/^\d{5,25}$/);


const createEmojiSchema = z.object(
{

  name: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/, "Numele poate conține doar litere, cifre și underscore."),
  image: z.string().max(350_000),
}
).strict()
;


function decodeEmojiImage(dataUrl: string): 
{
 data: Buffer
;
 mime: string 
}
 
{

  const match = /^data:(image\/(?:png|jpeg|gif));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);

  if (!match) throw new ModerationAuthError(400, "Alege o imagine PNG, JPEG sau GIF validă.")
;

  const data = Buffer.from(match[2], "base64")
;

  if (!data.length || data.length > 256 * 1024) 
{

    throw new ModerationAuthError(400, "Imaginea emoji trebuie să aibă cel mult 256 KiB.")
;

  
}

  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
;

  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
;

  const gif = data.subarray(0, 6).toString("ascii") === "GIF87a" || data.subarray(0, 6).toString("ascii") === "GIF89a"
;

  if (!(png || jpeg || gif) || (match[1] === "image/png" && !png) || (match[1] === "image/jpeg" && !jpeg) || (match[1] === "image/gif" && !gif)) 
{

    throw new ModerationAuthError(400, "Conținutul fișierului nu corespunde tipului imaginii.")
;

  
}

  return { data, mime: match[1] };

}


function emojiPayload(emoji: 
{
 id: string
;
 name: string | null
;
 animated?: boolean | null 
}
) 
{

  const name = emoji.name || "emoji"
;

  const animated = Boolean(emoji.animated)
;

  return {
    id: emoji.id,
    name,
    animated,
    markup: `<${animated ? "a" : ""}:${name}:${emoji.id}>`,
    url: `https://cdn.discordapp.com/emojis/${emoji.id}.${animated ? "gif" : "png"}?size=64&quality=lossless`,
  };

}


const uuid = z.string().uuid()
;


const botChannelConfigSchema = z.object(
{


  main: snowflake.or(z.literal("")).nullable().optional(),
  event: snowflake.or(z.literal("")).nullable().optional(),
  boss: snowflake.or(z.literal("")).nullable().optional(),
  trader: snowflake.or(z.literal("")).nullable().optional(),
  eventTop: snowflake.or(z.literal("")).nullable().optional(),
  bossTop: snowflake.or(z.literal("")).nullable().optional(),
  council: snowflake.or(z.literal("")).nullable().optional(),
  fratia: snowflake.or(z.literal("")).nullable().optional(),
}

).strict()
;


export const provisioningPermissionSchema = z.object(
{

  roleIds: z.array(snowflake).max(50).default([]),
  readMessageHistory: z.boolean().default(true),
  sendMessages: z.boolean().default(true),
  rolePermissions: z.record(snowflake, z.object(
{

    viewChannel: z.boolean().default(true),
    readMessageHistory: z.boolean().default(true),
    sendMessages: z.boolean().default(true),
  
}
).strict()).optional(),
}
).strict()
;

const provisioningPermissionsSchema = z.record(
  z.string().min(1).max(40),
  provisioningPermissionSchema,
);


const provisionChannelsSchema = z.object(
{

  categories: z.array(z.enum([
    "gameplay",
    "admin",
    "filtered",
    "links",
    "security",
    "verification",
    "reports",
  ])).min(1).optional(),
  permissions: z.record(z.string(), provisioningPermissionSchema).optional(),
}
).strict()
;


function isMessageImageUrl(value: string): boolean 
{

  return value === "" ||
    /^https:\/\/\S+$/i.test(value) ||
    /^\/api\/storage\/objects\/[a-zA-Z0-9/_-]+$/.test(value)
;

}


const verificationConfigSchema = z.object(
{

  enabled: z.boolean(),
  channelId: z.union([snowflake, z.literal("")]),
  roleId: z.union([snowflake, z.literal("")]),
  title: z.string().trim().min(1).max(256),
  message: z.string().trim().min(1).max(4_000),
  buttonLabel: z.string().trim().min(1).max(80),
  buttonEmoji: z.string().trim().max(100),
  successMessage: z.string().trim().min(1).max(2_000),
  alreadyVerifiedMessage: z.string().trim().min(1).max(2_000),
  imageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage."),
  thumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").default(""),
  panelMessageId: z.union([snowflake, z.literal("")]),
}
).strict()
;


const DEFAULT_DAILY_STATS_EMBED_CONFIG = 
{

  channelId: "",
  title: "📊 Statistici Zilnice · {guild}",
  description: "O privire asupra comunității pentru **{date}**.\n\nDatele sunt colectate de Oracolul Cenușii și sunt aceleași cu raportul de pe site.",
  color: "#7c3aed",
  footer: "Oracolul Cenușii · Community Insights",
  activityTitle: "📈 Activitate · ultimele 7 zile",
  channelsTitle: "🔥 Top 5 canale active",
  emptyChannelsText: "Încă nu există mesaje înregistrate pentru această zi.",
  imageUrl: "",
  thumbnailUrl: "",
  metricLabels: 
{

    messages: "💬 Mesaje",
    uniqueUsers: "👥 Utilizatori unici",
    boosts: "🚀 Boost-uri",
    joins: "🟢 Intrări",
    leaves: "🔴 Ieșiri",
    peakVoice: "🔊 Vârf vocal",
  
}
,
}
;


const dailyStatsEmbedConfigSchema = z.object(
{

  channelId: snowflake.or(z.literal("")),
  title: z.string().trim().min(1).max(256),
  description: z.string().trim().min(1).max(4_000),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i),
  footer: z.string().trim().min(1).max(2_048),
  activityTitle: z.string().trim().min(1).max(256),
  channelsTitle: z.string().trim().min(1).max(256),
  emptyChannelsText: z.string().trim().min(1).max(1_024),
  imageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage."),
  thumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").default(""),
  metricLabels: z.object(
{

    messages: z.string().trim().min(1).max(256),
    uniqueUsers: z.string().trim().min(1).max(256),
    boosts: z.string().trim().min(1).max(256),
    joins: z.string().trim().min(1).max(256),
    leaves: z.string().trim().min(1).max(256),
    peakVoice: z.string().trim().min(1).max(256),
  
}
).strict(),
}
).strict().optional()
;


export const ticketQuestionConfigSchema = z.object(
{


  key: z.string().trim().min(1).max(32).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(45),
  description: z.string().trim().min(1).max(900),
  placeholder: z.string().trim().min(1).max(100),
  multiline: z.boolean(),
  required: z.boolean(),
  imageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage.").optional().default(""),
  thumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").optional().default(""),
}

).strict()
;


export const ticketFlowConfigSchema = z.object(
{


  mode: z.enum(["legacy", "custom"]),
  title: z.string().trim().min(1).max(256),
  startButtonLabel: z.string().trim().min(1).max(80),
  panelDescription: z.string().trim().min(1).max(2_000),
  requirementsText: z.string().trim().min(1).max(2_000),
  completionMessage: z.string().trim().min(1).max(2_000),
  staffNotificationMessage: z.string().trim().min(1).max(2_000),
  panelImageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage.").optional().default(""),
  panelThumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").optional().default(""),
  completionImageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage.").optional().default(""),
  completionThumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").optional().default(""),
  staffNotificationImageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage.").optional().default(""),
  staffNotificationThumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").optional().default(""),
  completionAction: z.enum(["lock", "notify_staff", "keep_open"]),
  questions: z.array(ticketQuestionConfigSchema).min(1).max(20),
  postedQuestionKeys: z.array(z.string().trim().min(1).max(32).regex(/^[a-z0-9_]+$/)).max(20).optional(),
}

).strict().superRefine((flow, ctx) => 
{


  const seenKeys = new Set<string>()
;


  flow.questions.forEach((question, index) => 
{


    if (seenKeys.has(question.key)) 
{


      ctx.addIssue(
{


        code: z.ZodIssueCode.custom,
        path: ["questions", index, "key"],
        message: `Cheia "${question.key}" este duplicată în acest flux.`,
      
}

)
;


      return
;


}


    seenKeys.add(question.key)
;


}

)
;


}

)
;


export const botControlSchema = z.object(
{


  channels: botChannelConfigSchema,
  provisioningPermissions: provisioningPermissionsSchema.default(
{
}
),
  // An empty value means "use the bot's built-in recruitment text". The GET
  // endpoint already returns an empty string when no override is stored, so
  // PUT must accept that same round-trip value.
  allianceRecruitmentText: z.string().trim().max(2_000),
  dailyStats: dailyStatsEmbedConfigSchema,
  inviteTracking: z.object(
{

    enabled: z.boolean(),
    joinLogChannelId: snowflake.or(z.literal("")),
    reportEnabled: z.boolean(),
    reportChannelId: snowflake.or(z.literal("")),
    reportFrequency: z.enum(["daily", "weekly"]),
    reportTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    reportWeekday: z.number().int().min(1).max(7),
    reportTimeZone: z.enum(INVITE_REPORT_TIME_ZONES),
    reportTopLimit: z.number().int().min(3).max(10),
  
}
).strict().default(DEFAULT_INVITE_TRACKING_CONFIG).superRefine((config, ctx) => 
{

    if (config.reportEnabled && !config.enabled) 
{

      ctx.addIssue(
{

        code: z.ZodIssueCode.custom,
        path: ["reportEnabled"],
        message: "Activează mai întâi colectarea statisticilor.",
      
}
)
;

    
}

    if (config.reportEnabled && !config.reportChannelId) 
{

      ctx.addIssue(
{

        code: z.ZodIssueCode.custom,
        path: ["reportChannelId"],
        message: "Alege canalul pentru raportul automat.",
      
}
)
;

    
}

  
}
),
  tickets: z.object(
{


    categories: z.object(
{


      staff: snowflake.or(z.literal("")),
      partnership: snowflake.or(z.literal("")),
      help_report: snowflake.or(z.literal("")),
    
}

).strict(),
    staffReviewRoleId: snowflake,
    alliancePublicChannelId: snowflake.or(z.literal("")),
    allianceOwnerGuildId: snowflake,
    allianceAnnouncementTemplate: z.string().trim().max(2_000).optional(),
    allianceAnnouncementMode: z.enum(["text", "embed"]).optional(),
    allianceAnnouncementImageUrl: z.string().trim().max(2_000).refine((value) => isMessageImageUrl(value), "Imaginea trebuie să fie HTTPS sau încărcată în storage.").optional(),
    allianceAnnouncementThumbnailUrl: z.string().trim().max(2_000).refine((value) => isMessageImageUrl(value), "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").optional(),
    allianceAnnouncementImageMode: z.enum(["none", "large", "thumbnail"]).optional(),
    incompleteTimeoutMinutes: z.number().int().min(10).max(240),
    firstWarningMinutes: z.number().int().min(1).max(180),
    secondWarningMinutes: z.number().int().min(2).max(239),
    flows: z.object(
{


      staff: ticketFlowConfigSchema,
      partnership: ticketFlowConfigSchema,
      help_report: ticketFlowConfigSchema,
    
}

).strict(),
  
}

).strict().optional(),
  gameplayConfig: z.object(
{

    paused: z.boolean(),
    messages: z.object(
{

      gamePaused: z.string().trim().min(1).max(2_000),
      oraclePaused: z.string().trim().min(1).max(2_000),
      gamePausedImageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage."),
      gamePausedThumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").default(""),
      oraclePausedImageUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Imaginea trebuie să fie HTTPS sau încărcată în storage."),
      oraclePausedThumbnailUrl: z.string().trim().max(2_000).refine(isMessageImageUrl, "Thumbnail-ul trebuie să fie HTTPS sau încărcat în storage.").default(""),
    
}
).strict().default(
{

      gamePaused: "⏸️ Jocul este oprit momentan. Un administrator îl poate reporni cu `/startjoc`.",
      oraclePaused: "🛑 Oracle AI este oprit momentan. Un administrator îl poate reporni cu `/startai`.",
      gamePausedImageUrl: "",
      gamePausedThumbnailUrl: "",
      oraclePausedImageUrl: "",
      oraclePausedThumbnailUrl: "",
    
}
),

    memberMessages: z.object(
{

      welcomeEnabled: z.boolean(),
      leaveEnabled: z.boolean(),
      channelId: snowflake.or(z.literal("")).default(""),
      style: z.enum(["medieval", "normal", "fantasy", "sci_fi", "humorous", "custom"]).default("normal"),
      customStyle: z.string().trim().max(180).default(""),
    
}
).strict().default(
{

      welcomeEnabled: false,
      leaveEnabled: false,
      channelId: "",
      style: "normal",
      customStyle: "",
    
}
),

    events: z.object(
{


      eventDurationMinutes: z.number().int().min(1).max(1_440),
      eventCooldownMinMinutes: z.number().int().min(1).max(1_440),
      eventCooldownMaxMinutes: z.number().int().min(1).max(1_440),
      finalBossDurationMinutes: z.number().int().min(1).max(1_440),
      standaloneBossIntervalMinMinutes: z.number().int().min(1).max(1_440),
      standaloneBossIntervalMaxMinutes: z.number().int().min(1).max(1_440),
      standaloneBossDurationMinutes: z.number().int().min(1).max(1_440),
      battleEventIntervalMinutes: z.number().int().min(1).max(1_440),
      chestIntervalMinutes: z.number().int().min(1).max(1_440),
      chestExpireMinutes: z.number().int().min(1).max(120),
    
}

).strict().superRefine((value, ctx) => 
{


      if (value.eventCooldownMaxMinutes < value.eventCooldownMinMinutes) 
{


        ctx.addIssue(
{

 code: z.ZodIssueCode.custom, path: ["eventCooldownMaxMinutes"], message: "Intervalul maxim trebuie să fie cel puțin egal cu minimul." 
}

)
;


}


      if (value.standaloneBossIntervalMaxMinutes < value.standaloneBossIntervalMinMinutes) 
{


        ctx.addIssue(
{

 code: z.ZodIssueCode.custom, path: ["standaloneBossIntervalMaxMinutes"], message: "Intervalul maxim trebuie să fie cel puțin egal cu minimul." 
}

)
;


}


}

),
    missions: z.object(
{


      kill_10: z.object(
{

 target: z.number().int().min(1).max(10_000), rewardQty: z.number().int().min(1).max(100) 
}

).strict(),
      rare_3: z.object(
{

 target: z.number().int().min(1).max(10_000), rewardQty: z.number().int().min(1).max(100) 
}

).strict(),
      boss_1: z.object(
{

 target: z.number().int().min(1).max(10_000), rewardQty: z.number().int().min(1).max(100) 
}

).strict(),
    
}

).strict(),
    economy: z.object(
{


      monsterGoldMultiplier: z.number().finite().min(0.1).max(10),
      monsterXpMultiplier: z.number().finite().min(0.1).max(10),
      bossGoldMultiplier: z.number().finite().min(0.1).max(10),
      bossXpMultiplier: z.number().finite().min(0.1).max(10),
    
}

).strict(),
  
}

).strict(),
  verification: verificationConfigSchema.default(DEFAULT_VERIFICATION_CONFIG),
}

).strict()
;


const actionType = z.enum(["warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock", "unlock", "nick", "role"])
;


const idempotencyKeySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/)
;


const paginationSchema = z.object(
{


  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}

)
;

const auditQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(200).default(""),
  category: z.enum(["all", "messages", "members", "channels", "roles", "voice", "moderation", "security", "other"]).default("all"),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
}).superRefine((query, context) => {
  if (query.start && query.end && Date.parse(query.start) > Date.parse(query.end)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end"],
      message: "The audit end date must be on or after the start date.",
    });
  }
});


const actionSchema = z.object(
{


  type: actionType,
  targetId: snowflake.optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  durationMinutes: z.number().int().min(1).max(40_320).optional(),
  channelId: snowflake.optional(),
  roleId: snowflake.optional(),
  nickname: z.string().trim().min(1).max(32).optional(),
  amount: z.number().int().min(0).max(21_600).optional(),
}

).superRefine((value, ctx) => 
{


  if (["warn", "mute", "kick", "ban", "unmute", "nick", "role"].includes(value.type) && !value.targetId) 
{


    ctx.addIssue(
{

 code: z.ZodIssueCode.custom, message: "targetId is required for this action" 
}

)
;


}


  if (value.type === "mute" && !value.durationMinutes) 
{


    ctx.addIssue(
{

 code: z.ZodIssueCode.custom, message: "durationMinutes is required for mute" 
}

)
;


}


  if (["purge", "slowmode", "lock", "unlock"].includes(value.type) && !value.channelId) 
{


    ctx.addIssue(
{

 code: z.ZodIssueCode.custom, path: ["channelId"], message: "Alege un canal pentru această comandă." 
}

)
;


}


  if (value.type === "purge" && (value.amount === undefined || value.amount < 1 || value.amount > 100)) 
{


    ctx.addIssue(
{

 code: z.ZodIssueCode.custom, path: ["amount"], message: "Purge necesită între 1 și 100 de mesaje." 
}

)
;


}


  if (value.type === "slowmode" && value.amount === undefined) 
{


    ctx.addIssue(
{

 code: z.ZodIssueCode.custom, path: ["amount"], message: "Slowmode necesită 0–21600 secunde; 0 îl dezactivează." 
}

)
;


}


  if (value.type === "nick" && !value.nickname) 
{


    ctx.addIssue(
{

 code: z.ZodIssueCode.custom, path: ["nickname"], message: "Introdu noul nickname." 
}

)
;


}


  if (value.type === "role" && !value.roleId) 
{


    ctx.addIssue(
{

 code: z.ZodIssueCode.custom, path: ["roleId"], message: "Alege rolul de adăugat." 
}

)
;


}


}

)
;


function asyncRoute(handler: (req: AuthenticatedRequest, res: Response) => Promise<void>): RequestHandler 
{


  return (req, res, next) => 
{

 void handler(req as AuthenticatedRequest, res).catch(next)
;

 
}

;


}


function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> 
{


  return schema.parse(value)
;


}


function optionalExport<T>(getter: () => T): T | null 
{

  try 
{

    return getter()
;

  
}
 catch 
{

    return null
;

  
}

}


function discordOAuthDetails(error: unknown): 
{

 stage: DiscordOAuthFailureStage
;

 status?: number 
}

 | null 
{


  if (!error || typeof error !== "object") return null
;


  const value = error as 
{

 stage?: unknown
;

 status?: unknown 
}

;


  if (
    value.stage !== "token_exchange" &&
    value.stage !== "token_response" &&
    value.stage !== "oauth_api" &&
    value.stage !== "oauth_response"
  ) 
{


    return null
;


}


  return {
    stage: value.stage,
    ...(typeof value.status === "number" ? { status: value.status } : {}),
  };


}


function expectedRevision(req: AuthenticatedRequest): number 
{


  const value = req.header("if-match")
;


  const match = value?.match(/^"?(\d+)"?$/)
;


  if (!match) throw new ModerationAuthError(428, "If-Match configuration revision is required")
;


  const revision = Number(match[1])
;


  if (!Number.isSafeInteger(revision) || revision < 0) throw new ModerationAuthError(400, "Invalid configuration revision")
;


  return revision
;


}


async function validateConfigTargets(guildId: string, config: ModerationConfig, previous: ModerationConfig): Promise<void>
{


  const client = getModerationClient()
;


  if (!client) throw new ModerationAuthError(503, "Discord moderation client is not available")
;


  const hasMessageContent = client.options.intents.has(GatewayIntentBits.MessageContent)
;


  const hasGuildMembers = client.options.intents.has(GatewayIntentBits.GuildMembers)
;


  const messageModuleActivated = (["autoMod", "antiSpam", "antiFlood", "ai"] as const)
    .some((key) => config[key].enabled && (!previous[key].enabled || !previous.protection.enabled));
  if (!hasMessageContent && config.protection.enabled && messageModuleActivated)
{


    throw new ModerationAuthError(400, "Enable the Discord Message Content intent before enabling message moderation modules")
;


}


  const memberModuleActivated = (["antiRaid", "suspiciousBehavior"] as const)
    .some((key) => config[key].enabled && (!previous[key].enabled || !previous.protection.enabled));
  if (!hasGuildMembers && config.protection.enabled && memberModuleActivated)
{


    throw new ModerationAuthError(400, "Enable the Discord Server Members intent before enabling raid or member-behaviour detection")
;


}


  const roleIds = [
    ...config.permissions.staffRoleIds, ...config.roles.sanctionableRoleIds,
    ...config.roles.protectedRoleIds, ...config.roles.ignoredAutoModRoleIds,
    ...config.roles.specialPermissionRoleIds, ...Object.values(config.manualTools.commandGrants).flat(),
  ];
  const previousRoleIds = [
    ...previous.permissions.staffRoleIds, ...previous.roles.sanctionableRoleIds,
    ...previous.roles.protectedRoleIds, ...previous.roles.ignoredAutoModRoleIds,
    ...previous.roles.specialPermissionRoleIds, ...Object.values(previous.manualTools.commandGrants).flat(),
  ];
  const channelIds = [
    ...config.channels.ignoredChannelIds, ...config.channels.protectedChannelIds,
    ...config.channels.autoSlowmodeChannelIds, ...config.channels.strictChannelIds,
    ...config.channels.softChannelIds,
    ...Object.values(config.activityLog.channelIds),
    config.autoMod.logChannelId, config.antiFlood.logChannelId,
    config.antiRaid.alertChannelId, config.antiSpam.logChannelId, config.audit.channelId,
    config.suspiciousBehavior.alertChannelId, config.ai.logChannelId,
  ].filter((id): id is string => Boolean(id));
  const previousChannelIds = [
    ...previous.channels.ignoredChannelIds, ...previous.channels.protectedChannelIds,
    ...previous.channels.autoSlowmodeChannelIds, ...previous.channels.strictChannelIds,
    ...previous.channels.softChannelIds,
    ...Object.values(previous.activityLog.channelIds),
    previous.autoMod.logChannelId, previous.antiFlood.logChannelId,
    previous.antiRaid.alertChannelId, previous.antiSpam.logChannelId, previous.audit.channelId,
    previous.suspiciousBehavior.alertChannelId, previous.ai.logChannelId,
  ].filter((id): id is string => Boolean(id));
  const newRoleIds = roleIds.filter((id) => !previousRoleIds.includes(id));
  const newChannelIds = channelIds.filter((id) => !previousChannelIds.includes(id));
  if (!newRoleIds.length && !newChannelIds.length) return;
  const guild = await client.guilds.fetch(
{

 guild: guildId, force: true 
}

)
;


  const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()])
;


  const missingRole = newRoleIds.find((id) => !roles.has(id))
;


  if (missingRole) throw new ModerationAuthError(400, `Role ${missingRole} is not in this guild`)
;


  const missingChannel = newChannelIds.find((id) => !channels.has(id))
;


  if (missingChannel) throw new ModerationAuthError(400, `Channel ${missingChannel} is not in this guild`)
;


  const nonTextChannel = newChannelIds.find((id) => !channels.get(id)?.isTextBased())
;


  if (nonTextChannel) throw new ModerationAuthError(400, `Channel ${nonTextChannel} is not a text-based guild channel`)
;


}


async function validateInviteTrackingTargets(guildId: string, config: z.infer<typeof botControlSchema>["inviteTracking"]) 
{

  const client = getModerationClient()
;

  if (!client?.isReady()) return null
;


  const cachedGuild = client.guilds.cache?.get(guildId)
;

  if (!config.enabled) return cachedGuild ?? null
;

  const guild = cachedGuild ?? await client.guilds.fetch(
{
 guild: guildId, force: true 
}
)
    .catch(() => 
{
 throw new ModerationAuthError(503, "Serverul Discord nu este disponibil.")
;
 
}
)
;


  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null)
;

  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) 
{

    throw new ModerationAuthError(403, "Botul are nevoie de permisiunea Manage Server pentru a urmări invitațiile.")
;

  
}


  if (config.reportEnabled) 
{

    const channel = await guild.channels.fetch(config.reportChannelId).catch(() => null)
;

    if (!(channel instanceof TextChannel) || channel.guildId !== guildId) 
{

      throw new ModerationAuthError(400, "Alege un canal text valid din acest server pentru raportul invitațiilor.")
;

    
}

    if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages)) 
{

      throw new ModerationAuthError(403, "Botul nu are permisiunea de a trimite mesaje în canalul raportului.")
;

    
}

  
}

  if (config.joinLogChannelId) {
    const channel = await guild.channels.fetch(config.joinLogChannelId).catch(() => null);
    if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
      throw new ModerationAuthError(400, "Alege un canal text valid din acest server pentru jurnalul invitațiilor.");
    }
    if (!channel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages)) {
      throw new ModerationAuthError(403, "Botul nu are permisiunea de a trimite mesaje în canalul jurnalului invitațiilor.");
    }
  }

  return guild
;

}

async function validateDailyStatsChannelTarget(guildId: string, channelId: string): Promise<void> {
  if (!channelId) return;
  const client = getModerationClient();
  if (!client?.isReady()) return;

  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch({ guild: guildId, force: true })
    .catch(() => {
      throw new ModerationAuthError(503, "Serverul Discord nu este disponibil.");
    });
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    throw new ModerationAuthError(400, "Alege un canal text valid din acest server pentru statisticile zilnice.");
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel)
    || !permissions.has(PermissionFlagsBits.SendMessages)
    || !permissions.has(PermissionFlagsBits.EmbedLinks)
  ) {
    throw new ModerationAuthError(
      403,
      "Botul are nevoie de permisiunile View Channel, Send Messages și Embed Links în canalul statisticilor.",
    );
  }
}

async function validateBotControlChannelTargets(guildId: string, channels: ChannelConfig): Promise<void> {
  const configuredTargets = Object.entries(channels).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (!configuredTargets.length) return;

  const client = getModerationClient();
  if (!client?.isReady()) return;

  const guild = client.guilds.cache?.get(guildId) ?? await client.guilds.fetch({ guild: guildId, force: true })
    .catch(() => {
      throw new ModerationAuthError(503, "Serverul Discord nu este disponibil.");
    });
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember) throw new ModerationAuthError(503, "Membrii serverului Discord nu sunt disponibili.");

  for (const [key, channelId] of configuredTargets) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
      throw new ModerationAuthError(400, `Canalul configurat pentru ${key} nu este un canal text valid din acest server.`);
    }

    const permissions = channel.permissionsFor(botMember);
    if (
      !permissions?.has(PermissionFlagsBits.ViewChannel)
      || !permissions.has(PermissionFlagsBits.SendMessages)
      || !permissions.has(PermissionFlagsBits.EmbedLinks)
    ) {
      throw new ModerationAuthError(
        403,
        `Botul are nevoie de permisiunile View Channel, Send Messages și Embed Links în canalul ${key}.`,
      );
    }
  }
}

async function validateMemberMessagesChannelTarget(
  guildId: string,
  gameplayConfig: z.infer<typeof botControlSchema>["gameplayConfig"],
): Promise<void> {
  const memberMessages = gameplayConfig.memberMessages;
  if (!memberMessages.welcomeEnabled && !memberMessages.leaveEnabled) return;
  if (!memberMessages.channelId) {
    throw new ModerationAuthError(400, "Configurează un canal text pentru mesajele de bun venit și plecare.");
  }

  const client = getModerationClient();
  if (!client?.isReady()) return;

  const guild = client.guilds.cache?.get(guildId) ?? await client.guilds.fetch({ guild: guildId, force: true })
    .catch(() => {
      throw new ModerationAuthError(503, "Serverul Discord nu este disponibil.");
    });
  const channel = await guild.channels.fetch(memberMessages.channelId).catch(() => null);
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    throw new ModerationAuthError(400, "Canalul mesajelor de bun venit și plecare nu este un canal text valid din acest server.");
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel)
    || !permissions.has(PermissionFlagsBits.SendMessages)
    || !permissions.has(PermissionFlagsBits.EmbedLinks)
  ) {
    throw new ModerationAuthError(
      403,
      "Botul are nevoie de permisiunile View Channel, Send Messages și Embed Links în canalul mesajelor de bun venit și plecare.",
    );
  }
}


async function validateEvidenceTargets(guildId: string, evidence: z.infer<typeof EvidenceSchema>): Promise<void> 
{


  const channelIds = evidence.flatMap((item) => item.channelId ? [item.channelId] : [])
;


  if (!channelIds.length) return
;


  const client = getModerationClient()
;


  if (!client) throw new ModerationAuthError(503, "Discord moderation client is not available")
;


  const guild = await client.guilds.fetch(
{

 guild: guildId, force: true 
}

)
;


  const channels = await guild.channels.fetch()
;


  const missing = channelIds.find((id) => !channels.has(id))
;


  if (missing) throw new ModerationAuthError(400, `Evidence channel ${missing} is not in this guild`)
;


}


async function enforceCaseRetention(guildId: string): Promise<ModerationConfig> 
{


  const config = (await moderationStore.getConfig(guildId)).config
;


  await moderationStore.pruneCases(guildId, config.cases.retentionDays)
;


  return config
;


}


async function sessionAndGuild(req: AuthenticatedRequest, guildId: string, purpose: "operations" | "config" | "audit", csrf = false) 
{


  const session = await requireSession(req)
;


  if (csrf) assertCsrf(req, session)
;


  if (csrf) assertMutationRateLimit(session)
;


  await assertGuildAccess(guildId, session.userId, purpose)
;


  return session
;


}


router.get("/session", asyncRoute(async (req, res) => 
{


  try 
{


    const session = await requireSession(req)
;


    const guilds = await listAccessibleGuilds(session.userId)
;


  res.json(
{

 authenticated: true, userId: session.userId, isBotOwner: session.userId === SUPER_ADMIN_ID, guilds, csrfToken: session.csrfToken, expiresAt: session.expiresAt.toISOString()
}

)
;


}

 catch (error) 
{


    if (error instanceof ModerationAuthError) 
{


      res.status(200).json(
{

 authenticated: false 
}

)
;


      return
;


}


    throw error
;


}


}

))
;


router.get("/auth-config", (_req, res) => 
{

  const bot = getModerationClient()?.user
;


  res.json(
{


    discordOAuthConfigured: isDiscordOAuthConfigured(),
    authorizationUrl: "/api/moderation/oauth/discord",
    botInviteUrl: getDiscordBotInviteUrl(),
    bot: bot ? 
{

      name: bot.globalName || bot.username,
      avatarUrl: bot.displayAvatarURL(
{
 size: 128 
}
),
    
}
 : null,
  
}

)
;


}

)
;


 function oauthFailure(res: Response, code: "oauth_not_configured" | "state_mismatch" | "cancelled" | "oauth_failed" | "no_eligible_guild"): void
{


  res.redirect(`/moderare?auth_error=${code}`)
;


}


function verificationFailure(res: Response, guildId: string | undefined, code: string): void 
{

  const suffix = guildId ? `&guildId=${encodeURIComponent(guildId)}` : ""
;

  res.redirect(`/verificare?verification_error=${encodeURIComponent(code)}${suffix}`)
;

}


router.get("/oauth/discord", (req, res) => 
{


  try 
{


    assertLoginRateLimit(req)
;


    const verificationGuildId = typeof req.query.guildId === "string" ? parse(snowflake, req.query.guildId) : null
;

    if (req.query.verification === "1") 
{

      if (!verificationGuildId) 
{

        res.redirect("/verificare?verification_error=invalid_server")
;

        return
;

      
}

      res.redirect(beginVerificationOAuth(res, verificationGuildId))
;

      return
;

    
}


    res.redirect(beginDiscordOAuth(res))
;


}

 catch 
{


    oauthFailure(res, "oauth_not_configured")
;


}


}

)
;


router.get("/oauth/discord/callback", asyncRoute(async (req, res) => 
{


  const state = typeof req.query.state === "string" ? req.query.state : undefined
;


  const consumeRequest = optionalExport(() => consumeDiscordOAuthRequest)
;

  const consumeState = optionalExport(() => consumeDiscordOAuthState)
;

  const pendingState: PendingOAuthState | null = consumeRequest
    ? consumeRequest(req, res, state)
    : consumeState?.(req, res, state)
      ? 
{
 purpose: "moderation" as const, expiresAt: 0 
}

      : null
  
;


  if (!pendingState)
{


    oauthFailure(res, "state_mismatch")
;


    return
;


}


  const oauthError = typeof req.query.error === "string" ? req.query.error : undefined
;


  if (oauthError === "access_denied") 
{


    if (pendingState.purpose === "verification") 
{

      verificationFailure(res, pendingState.guildId, "cancelled")
;

    
}
 else 
{

      oauthFailure(res, "cancelled")
;

    
}

;


    return
;


}


  const code = typeof req.query.code === "string" ? req.query.code : undefined
;


  if (!code || oauthError) 
{


    if (pendingState.purpose === "verification") 
{

      verificationFailure(res, pendingState.guildId, "oauth_failed")
;

    
}
 else 
{

      oauthFailure(res, "oauth_failed")
;

    
}

;


    return
;


}


  let failureStage: "token_exchange" | "identity" | "guild_access" | "session" = "token_exchange"
;


  try 
{


    const accessToken = await exchangeDiscordOAuthCode(code)
;


    failureStage = "identity"
;


    const identity = await fetchDiscordOAuthIdentity(accessToken)
;


    if (pendingState.purpose === "verification") 
{

      const guildId = pendingState.guildId
;

      if (!guildId) 
{

        res.redirect("/verificare?verification_error=invalid_server")
;

        return
;

      
}

      const snapshot = await fetchBotGuildSnapshot(guildId, identity.id)
;

      if (!snapshot) 
{

        res.redirect(`/verificare?guildId=${encodeURIComponent(guildId)}&verification_error=not_member`)
;

        return
;

      
}

      const client = getModerationClient()
;

      if (!client) 
{

        res.redirect(`/verificare?guildId=${encodeURIComponent(guildId)}&verification_error=bot_offline`)
;

        return
;

      
}

      const result = await verifyMember(client, guildId, identity.id)
;

      res.cookie(verificationCookieName(), createVerificationIdentityToken(guildId, identity.id), 
{

        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1_000,
      
}
)
;

      res.redirect(`/verificare?guildId=${encodeURIComponent(guildId)}&verification=${result}`)
;

      return
;

    
}


    // The OAuth guild list is only a candidate set.  listAccessibleGuilds
    // intersects it with bot membership and then force-fetches current member
    // permissions, so a forged OAuth permission field cannot grant access.
    failureStage = "guild_access"
;


    const guilds = await listAccessibleGuilds(identity.id, identity.guilds)
;


    if (!guilds.length) 
{


      oauthFailure(res, "no_eligible_guild")
;


      return
;


}


    failureStage = "session"
;


    const 
{

 token, session 
}

 = await createModerationSession(identity.id)
;


    await revokeRequestSessionIfPresent(req)
;


    setSessionCookie(res, token, session.expiresAt)
;


    res.redirect("/moderare")
;


}

 catch (error) 
{


    // Never reflect Discord's response or the authorization code in a browser
    // redirect.  OAuth tokens are held only in this stack frame and are never
    // logged or sent to the client.
    const discordError = discordOAuthDetails(error);
    logger.warn({
      stage: failureStage,
      discordStage: discordError?.stage,
      discordStatus: discordError?.status,
      errorType: error instanceof Error ? error.name : typeof error,
    }, "Discord moderation OAuth callback failed");
    if (pendingState.purpose === "verification") {
      verificationFailure(res, pendingState.guildId, "oauth_failed");
    } else {
      oauthFailure(res, "oauth_failed");
    }
  }
}));

/** The old Discord-issued code flow is intentionally not accepted anymore. */
router.post("/login", (_req, res) => {
  res.status(410).json({ error: "Moderation login now uses Discord OAuth2" });
});

router.post("/logout", asyncRoute(async (req, res) => {
  const session = await requireSession(req);
  assertCsrf(req, session);
  await moderationStore.revokeSession(session.tokenHash);
  clearSessionCookie(res);
  res.status(204).end();
}));

router.get("/guilds/:guildId/config", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const result = await moderationStore.getConfig(guildId);
  const client = getModerationClient();
  let missingPermissions: string[] = [];
  if (result.config.activityLog.enabled) {
    if (!client?.isReady()) {
      missingPermissions = ["Botul Discord este offline."];
    } else {
      const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        missingPermissions = ["Botul nu este membru al serverului sau nu îl poate accesa."];
      } else {
        const permissions = guild.members.me?.permissions;
        if (!permissions?.has(PermissionFlagsBits.ManageChannels)) missingPermissions.push("Manage Channels");
        if (!permissions?.has(PermissionFlagsBits.ManageRoles)) missingPermissions.push("Manage Roles");
      }
    }
  }
  res.set("Cache-Control", "no-store").set("ETag", `"${result.version}"`).json({
    ...result,
    activityLogStatus: {
      enabled: result.config.activityLog.enabled,
      categoryId: result.config.activityLog.categoryId,
      configuredCategories: Object.entries(result.config.activityLog.categories)
        .filter(([key, enabled]) => enabled && result.config.activityLog.channelIds[key as keyof typeof result.config.activityLog.channelIds])
        .map(([key]) => key),
      missingPermissions,
    },
  });
}));

const CONFIG_CHANNEL_DESTINATIONS = [
  "activityLog.messages",
  "activityLog.members",
  "activityLog.channels",
  "activityLog.roles",
  "activityLog.voice",
  "activityLog.moderation",
  "activityLog.security",
  ...MODERATION_DESTINATION_KEYS,
] as const;

router.post("/guilds/:guildId/config/channels", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  const { destination } = z.object({
    destination: z.enum(CONFIG_CHANNEL_DESTINATIONS),
  }).strict().parse(req.body);
  const revision = expectedRevision(req);
  const previous = await moderationStore.getConfig(guildId);
  if (previous.version !== revision) throw new ModerationRevisionConflictError();

  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new ModerationAuthError(503, "Botul Discord nu poate accesa serverul.");
  const botPermissions = guild.members.me?.permissions;
  const missingPermissions = [
    !botPermissions?.has(PermissionFlagsBits.ManageChannels) ? "Manage Channels" : null,
    !botPermissions?.has(PermissionFlagsBits.ManageRoles) ? "Manage Roles" : null,
  ].filter((permission): permission is string => Boolean(permission));
  if (missingPermissions.length) {
    throw new ModerationAuthError(403, `Botului îi lipsesc permisiunile necesare pentru canale private: ${missingPermissions.join(", ")}.`);
  }

  let config = structuredClone(previous.config);
  let channel: { key: string; id: string; name: string; type: "text" };
  let created = false;
  try {
    if (destination.startsWith("activityLog.")) {
      const category = ActivityLogCategorySchema.parse(destination.slice("activityLog.".length));
      const provisioned = await provisionActivityLogChannels(guild, {
        activityLog: {
          ...previous.config.activityLog,
          roleIds: [],
          categories: { ...previous.config.activityLog.categories, [category]: true },
        },
        onlyCategories: [category],
      });
      config = {
        ...previous.config,
        activityLog: provisioned.activityLog,
      };
      const key = `activityLog.${category}`;
      const provisionedChannel = [...provisioned.created, ...provisioned.reused].find((item) => item.key === key);
      if (!provisionedChannel) throw new Error("Canalul jurnalului nu a fost returnat după provisionare.");
      channel = { ...provisionedChannel, type: "text" };
      created = provisioned.created.some((item) => item.key === key);
    } else {
      const moderationDestination = destination as ModerationDestinationKey;
      const provisioned = await provisionModerationDestination(guild, {
        moderationConfig: config,
        destination: moderationDestination,
      });
      config = provisioned.moderationConfig;
      channel = { ...provisioned.channel, type: "text" };
      created = provisioned.created;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "eroare necunoscută";
    logger.warn({ error, guildId, destination }, "Moderation channel provisioning failed");
    throw new ModerationAuthError(400, `Canalul nu a putut fi creat sau configurat. Verifică permisiunile Discord. Detalii: ${reason}`);
  }

  const result = await moderationStore.putConfig(guildId, config, session.userId, revision);
  res.set("Cache-Control", "no-store").set("ETag", `"${result.version}"`)
    .status(created ? 201 : 200)
    .json({ config: result.config, version: result.version, destination, channel, created });
}));

type ProtectionToggleKey = Parameters<typeof moderationStore.putProtectionToggle>[1];

const protectionToggleLabels: Record<ProtectionToggleKey, string> = {
  protection: "Protecția globală",
  autoMod: "AutoMod",
  wordFilter: "Filtrul de cuvinte",
  linkBlock: "Blocarea linkurilor",
  antiRaid: "Anti-Raid",
  antiSpam: "Anti-Spam",
  antiFlood: "Anti-Flood",
  suspiciousBehavior: "Comportament suspect",
  ai: "Moderarea AI",
  manualTools: "Uneltele staff",
  cases: "Cazurile de moderare",
  audit: "Auditul",
  escalation: "Escaladarea",
  embeds: "Embed-urile",
};
const protectionToggleKeys = Object.keys(protectionToggleLabels) as ProtectionToggleKey[];

function protectionToggleEnabled(config: ModerationConfig, key: ProtectionToggleKey): boolean {
  switch (key) {
    case "protection": return config.protection.enabled;
    case "autoMod": return config.autoMod.enabled;
    case "wordFilter": return config.autoMod.wordFilter.enabled;
    case "linkBlock": return config.autoMod.linkBlock.enabled;
    case "antiRaid": return config.antiRaid.enabled;
    case "antiSpam": return config.antiSpam.enabled;
    case "antiFlood": return config.antiFlood.enabled;
    case "suspiciousBehavior": return config.suspiciousBehavior.enabled;
    case "ai": return config.ai.enabled;
    case "manualTools": return config.manualTools.enabled;
    case "cases": return config.cases.enabled;
    case "audit": return config.audit.enabled;
    case "escalation": return config.escalation.enabled;
    case "embeds": return config.embeds.enabled;
  }
}

type ActivationNoticeStatus =
  | "sent"
  | "no_channel"
  | "bot_offline"
  | "guild_unavailable"
  | "channel_unavailable"
  | "send_failed";

async function sendProtectionActivationNotice(
  guildId: string,
  actorId: string,
  keys: ProtectionToggleKey[],
  config: ModerationConfig,
): Promise<ActivationNoticeStatus> {
  const channelId = config.audit.channelId;
  if (!channelId) return "no_channel";

  const client = getModerationClient();
  if (!client?.isReady()) return "bot_offline";

  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return "guild_unavailable";
  const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) return "channel_unavailable";

  const hasPausedModule = keys.some((key) =>
    key === "autoMod" || key === "wordFilter" || key === "linkBlock" ||
    key === "antiRaid" || key === "antiSpam" || key === "antiFlood" ||
    key === "suspiciousBehavior" || key === "ai",
  );
  const pausedNote = hasPausedModule && !config.protection.enabled
    ? " Protecția globală este oprită, deci modulul nu va procesa evenimente până când aceasta este pornită."
    : "";
  const moduleLines = keys.map((key) => `• **${protectionToggleLabels[key]} activat**`).join("\n");
  const content = `🛡️ **${keys.length === 1 ? "Modul de moderare activat" : "Module de moderare activate"}**\n${moduleLines}\nActivat de <@${actorId}> din panoul web.${pausedNote}`;

  try {
    await channel.send({ content, allowedMentions: { parse: [] } });
    return "sent";
  } catch (error) {
    logger.warn({ error, guildId, channelId, keys }, "Moderation module activation notice could not be sent");
    return "send_failed";
  }
}

async function notifyNewlyEnabledModules(
  guildId: string,
  actorId: string,
  previousConfig: ModerationConfig,
  config: ModerationConfig,
): Promise<{ status: ActivationNoticeStatus | "not_applicable"; modules: string[] }> {
  const newlyEnabled = protectionToggleKeys.filter((key) =>
    !protectionToggleEnabled(previousConfig, key) && protectionToggleEnabled(config, key),
  );
  if (!newlyEnabled.length) return { status: "not_applicable", modules: [] };
  const status = await sendProtectionActivationNotice(guildId, actorId, newlyEnabled, config);
  return { status, modules: newlyEnabled.map((key) => protectionToggleLabels[key]) };
}

async function syncNativeAutoModForResponse(
  guildId: string,
  config: ModerationConfig,
): Promise<{ status: "synced" | "bot_offline" | "missing_permission" | "conflict" | "failed" }> {
  const client = getModerationClient();
  if (!client?.isReady()) return { status: "bot_offline" };
  try {
    return { status: await syncNativeAutoMod(client, guildId, config) };
  } catch (error) {
    logger.warn({ error, guildId }, "Native Discord AutoMod synchronization failed after config save");
    return { status: "failed" };
  }
}

router.put("/guilds/:guildId/protection-toggle", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  const { key, enabled } = z.object({
    key: z.enum([
      "protection", "autoMod", "wordFilter", "linkBlock", "antiRaid", "antiSpam",
      "antiFlood", "suspiciousBehavior", "ai", "manualTools", "cases", "audit",
      "escalation", "embeds",
    ]),
    enabled: z.boolean(),
  }).parse(req.body);

  const result = await moderationStore.putProtectionToggle(guildId, key, enabled, session.userId);
  const notification = await notifyNewlyEnabledModules(
    guildId,
    session.userId,
    result.previousConfig,
    result.config,
  );
  const nativeAutoMod = await syncNativeAutoModForResponse(guildId, result.config);
  res.set("Cache-Control", "no-store").set("ETag", `"${result.version}"`).json({
    config: result.config,
    version: result.version,
    notification,
    nativeAutoMod,
  });
}));

router.get("/guilds/:guildId/gameplay-state", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  await initGameplayConfig(guildId);
  res.set("Cache-Control", "no-store").json({ paused: isGameplayPaused(guildId) });
}));

router.put("/guilds/:guildId/gameplay-state", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
  await initGameplayConfig(guildId);
  const wasPaused = isGameplayPaused(guildId);
  await setGameplayPaused(guildId, paused);

  if (paused) {
    stopGuildScheduler(guildId);
  } else {
    const client = getModerationClient();
    if (client) {
      await startGuildScheduler(client, guildId, { immediateActivities: wasPaused });
    }
  }

  res.set("Cache-Control", "no-store").json({ paused });
}));

const hauntedHouseChannelConfigSchema = z.object({
  startChannelId: z.string().regex(/^\d{5,25}$/).or(z.literal("")),
  leaderboardChannelId: z.string().regex(/^\d{5,25}$/).or(z.literal("")),
  chatChannelId: z.string().regex(/^\d{5,25}$/).or(z.literal("")),
}).strict();

async function getHauntedHouseTextChannel(guildId: string, channelId: string): Promise<TextChannel> {
  const client = getModerationClient();
  const guild = client?.guilds.cache.get(guildId);
  if (!guild) throw new ModerationAuthError(503, "Botul nu este conectat la serverul selectat.");
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    throw new ModerationAuthError(400, "Alege un canal text valid din serverul selectat.");
  }
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember || !channel.permissionsFor(botMember)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ])) {
    throw new ModerationAuthError(400, `Botul nu poate vedea sau trimite mesaje în #${channel.name}.`);
  }
  return channel;
}

router.get("/guilds/:guildId/haunted-house", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const [status, config] = await Promise.all([
    Promise.resolve(getHauntedHouseStatus(guildId)),
    loadHauntedHouseConfig(guildId),
  ]);
  res.set("Cache-Control", "no-store").json({ name: "Castelul Bântuit", ...status, ...config });
}));

router.put("/guilds/:guildId/haunted-house/config", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const config = hauntedHouseChannelConfigSchema.parse(req.body);
  if (config.startChannelId) await getHauntedHouseTextChannel(guildId, config.startChannelId);
  if (config.leaderboardChannelId) await getHauntedHouseTextChannel(guildId, config.leaderboardChannelId);
  if (config.chatChannelId) await getHauntedHouseTextChannel(guildId, config.chatChannelId);
  await saveHauntedHouseConfig(guildId, config);
  res.set("Cache-Control", "no-store").json({ ...getHauntedHouseStatus(guildId), ...config });
}));

router.post("/guilds/:guildId/haunted-house/start", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const config = await loadHauntedHouseConfig(guildId);
  if (!config.startChannelId || !config.leaderboardChannelId || !config.chatChannelId) {
    throw new ModerationAuthError(400, "Configurează canalele de start, clasament și chat pentru șoaptele AI înainte de pornire.");
  }
  const channel = await getHauntedHouseTextChannel(guildId, config.startChannelId);
  if (!startHauntedHouse(guildId)) throw new ModerationAuthError(409, "Castelul Bântuit este deja activ pe acest server.");
  try {
    await channel.send(buildHauntedHouseOpenAnnouncement(guildId));
  } catch (error) {
    stopHauntedHouse(guildId);
    throw new ModerationAuthError(502, "Castelul Bântuit nu a putut fi anunțat în canalul de start.");
  }
  res.set("Cache-Control", "no-store").json({ name: "Castelul Bântuit", ...getHauntedHouseStatus(guildId), ...config });
}));

router.post("/guilds/:guildId/haunted-house/stop", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const config = await loadHauntedHouseConfig(guildId);
  if (!config.leaderboardChannelId) throw new ModerationAuthError(400, "Configurează canalul clasamentului final înainte de oprire.");
  const client = getModerationClient();
  if (!client) throw new ModerationAuthError(503, "Botul nu este conectat.");
  const closing = beginHauntedHouseStop(guildId);
  if (!closing) throw new ModerationAuthError(409, "Evenimentul este deja închis sau se oprește deja.");
  try {
    await publishHauntedHouseLeaderboard(client, guildId, closing.sessionId, true);
  } catch {
    cancelHauntedHouseStop(guildId, closing.sessionId);
    throw new ModerationAuthError(502, "Clasamentul nu a putut fi publicat; evenimentul rămâne activ.");
  }
  if (!completeHauntedHouseStop(guildId, closing.sessionId)) {
    throw new ModerationAuthError(409, "Sesiunea evenimentului s-a schimbat înainte de închidere.");
  }
  res.set("Cache-Control", "no-store").json({ name: "Castelul Bântuit", ...getHauntedHouseStatus(guildId), ...config });
}));

// The persisted config parser fills defaults and intentionally tolerates older
// stored shapes. For a new write, however, silently stripping a misspelled
// section/field would acknowledge a change that was never saved.
function rejectUnknownConfigFields(input: unknown, parsed: unknown, path = "config"): void {
  if (Array.isArray(input) && Array.isArray(parsed)) {
    input.forEach((item, index) => rejectUnknownConfigFields(item, parsed[index], `${path}[${index}]`));
  } else if (input && typeof input === "object" && !Array.isArray(input) &&
             parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(input)) {
      if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
        throw new ModerationAuthError(400, `Unknown configuration field: ${path}.${key}`);
      }
      rejectUnknownConfigFields(value, (parsed as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }
}

router.put("/guilds/:guildId/config", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  let config = parse(ModerationConfigSchema, req.body);
  rejectUnknownConfigFields(req.body, config);
  const revision = expectedRevision(req);
  const previous = await moderationStore.getConfig(guildId);
  if (previous.version !== revision) throw new ModerationRevisionConflictError();
  await validateConfigTargets(guildId, config, previous.config);
  let activityLogProvisioning: { created: unknown[]; reused: unknown[] } | null = null;
  if (config.activityLog.enabled && JSON.stringify(config.activityLog) !== JSON.stringify(previous.config.activityLog)) {
    const client = getModerationClient();
    if (!client?.isReady()) {
      throw new ModerationAuthError(503, "Jurnalul Discord nu a fost activat: botul Discord este offline.");
    }
    const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      throw new ModerationAuthError(503, "Jurnalul Discord nu a fost activat: botul nu poate accesa serverul.");
    }
    const botPermissions = guild.members.me?.permissions;
    const missing = [
      !botPermissions?.has(PermissionFlagsBits.ManageChannels) ? "Manage Channels" : null,
      !botPermissions?.has(PermissionFlagsBits.ManageRoles) ? "Manage Roles" : null,
    ].filter((permission): permission is string => Boolean(permission));
    if (missing.length) {
      throw new ModerationAuthError(403, `Jurnalul Discord nu a fost activat. Botului îi lipsesc permisiunile: ${missing.join(", ")}.`);
    }
    try {
      const provisioned = await provisionActivityLogChannels(guild, {
        activityLog: { ...config.activityLog, roleIds: [] },
      });
      config = { ...config, activityLog: provisioned.activityLog };
      activityLogProvisioning = { created: provisioned.created, reused: provisioned.reused };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "eroare necunoscută";
      logger.warn({ error, guildId }, "Discord activity log provisioning failed");
      throw new ModerationAuthError(400, `Jurnalul Discord nu a fost activat. Verifică permisiunile botului și spațiul disponibil pe server. Detalii: ${reason}`);
    }
  }
  const result = await moderationStore.putConfig(guildId, config, session.userId, revision);
  const notification = await notifyNewlyEnabledModules(guildId, session.userId, previous.config, result.config);
  const nativeAutoMod = await syncNativeAutoModForResponse(guildId, result.config);
  res.set("Cache-Control", "no-store").set("ETag", `"${result.version}"`).json({
    ...result,
    notification,
    nativeAutoMod,
    ...(activityLogProvisioning ? { activityLogProvisioning } : {}),
  });
}));

router.get("/guilds/:guildId/bot-control", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  await initGameplayConfig(guildId);
  const loadDailyStats = optionalExport(() => loadDailyStatsEmbedConfig);
  const loadInviteTracking = optionalExport(() => loadInviteTrackingConfig);
  const [channels, allianceRecruitmentText, tickets, verification, dailyStats, inviteTracking, provisioningPermissions] = await Promise.all([
    loadChannelConfig(guildId),
    loadAllianceRecruitmentText(guildId),
    loadTicketConfig(guildId),
    optionalExport(() => loadVerificationConfig)?.(guildId) ?? Promise.resolve(null),
    loadDailyStats?.(guildId) ?? Promise.resolve(DEFAULT_DAILY_STATS_EMBED_CONFIG),
    loadInviteTracking?.(guildId) ?? Promise.resolve(DEFAULT_INVITE_TRACKING_CONFIG),
    loadProvisioningPermissions(guildId),
  ]);
  res.set("Cache-Control", "no-store").json({
    channels: channels ?? {},
    allianceRecruitmentText: allianceRecruitmentText ?? "",
    tickets: normalizeTicketConfig(tickets),
    gameplayConfig: getGameplayConfig(guildId),
    verification: normalizeVerificationConfig(verification),
    dailyStats,
    inviteTracking,
    provisioningPermissions: provisioningPermissionsSchema.parse(provisioningPermissions),
    discordLive: Boolean(getModerationClient()?.isReady()),
  });
}));

router.post("/guilds/:guildId/bot-control/leave", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  if (session.userId !== SUPER_ADMIN_ID) {
    throw new ModerationAuthError(403, "Doar proprietarul global al botului poate scoate botul de pe un server.");
  }

  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");

  let guild;
  try {
    guild = await client.guilds.fetch({ guild: guildId, force: true });
  } catch {
    throw new ModerationAuthError(404, "Botul nu mai este prezent pe serverul selectat.");
  }
  if (guild.id !== guildId) throw new ModerationAuthError(404, "Serverul returnat nu corespunde selecției.");

  const guildName = guild.name;
  try {
    await guild.leave();
  } catch (error) {
    logger.error({ error, guildId }, "Owner requested bot departure but Discord rejected it");
    throw new ModerationAuthError(502, "Discord nu a confirmat ieșirea botului de pe server.");
  }
  res.status(200).json({ left: true, guildId, guildName });
}));

router.get("/guilds/:guildId/activity-ranks", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const config = await getActivityRankConfig(guildId);
  res.set("Cache-Control", "no-store").json({ config });
}));

async function loadActivityRankChannelAccessTarget(guildId: string, channelId: string) {
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new ModerationAuthError(404, "Serverul selectat nu este disponibil.");
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (
    !channel ||
    ![0, 5].includes(channel.type) ||
    !("guildId" in channel) ||
    channel.guildId !== guildId ||
    !("permissionsFor" in channel) ||
    typeof channel.permissionsFor !== "function" ||
    !("permissionOverwrites" in channel)
  ) {
    throw new ModerationAuthError(404, "Canalul selectat nu este disponibil ca text în serverul ales.");
  }
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember) throw new ModerationAuthError(503, "Nu am putut verifica accesul botului în server.");
  return { channel, botMember };
}

function activityRankChannelAccessResponse(
  channel: Awaited<ReturnType<typeof loadActivityRankChannelAccessTarget>>["channel"],
  botMember: Awaited<ReturnType<typeof loadActivityRankChannelAccessTarget>>["botMember"],
) {
  const permissions = channel.permissionsFor(botMember);
  return {
    channelId: channel.id,
    channelName: channel.name,
    canManageChannels: botMember.permissions.has(PermissionFlagsBits.ManageChannels),
    viewChannel: permissions?.has(PermissionFlagsBits.ViewChannel) ?? false,
    sendMessages: permissions?.has(PermissionFlagsBits.SendMessages) ?? false,
  };
}

router.get("/guilds/:guildId/channels/:channelId/bot-access", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const channelId = parse(snowflake, req.params.channelId);
  await sessionAndGuild(req, guildId, "config");
  const { channel, botMember } = await loadActivityRankChannelAccessTarget(guildId, channelId);
  res.set("Cache-Control", "no-store").json(
    ModerationGetActivityRankChannelBotAccessResponse.parse(activityRankChannelAccessResponse(channel, botMember)),
  );
}));

router.put("/guilds/:guildId/channels/:channelId/bot-access", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const channelId = parse(snowflake, req.params.channelId);
  await sessionAndGuild(req, guildId, "config", true);
  const { viewChannel, sendMessages } = parse(ModerationSetActivityRankChannelBotAccessBody, req.body);
  const { channel, botMember } = await loadActivityRankChannelAccessTarget(guildId, channelId);
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new ModerationAuthError(403, "Botul are nevoie de permisiunea Manage Channels pentru a modifica accesul la canal.");
  }
  await channel.permissionOverwrites.edit(botMember.user.id, {
    ViewChannel: viewChannel,
    SendMessages: sendMessages,
  }, { reason: "Accesul botului configurat din setările rangurilor de activitate" });
  res.set("Cache-Control", "no-store").json(
    ModerationSetActivityRankChannelBotAccessResponse.parse(activityRankChannelAccessResponse(channel, botMember)),
  );
}));

router.put("/guilds/:guildId/activity-ranks", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const input = parse(z.object({
    enabled: z.boolean(),
    notificationChannelId: snowflake.or(z.literal("")),
    rankUpMessage: z.string().max(1_800),
    bannerImageUrl: z.string().max(2_000).refine(
      (value) => !value.trim() || isSupportedActivityBannerSource(value.trim()),
      "Încarcă bannerul sau folosește un URL de la Discord CDN, Imgur ori Unsplash.",
    ),
    barStyle: z.enum(["discord", "dungi", "gradient", "oblic", "pixel", "pro", "sword"]).optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    roleRewards: z.array(z.object({
      level: z.number().int().min(1).max(100),
      roleId: snowflake,
    }).strict()).max(100).refine(
      (rewards) => new Set(rewards.map((reward) => reward.level)).size === rewards.length &&
        new Set(rewards.map((reward) => reward.roleId)).size === rewards.length,
      "Nivelurile și rolurile trebuie să fie unice.",
    ).nullable().optional(),
    layout: z.object({
      bar: z.object({
        x: z.number().finite().min(0).max(100),
        y: z.number().finite().min(0).max(100),
        width: z.number().finite().min(30).max(100),
      }).strict(),
      member: z.object({
        x: z.number().finite().min(0).max(100),
        y: z.number().finite().min(0).max(100),
        width: z.number().finite().min(40).max(100),
      }).strict(),
    }).strict().nullable().optional(),
  }).strict().superRefine((settings, context) => {
    if (!settings.layout) return;
    const { bar, member } = settings.layout;
    const barHeight = bar.width * (800 * 64 / (560 * 534));
    const defaultMemberWidth = settings.bannerImageUrl.trim() ? 73 : 67.5;
    const memberHeight = 15.36 * (member.width / defaultMemberWidth);
    if (bar.x + bar.width > 100 || bar.y + barHeight > 100) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["layout", "bar"], message: "Bara XP trebuie să rămână în interiorul bannerului." });
    }
    if (member.x + member.width > 100 || member.y + memberHeight > 100) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["layout", "member"], message: "Cardul membrului trebuie să rămână în interiorul bannerului." });
    }
  }), req.body);
  // Older clients editing other settings must not reset saved rewards or layout.
  const previousConfig = input.roleRewards === undefined || input.layout === undefined
    ? await getActivityRankConfig(guildId)
    : null;
  const config = normalizeActivityRankConfig({
    ...input,
    roleRewards: input.roleRewards === undefined
      ? previousConfig!.roleRewards
      : input.roleRewards,
    layout: input.layout === undefined
      ? previousConfig!.layout
      : input.layout,
  });

  if (config.roleRewards?.length) {
    const client = getModerationClient();
    if (!client?.isReady()) throw new ModerationAuthError(503, "Botul trebuie să fie conectat pentru a verifica rolurile alese.");
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new ModerationAuthError(400, "Serverul selectat nu este disponibil.");
    const [roles, botMember] = await Promise.all([
      guild.roles.fetch(),
      guild.members.me ? Promise.resolve(guild.members.me) : guild.members.fetchMe(),
    ]);
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new ModerationAuthError(400, "Botul are nevoie de permisiunea Manage Roles.");
    }
    for (const reward of config.roleRewards) {
      const role = roles.get(reward.roleId);
      if (!role || role.id === guildId || !isSafeActivityRewardRole(role)) {
        throw new ModerationAuthError(400, `Rolul de la nivelul ${reward.level} trebuie să existe în acest server și să nu fie gestionat sau administrativ.`);
      }
      if (role.position >= botMember.roles.highest.position) {
        throw new ModerationAuthError(400, `Mută rolul botului deasupra rolului „${role.name}”, ales pentru nivelul ${reward.level}.`);
      }
    }
  }

  if (config.notificationChannelId) {
    const client = getModerationClient();
    if (client?.isReady()) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      const channel = guild
        ? await guild.channels.fetch(config.notificationChannelId).catch(() => null)
        : null;
      if (
        !channel ||
        !channel.isTextBased() ||
        !("guildId" in channel) ||
        channel.guildId !== guildId ||
        !("send" in channel)
      ) {
        throw new ModerationAuthError(400, "Alege un canal text valid din serverul selectat.");
      }
      const botMember = guild?.members.me ?? (guild ? await guild.members.fetchMe().catch(() => null) : null);
      if (botMember && "permissionsFor" in channel && typeof channel.permissionsFor === "function") {
        const permissions = channel.permissionsFor(botMember);
        if (
          !permissions?.has(PermissionFlagsBits.ViewChannel) ||
          !permissions.has(PermissionFlagsBits.SendMessages)
        ) {
          throw new ModerationAuthError(400, "Botul are nevoie de permisiunile View Channel și Send Messages în canalul de notificări.");
        }
      }
    }
  }

  const saved = await saveActivityRankConfig(guildId, config);
  res.set("Cache-Control", "no-store").json({ config: saved });
}));

router.get("/guilds/:guildId/server-setup", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  try {
    const uncertain = await withSetupJournal(guildId, async journal => listUncertainSetup(journal));
    res.set("Cache-Control", "no-store").json({
      draft: setupTemplate,
      aiAvailable: Boolean(process.env.OPENAI_API_KEY),
      uncertain,
    });
  } catch (error) {
    throw new ModerationAuthError(409, error instanceof Error ? error.message : "Starea configurării nu a putut fi încărcată.");
  }
}));

router.get("/guilds/:guildId/server-setup/draft", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config");
  const savedDraft = await getSavedSetupDraft(guildId, session.userId);
  res.set("Cache-Control", "no-store").json({ savedDraft });
}));

router.put("/guilds/:guildId/server-setup/draft", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  const input = setupDraftSaveSchema.parse(req.body);
  try {
    const savedDraft = await saveSetupDraft(guildId, session.userId, input);
    res.set("Cache-Control", "no-store").json({ savedDraft });
  } catch (error) {
    if (error instanceof SetupDraftRevisionConflictError) {
      throw new ModerationAuthError(409, error.message);
    }
    throw error;
  }
}));

router.post("/guilds/:guildId/server-setup/suggest", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  res.json({ draft: await suggestSetup(setupSuggestionSchema.parse(req.body)) });
}));

router.get("/guilds/:guildId/server-setup/resources", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  try {
    const resources = await inspectSetupResources(guild);
    res.set("Cache-Control", "no-store").json(resources);
  } catch (error) {
    throw new ModerationAuthError(409, error instanceof Error ? error.message : "Inventarul Discord nu a putut fi încărcat.");
  }
}));

router.get("/guilds/:guildId/server-setup/audit", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  try {
    res.set("Cache-Control", "no-store").json(await inspectServerSetupAudit(guild));
  } catch (error) {
    throw new ModerationAuthError(409, error instanceof Error ? error.message : "Auditul serverului nu a putut fi rulat.");
  }
}));

router.post("/guilds/:guildId/server-setup/audit/fix", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const input = parse(z.object({
    findingId: z.string().min(1).max(200),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
  }).strict(), req.body);
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  try {
    res.set("Cache-Control", "no-store").json(await fixServerSetupAuditFinding(guild, input));
  } catch (error) {
    throw new ModerationAuthError(409, error instanceof Error ? error.message : "Remedierea nu a putut fi aplicată.");
  }
}));

for (const action of ["preview", "apply", "delete"] as const) {
  router.post(`/guilds/:guildId/server-setup/${action}`, asyncRoute(async (req, res) => {
    const guildId = parse(snowflake, req.params.guildId);
    await sessionAndGuild(req, guildId, "config", true);
    const body = (action === "apply" || action === "delete"
      ? z.object({ draft: setupDraftSchema, confirmed: z.literal(true), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
      : z.object({ draft: setupDraftSchema }).strict()).parse(req.body);
    const client = getModerationClient();
    if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
    const guild = await client.guilds.fetch({ guild: guildId, force: true });
    try {
      const result = await withSetupJournal(guildId, async (journal, save) => {
        if (action === "preview") return await inspectSetup(guild, body.draft, journal);
        const fingerprint = z.string().parse("fingerprint" in body ? body.fingerprint : undefined);
        if (action === "delete") return await deleteSelectedSetupResources(guild, body.draft, fingerprint, journal, save);
        return await applySetup(guild, body.draft, fingerprint, journal, save);
      });
      res.json(result);
    } catch (error) {
      throw new ModerationAuthError(409, error instanceof Error ? error.message : "Configurarea nu a putut fi verificată.");
    }
  }));
}

const setupResourceKey = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
router.get("/guilds/:guildId/server-setup/reconciliation/:key/inventory", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const key = setupResourceKey.parse(req.params.key);
  await sessionAndGuild(req, guildId, "config");
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  try {
    const inventory = await withSetupJournal(guildId, async journal => inspectUncertainSetup(guild, key, journal));
    res.set("Cache-Control", "no-store").json(inventory);
  } catch (error) {
    throw new ModerationAuthError(409, error instanceof Error ? error.message : "Inventarul Discord nu a putut fi verificat.");
  }
}));

router.post("/guilds/:guildId/server-setup/reconciliation/:key", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const key = setupResourceKey.parse(req.params.key);
  const session = await sessionAndGuild(req, guildId, "config", true);
  const body = z.discriminatedUnion("action", [
    z.object({
      action: z.literal("bind"),
      inventoryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      resourceId: snowflake,
    }).strict(),
    z.object({
      action: z.literal("confirm-absent"),
      inventoryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      confirmed: z.literal(true),
    }).strict(),
  ]).parse(req.body);
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  try {
    const result = await withSetupJournal(guildId, async (journal, save) => {
      const previous = structuredClone(journal);
      const reconciliation = await reconcileUncertainSetup(guild, { ...body, key } as
        | { key: string; action: "bind"; inventoryFingerprint: string; resourceId: string }
        | { key: string; action: "confirm-absent"; inventoryFingerprint: string }, journal, save);
      const auditDetail = reconciliation.action === "bound"
        ? {
          action: body.action,
          name: reconciliation.resource.name,
          kind: reconciliation.resource.kind,
          resourceId: reconciliation.resource.id,
        }
        : {
          action: body.action,
          name: reconciliation.pending.name,
          kind: reconciliation.pending.kind,
        };
      try {
        await moderationStore.writeAudit({
          guildId,
          actorId: session.userId,
          eventType: reconciliation.action === "bound" ? "server_setup.reconciliation_bound" : "server_setup.reconciliation_absent",
          targetType: "setup_resource",
          targetId: key,
          detail: auditDetail,
        });
      } catch (error) {
        await save(previous);
        throw error;
      }
      return reconciliation;
    });
    res.set("Cache-Control", "no-store").json(result);
  } catch (error) {
    throw new ModerationAuthError(409, error instanceof Error ? error.message : "Reconcilierea nu a putut fi finalizată.");
  }
}));

router.post("/guilds/:guildId/bot-control/provision-channels", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const { categories, permissions } = provisionChannelsSchema.parse(req.body ?? {});
  const session = await sessionAndGuild(req, guildId, "config", true);
  const client = getModerationClient();
  if (!client || !client.isReady()) {
    throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  }

  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  if (!guild.members.me?.permissions.has("ManageChannels")) {
    throw new ModerationAuthError(403, "Botul are nevoie de permisiunea Manage Channels pentru provisioning.");
  }

  await initGameplayConfig(guildId);
  const loadDailyStats = optionalExport(() => loadDailyStatsEmbedConfig);
  const loadInviteTracking = optionalExport(() => loadInviteTrackingConfig);
  const [channelConfig, ticketConfig, moderationSnapshot, verification, allianceRecruitmentText, dailyStats, inviteTracking] = await Promise.all([
    loadChannelConfig(guildId),
    loadTicketConfig(guildId),
    moderationStore.getConfig(guildId),
    loadVerificationConfig(guildId),
    loadAllianceRecruitmentText(guildId),
    loadDailyStats?.(guildId) ?? Promise.resolve(DEFAULT_DAILY_STATS_EMBED_CONFIG),
    loadInviteTracking?.(guildId) ?? Promise.resolve(DEFAULT_INVITE_TRACKING_CONFIG),
  ]);
  const previousPermissions = await loadProvisioningPermissions(guildId);
  const provisioned = await provisionGuildChannels(guild, {
    channelConfig: channelConfig ?? {},
    ticketConfig: normalizeTicketConfig(ticketConfig),
    moderationConfig: moderationSnapshot.config,
    verification: normalizeVerificationConfig(verification),
    dailyStats: { channelId: dailyStats.channelId },
    categories,
    permissions: permissions as Parameters<typeof provisionGuildChannels>[1]["permissions"],
    previousPermissions,
  });
  let savedDailyStats = dailyStats;
  if (provisioned.dailyStatsChannelId && provisioned.dailyStatsChannelId !== dailyStats.channelId) {
    const saveDailyStats = optionalExport(() => saveDailyStatsEmbedConfig);
    if (!saveDailyStats) {
      throw new ModerationAuthError(503, "Setările raportului zilnic nu pot fi salvate momentan.");
    }
    savedDailyStats = { ...dailyStats, channelId: provisioned.dailyStatsChannelId };
    await saveDailyStats(guildId, savedDailyStats);
  }
  const savedPermissions = {
    ...previousPermissions,
    ...(permissions ?? {}),
  };
  if (permissions) await saveProvisioningPermissions(guildId, savedPermissions);

  await saveChannelConfig(guildId, provisioned.channelConfig);
  await saveTicketConfig(guildId, provisioned.ticketConfig);
  await saveVerificationConfig(guildId, provisioned.verification);
  if (JSON.stringify(provisioned.moderationConfig) !== JSON.stringify(moderationSnapshot.config)) {
    await moderationStore.putConfig(guildId, provisioned.moderationConfig, session.userId, moderationSnapshot.version);
  }
  await initChannelConfig(guildId);
  setTicketConfig(guildId, provisioned.ticketConfig);

  let savedVerification = provisioned.verification;
  let verificationPanel: "not_requested" | "disabled" | "needs_role" | "published" | "failed" | "published_not_saved" = "not_requested";
  if (!categories || categories.includes("verification")) {
    if (!savedVerification.enabled) verificationPanel = "disabled";
    else if (!savedVerification.roleId) verificationPanel = "needs_role";
    else {
      try {
        savedVerification = await publishVerificationPanel(client, guildId, savedVerification);
        verificationPanel = "published";
      } catch (error) {
        if (error instanceof VerificationPanelPersistenceError) {
          savedVerification = error.publishedConfig;
          verificationPanel = "published_not_saved";
        } else {
          logger.warn({ error, guildId }, "Verification panel could not be published after channel provisioning");
          verificationPanel = "failed";
        }
      }
    }
  }

  res.status(verificationPanel === "failed" || verificationPanel === "published_not_saved" ? 207 : 200).json({
    channels: provisioned.channelConfig,
    allianceRecruitmentText: allianceRecruitmentText ?? "",
    tickets: provisioned.ticketConfig,
    gameplayConfig: getGameplayConfig(guildId),
    verification: savedVerification,
    provisioningPermissions: savedPermissions,
    dailyStats: savedDailyStats,
    inviteTracking,
    discordLive: true,
    provisioning: {
      created: provisioned.created,
      reused: provisioned.reused,
      verificationPanel,
    },
  });
}));

router.post("/guilds/:guildId/bot-control/verification-panel", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const verification = normalizeVerificationConfig(parse(verificationConfigSchema, req.body));
  if (!verification.enabled) {
    throw new ModerationAuthError(400, "Activează verificarea înainte de a publica panoul.");
  }
  if (!verification.channelId || !verification.roleId) {
    throw new ModerationAuthError(400, "Configurează canalul și rolul pentru verificare.");
  }
  const client = getModerationClient();
  if (!client?.isReady()) {
    throw new ModerationAuthError(503, "Discord botul nu este conectat pentru publicarea panoului.");
  }

  try {
    const savedVerification = await publishVerificationPanel(client, guildId, verification);
    res.status(200).json({ verification: savedVerification });
  } catch (error) {
    if (error instanceof VerificationPanelPersistenceError) {
      res.status(207).json({
        partialApply: true,
        verificationPanelPublished: true,
        verification: error.publishedConfig,
        message: "Panoul Discord a fost publicat, dar setările de verificare nu au putut fi salvate.",
      });
      return;
    }
    throw error;
  }
}));

router.put("/guilds/:guildId/bot-control", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const value = parse(botControlSchema, req.body);
  const inviteTracking = value.inviteTracking ?? DEFAULT_INVITE_TRACKING_CONFIG;
  const dailyStats = value.dailyStats ?? DEFAULT_DAILY_STATS_EMBED_CONFIG;
  const loadDailyStats = optionalExport(() => loadDailyStatsEmbedConfig);
  const currentDailyStats = await loadDailyStats?.(guildId) ?? DEFAULT_DAILY_STATS_EMBED_CONFIG;
  const client = getModerationClient();
  const inviteGuild = await validateInviteTrackingTargets(guildId, inviteTracking);
  // An invalid legacy destination must not block unrelated full-form saves.
  // Continue validating whenever the user selects, changes, or clears it.
  if (dailyStats.channelId !== currentDailyStats.channelId) {
    await validateDailyStatsChannelTarget(guildId, dailyStats.channelId);
  }
  const tickets = normalizeTicketConfig(value.tickets);
  const channels: ChannelConfig = Object.fromEntries(
    Object.entries(value.channels).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  ) as ChannelConfig;
  await validateBotControlChannelTargets(guildId, channels);
  await validateMemberMessagesChannelTarget(guildId, value.gameplayConfig);
  const verification = normalizeVerificationConfig(value.verification);
  const verificationRequested = Object.prototype.hasOwnProperty.call(req.body ?? {}, "verification");
  let savedVerification = verification;
  let verificationPanelPublished = false;
  let anyWriteSucceeded = false;
  if (verification.enabled && verificationRequested) {
    if (!client?.isReady()) throw new ModerationAuthError(503, "Discord botul nu este conectat pentru publicarea panoului.");
    // Publish before mutating the rest of the settings. A Discord failure must
    // not leave the caller with a failed response after unrelated settings save.
    try {
      savedVerification = await publishVerificationPanel(client, guildId, verification);
      verificationPanelPublished = true;
      anyWriteSucceeded = true;
    } catch (error) {
      if (error instanceof VerificationPanelPersistenceError) {
        res.status(207).json({
          partialApply: true,
          verificationPanelPublished: true,
          verification: error.publishedConfig,
          message: "Panoul Discord a fost publicat, dar setările de verificare nu au putut fi salvate.",
        });
        return;
      }
      throw error;
    }
  }

  let gameplayConfig = value.gameplayConfig;
  try {
  await saveChannelConfig(guildId, channels);
  anyWriteSucceeded = true;
  await saveProvisioningPermissions(guildId, value.provisioningPermissions);
  anyWriteSucceeded = true;
  await saveAllianceRecruitmentText(guildId, value.allianceRecruitmentText);
  anyWriteSucceeded = true;
  const saveDailyStats = optionalExport(() => saveDailyStatsEmbedConfig);
  if (saveDailyStats) {
    await saveDailyStats(guildId, dailyStats);
    anyWriteSucceeded = true;
  }
  const saveInviteTracking = optionalExport(() => saveInviteTrackingConfig);
  if (saveInviteTracking) {
    await saveInviteTracking(guildId, inviteTracking);
    anyWriteSucceeded = true;
  }
  await saveTicketConfig(guildId, tickets);
  anyWriteSucceeded = true;
  await initGameplayConfig(guildId);
  const previousGameplayConfig = getGameplayConfig(guildId);
  // Pause/resume is controlled by the Dashboard endpoint. The bot-control
  // page edits timers and gameplay values, but must not silently re-pause a
  // guild when it submits a stale draft.
  gameplayConfig = await saveGuildGameplayConfig(guildId, {
    ...value.gameplayConfig,
    paused: previousGameplayConfig.paused,
  });
  anyWriteSucceeded = true;
  const saveVerification = optionalExport(() => saveVerificationConfig);
  if (saveVerification && verificationRequested && !verification.enabled) {
    await saveVerification(guildId, verification);
    anyWriteSucceeded = true;
  }
  await initChannelConfig(guildId);
  setTicketConfig(guildId, tickets);
  if (client?.isReady() && inviteGuild) {
    await applyInviteTrackingConfig(client, inviteGuild, inviteTracking);
  }
  const scheduleChanged =
    previousGameplayConfig.paused !== gameplayConfig.paused ||
    JSON.stringify(previousGameplayConfig.events) !== JSON.stringify(gameplayConfig.events);
  if (scheduleChanged) {
    stopGuildScheduler(guildId);
    if (client?.isReady() && !gameplayConfig.paused) {
      startGuildScheduler(client, guildId);
    }
  }
  } catch (error) {
    if (!anyWriteSucceeded) throw error;
    res.status(207).json({
      partialApply: true,
      verificationPanelPublished,
      ...(verificationPanelPublished ? { verification: savedVerification } : {}),
      message: "Cererea a fost aplicată doar parțial. Unele setări sau efecte din Discord nu au putut fi finalizate; verifică starea după reîncărcare.",
    });
    return;
  }

  res.status(200).json({
    channels,
    allianceRecruitmentText: value.allianceRecruitmentText,
    tickets,
    gameplayConfig,
    verification: savedVerification,
    dailyStats,
    inviteTracking,
    provisioningPermissions: value.provisioningPermissions,
    discordLive: Boolean(client?.isReady()),
  });
}));

router.get("/guilds/:guildId/invite-stats", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const range = parse(z.enum(["7", "30", "90", "all"]), typeof req.query.range === "string" ? req.query.range : "7");
  const stats = await getInviteStats(guildId, range);
  res.set("Cache-Control", "no-store").json(stats);
}));

router.post("/guilds/:guildId/invite-stats/sync", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = client.guilds.cache?.get(guildId) ?? await client.guilds.fetch({ guild: guildId, force: true })
    .catch(() => { throw new ModerationAuthError(503, "Serverul Discord nu este disponibil."); });
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new ModerationAuthError(403, "Botul are nevoie de permisiunea Manage Server pentru a citi invitațiile.");
  }
  let sync: { activeInvites: number; syncedAt: string };
  try {
    sync = await syncGuildInviteSnapshot(guild);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? Number(error.code) : null;
    if (code === 50013 || code === 50001) {
      throw new ModerationAuthError(403, "Botul nu are permisiunea Manage Server pentru a citi invitațiile.");
    }
    throw error;
  }
  res.set("Cache-Control", "no-store").json({ ...sync, stats: await getInviteStats(guildId, "7") });
}));

router.get("/guilds/:guildId/verification/invite", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const client = getModerationClient();
  const inviteUrl = getDiscordBotInviteUrl(guildId);
  res.json({
    inviteUrl,
    installed: client ? Boolean(await client.guilds.fetch({ guild: guildId, force: true }).catch(() => null)) : false,
  });
}));

router.get("/public/server-profile", asyncRoute(async (_req, res) => {
  const client = getModerationClient();
  const inviteUrl = PUBLIC_DISCORD_INVITE;
  const inviteCode = inviteUrl.split("/").filter(Boolean).pop()?.split("?")[0] ?? "";
  let name = "Regatul Cenușii";
  let iconUrl: string | null = null;

  if (client && inviteCode) {
    const invite = await client.fetchInvite(inviteCode).catch(() => null);
    if (invite?.guild) {
      name = invite.guild.name;
      iconUrl = invite.guild.iconURL({ size: 128 });
    }
  }

  res.set("Cache-Control", "public, max-age=300").json({ name, iconUrl, inviteUrl });
}));

router.get("/verification/:guildId/config", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const config = normalizeVerificationConfig(await loadVerificationConfig(guildId));
  const client = getModerationClient();
  let guildName: string | null = null;
  if (client) {
    guildName = (await client.guilds.fetch({ guild: guildId, force: true }).catch(() => null))?.name ?? null;
  }
  res.set("Cache-Control", "no-store").json({
    guildId,
    guildName,
    enabled: config.enabled,
    title: config.title,
    message: config.message,
    buttonLabel: config.buttonLabel,
    buttonEmoji: config.buttonEmoji,
    successMessage: config.successMessage,
    alreadyVerifiedMessage: config.alreadyVerifiedMessage,
    websiteUrl: getVerificationWebsiteUrl(guildId),
  });
}));

router.get("/guilds/:guildId/verification/members", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  const client = getModerationClient();
  if (!client || !client.isReady()) {
    throw new ModerationAuthError(503, "Discord botul nu este disponibil pentru încărcarea membrilor verificați.");
  }

  const config = normalizeVerificationConfig(await loadVerificationConfig(guildId));
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  let role = null;
  if (config.roleId) {
    try {
      role = await guild.roles.fetch(config.roleId);
    } catch (error) {
      logger.warn({ error, guildId, roleId: config.roleId }, "Verification role could not be fetched");
      throw new ModerationAuthError(400, "Rolul de verificare configurat nu mai există pe acest server. Alege un rol valid și salvează din nou.");
    }
  }
  if (!role) {
    res.set("Cache-Control", "no-store").json({
      guildId,
      roleId: config.roleId,
      roleName: null,
      total: 0,
      members: [],
    });
    return;
  }

  type DiscordRestGuildMember = {
    nick?: string | null;
    roles?: unknown;
    joined_at?: string | null;
    user?: {
      id?: string;
      username?: string;
      global_name?: string | null;
      avatar?: string | null;
      bot?: boolean;
    };
  };

  const members: DiscordRestGuildMember[] = [];
  try {
    let after: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const query = new URLSearchParams({ limit: "1000" });
      if (after) query.set("after", after);
      const pageMembers = await client.rest.get(
        Routes.guildMembers(guildId),
        { query },
      ) as DiscordRestGuildMember[];
      if (!Array.isArray(pageMembers)) throw new Error("Discord returned an invalid member page");
      members.push(...pageMembers);
      if (pageMembers.length < 1000) break;
      const nextAfter = pageMembers.at(-1)?.user?.id;
      if (!nextAfter || nextAfter === after) break;
      after = nextAfter;
    }
  } catch (error) {
    logger.warn({ error, guildId }, "Verified members could not be fetched from Discord");
    throw new ModerationAuthError(503, "Discord nu a permis încărcarea membrilor verificați. Verifică permisiunile botului și încearcă din nou.");
  }
  const verifiedMembers = [...members.values()]
    .filter((member) => member.user?.id && !member.user.bot && Array.isArray(member.roles) && member.roles.includes(role.id))
    .map((member) => ({
      id: member.user!.id!,
      username: member.user!.username ?? member.user!.id!,
      displayName: member.nick?.trim() || member.user!.global_name?.trim() || member.user!.username || member.user!.id!,
      avatarUrl: member.user!.avatar
        ? `https://cdn.discordapp.com/avatars/${member.user!.id}/${member.user!.avatar}.${member.user!.avatar.startsWith("a_") ? "gif" : "png"}?size=64`
        : "https://cdn.discordapp.com/embed/avatars/0.png",
      joinedAt: member.joined_at ?? null,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ro", { sensitivity: "base" }));

  res.set("Cache-Control", "no-store").json({
    guildId,
    roleId: role.id,
    roleName: role.name,
    total: verifiedMembers.length,
    members: verifiedMembers,
  });
}));

router.get("/verification/status", asyncRoute(async (req, res) => {
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${verificationCookieName()}=`));
  const rawToken = cookie?.slice(verificationCookieName().length + 1);
  const identity = parseVerificationIdentityToken(rawToken);
  const requestedGuildId = typeof req.query.guildId === "string" ? parse(snowflake, req.query.guildId) : null;
  if (!identity || (requestedGuildId && requestedGuildId !== identity.guildId)) {
    res.json({ verified: false });
    return;
  }
  const client = getModerationClient();
  if (!client) {
    res.json({ verified: false, reason: "bot_offline" });
    return;
  }
  const snapshot = await fetchBotGuildSnapshot(identity.guildId, identity.userId);
  const config = normalizeVerificationConfig(await loadVerificationConfig(identity.guildId));
  res.json({
    verified: Boolean(snapshot && config.enabled && config.roleId && snapshot.member.roleIds.includes(config.roleId)),
    guildId: identity.guildId,
    userId: identity.userId,
  });
}));

router.get("/guilds/:guildId/metadata", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "operations");
  const client = getModerationClient();
  if (!client) throw new ModerationAuthError(503, "Discord moderation client is not available");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const [roles, channels, emojis] = await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.emojis.fetch()]);
  res.json({
    guild: { id: guild.id, name: guild.name, ownerId: guild.ownerId },
    roles: [...roles.values()].filter(Boolean).map((role) => ({
      id: role.id, name: role.name, position: role.position, managed: role.managed,
      activityRewardAssignable: role.id !== guild.id && isSafeActivityRewardRole(role) &&
        Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) &&
        role.position < (guild.members.me?.roles.highest.position ?? 0),
    })),
    channels: [...channels.values()]
      .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
      .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId })),
    emojis: [...emojis.values()].map(emojiPayload),
    botCapabilities: {
      online: client.isReady(),
      messageContent: client.options.intents.has(GatewayIntentBits.MessageContent),
      guildMembers: client.options.intents.has(GatewayIntentBits.GuildMembers),
      canManageGuild: guild.members.me?.permissions.has("ManageGuild") ?? false,
      canModerateMembers: guild.members.me?.permissions.has("ModerateMembers") ?? false,
      canManageMessages: guild.members.me?.permissions.has("ManageMessages") ?? false,
      canManageChannels: guild.members.me?.permissions.has("ManageChannels") ?? false,
      canManageRoles: guild.members.me?.permissions.has("ManageRoles") ?? false,
      canKickMembers: guild.members.me?.permissions.has("KickMembers") ?? false,
      canBanMembers: guild.members.me?.permissions.has("BanMembers") ?? false,
    },
  });
}));

router.post("/guilds/:guildId/emojis", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const { name, image } = createEmojiSchema.parse(req.body);
  const { data } = decodeEmojiImage(image);
  const client = getModerationClient();
  if (!client?.isReady()) throw new ModerationAuthError(503, "Botul Discord nu este conectat.");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    throw new ModerationAuthError(403, "Botul are nevoie de permisiunea Create Guild Expressions.");
  }
  try {
    const emoji = await guild.emojis.create({ attachment: data, name, reason: "Creat din panoul de administrare" });
    res.status(201).json(emojiPayload(emoji));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number((error as { code: unknown }).code) : 0;
    if (code === 30008) throw new ModerationAuthError(409, "Serverul a atins numărul maxim de emoji personalizate.");
    logger.warn({ guildId, code, errorType: error instanceof Error ? error.name : typeof error }, "Guild emoji creation failed");
    throw new ModerationAuthError(502, "Discord nu a putut crea emoji-ul. Verifică limita și permisiunile botului.");
  }
}));

router.get("/guilds/:guildId/cases", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "operations");
  await enforceCaseRetention(guildId);
  const page = parse(paginationSchema, req.query);
  const filter = parse(z.object({ status: z.enum(["open", "closed"]).optional(), userId: snowflake.optional() }), req.query);
  res.json({ items: await moderationStore.listCases(guildId, { ...page, ...filter }) });
}));

router.get("/guilds/:guildId/cases/export", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "operations");
  if (!(await enforceCaseRetention(guildId)).cases.allowStaffExport) {
    await sessionAndGuild(req, guildId, "audit");
  }
  const exportLimit = 1_000;
  const items = await moderationStore.listCases(guildId, { limit: exportLimit, offset: 0 });
  res.type("text/csv").attachment(`moderation-cases-${guildId}.csv`);
  res.set("X-Export-Record-Limit", String(exportLimit));
  const quoted = (value: unknown) => {
    const text = String(value ?? "").replaceAll("\"", "\"\"");
    const formulaPrefix = text.startsWith("=") || text.startsWith("+") || text.startsWith("-") || text.startsWith("@");
    return `"${formulaPrefix ? `'$
{

text
}

` : text}"`
;


}

;


  res.send(["id,subjectId,actorId,actionType,reason,status,createdAt",
    ...items.map((item) => [item.id, item.subjectId, item.actorId, item.actionType, item.reason, item.status, item.createdAt.toISOString()].map(quoted).join(",")),
  ].join("\n"))
;


}

))
;


router.get("/guilds/:guildId/cases/:caseId", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  const caseId = parse(uuid, req.params.caseId)
;


  await sessionAndGuild(req, guildId, "operations")
;


  await enforceCaseRetention(guildId)
;


  const item = await moderationStore.getCase(guildId, caseId)
;


  if (!item) 
{

 res.status(404).json(
{

 error: "Case not found" 
}

)
;

 return
;

 
}


  res.json(
{

 ...item, notes: await moderationStore.listCaseNotes(guildId, caseId) 
}

)
;


}

))
;


router.patch("/guilds/:guildId/cases/:caseId", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  const caseId = parse(uuid, req.params.caseId)
;


  const session = await sessionAndGuild(req, guildId, "operations", true)
;


  const body = parse(z.object(
{

 status: z.enum(["open", "closed"]).optional(), reason: z.string().trim().min(1).max(500).optional(), evidence: EvidenceSchema.optional() 
}

).refine((v) => v.status || v.reason || v.evidence, "Provide an update"), req.body)
;


  if (body.evidence) await validateEvidenceTargets(guildId, body.evidence)
;


  const currentConfig = await enforceCaseRetention(guildId)
;


  if (body.status === "closed" && !currentConfig.cases.allowStaffClose) 
{


    await sessionAndGuild(req, guildId, "audit")
;


}


  const item = await moderationStore.updateCase(
{

 guildId, caseId, actorId: session.userId, ...body 
}

)
;


  if (!item) 
{

 res.status(404).json(
{

 error: "Case not found" 
}

)
;

 return
;

 
}


  res.json(item)
;


}

))
;


router.post("/guilds/:guildId/cases/:caseId/notes", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  const caseId = parse(uuid, req.params.caseId)
;


  const session = await sessionAndGuild(req, guildId, "operations", true)
;


  const 
{

 body 
}

 = parse(z.object(
{

 body: z.string().trim().min(1).max(4_000) 
}

), req.body)
;


  if (!(await enforceCaseRetention(guildId)).cases.allowStaffNotes) 
{


    await sessionAndGuild(req, guildId, "audit")
;


}


  const note = await moderationStore.addCaseNote(
{

 guildId, caseId, authorId: session.userId, body 
}

)
;


  if (!note) 
{

 res.status(404).json(
{

 error: "Case not found" 
}

)
;

 return
;

 
}


  res.status(201).json(note)
;


}

))
;


router.get("/guilds/:guildId/logs/audit", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  await sessionAndGuild(req, guildId, "audit")
;


  const query = parse(auditQuerySchema, req.query);
  const result = await moderationStore.listAudit(guildId, {
    search: query.search,
    category: query.category,
    start: query.start ? new Date(query.start) : undefined,
    end: query.end ? new Date(query.end) : undefined,
    limit: query.limit,
    offset: query.offset,
  });

  res.json({
    items: result.items,
    total: result.total,
    limit: query.limit,
    offset: query.offset,
  });


}

))
;


router.get("/guilds/:guildId/logs", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  await sessionAndGuild(req, guildId, "operations")
;


  const 
{

 limit, offset 
}

 = parse(paginationSchema, req.query)
;


  res.json(
{

 items: await moderationStore.listModerationLogs(guildId, limit, offset) 
}

)
;


}

))
;


router.post("/guilds/:guildId/actions", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  const session = await sessionAndGuild(req, guildId, "operations", true)
;


  const input = parse(actionSchema, req.body)
;


  const idempotencyKey = parse(idempotencyKeySchema, req.header("idempotency-key"))
;


  const existing = await moderationStore.getAction(guildId, idempotencyKey)
;


  if (existing) 
{


    if (existing.status === "applied") 
{


      res.status(200).json(existing.result ?? 
{

 actionId: existing.id, summary: "Action already applied" 
}

)
;


      return
;


}


    res.status(409).json(
{

 error: existing.status === "pending" || existing.status === "uncertain" ? "Action requires operator reconciliation" : "Action previously failed", actionId: existing.id, status: existing.status 
}

)
;


    return
;


}


  // The engine alone reserves the ledger so Discord commands, AutoMod, and
  // HTTP use exactly one idempotency reservation path.
  try 
{


    const 
{

 executeModerationAction 
}

 = await import("../bot/moderation/engine")
;


    const actionInput = { guildId, actorId: session.userId, ...input, idempotencyKey } as never;

    const result = await executeModerationAction(actionInput)
;


    res.status(201).json(result)
;


}

 catch (error) 
{


    const code = error && typeof error === "object" && "code" in error ? (error as 
{

 code?: unknown 
}

).code : undefined
;


    if (code === "MODERATION_ACTION_PENDING" || code === "MODERATION_ACTION_UNCERTAIN" || code === "MODERATION_ACTION_FAILED") 
{


      res.status(409).json(
{

 error: "Action requires operator reconciliation", code 
}

)
;


      return
;


}


    if (error instanceof Error) 
{

      logger.warn(
{
 error, guildId, actorId: session.userId, actionId: idempotencyKey 
}
, "Manual moderation action was rejected")
;

      res.status(400).json(
{
 error: error.message || "Acțiunea de moderare a fost respinsă." 
}
)
;

      return
;

    
}


    throw error
;


}


}

))
;


router.get("/guilds/:guildId/actions", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  await sessionAndGuild(req, guildId, "audit")
;


  const 
{

 limit, offset 
}

 = parse(paginationSchema, req.query)
;


  const 
{

 status 
}

 = parse(z.object(
{

 status: z.enum(["pending", "uncertain", "applied", "failed"]).optional() 
}

), req.query)
;


  res.json(
{

 items: await moderationStore.listActions(guildId, status, limit, offset) 
}

)
;


}

))
;


router.patch("/guilds/:guildId/actions/:actionId/reconcile", asyncRoute(async (req, res) => 
{


  const guildId = parse(snowflake, req.params.guildId)
;


  const actionId = parse(uuid, req.params.actionId)
;


  const session = await sessionAndGuild(req, guildId, "audit", true)
;


  const body = parse(z.object(
{


    status: z.enum(["applied", "failed", "uncertain"]), note: z.string().trim().min(1).max(500),
    confirmedOffense: z.object(
{

 userId: snowflake, resetAfterDays: z.number().int().min(1).max(3650) 
}

).optional(),
  
}

), req.body)
;


  const item = await moderationStore.reconcileAction(
{

 guildId, actionId, actorId: session.userId, ...body 
}

)
;


  if (!item) 
{

 res.status(404).json(
{

 error: "Pending or uncertain action not found" 
}

)
;

 return
;

 
}


  res.json(item)
;


}

))
;


const moderationErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => 
{


  if (error instanceof ModerationAuthError) 
{


    res.status(error.status).json(
{

 error: error.message 
}

)
;


    return
;


}


  if (error instanceof ZodError) 
{


    res.status(400).json(
{

 error: "Invalid moderation request", issues: error.issues.map((issue) => (
{

 path: issue.path.join("."), message: issue.message 
}

)) 
}

)
;


    return
;


}


  if (error instanceof ModerationRevisionConflictError) 
{


    res.status(409).json(
{

 error: error.message 
}

)
;


    return
;


}


  res.status(500).json(
{

 error: "Moderation request failed" 
}

)
;


}

;


router.use(moderationErrorHandler)
;


export default router
;
