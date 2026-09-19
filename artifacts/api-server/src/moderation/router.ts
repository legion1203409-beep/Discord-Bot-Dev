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
 GatewayIntentBits 
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
 EvidenceSchema, ModerationConfigSchema, type ModerationConfig 
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
 saveAllianceRecruitmentText, saveChannelConfig, loadAllianceRecruitmentText, loadChannelConfig, saveTicketConfig, loadTicketConfig, type ChannelConfig 
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

import { startGuildScheduler, stopGuildScheduler } from "../bot/scheduler";

import {
  DEFAULT_VERIFICATION_CONFIG,
  normalizeVerificationConfig,
  publishVerificationPanel,
  verifyMember,
  createVerificationIdentityToken,
  parseVerificationIdentityToken,
  verificationCookieName,
} from "../bot/verification";

import { loadVerificationConfig, saveVerificationConfig } from "../bot/db";

const PUBLIC_DISCORD_INVITE =
  process.env.PUBLIC_DISCORD_INVITE?.trim() || "https://discord.gg/regatulcenusii";


const router = Router()
;

const snowflake = z.string().regex(/^\d{5,25}$/)
;

const uuid = z.string().uuid()
;

const botChannelConfigSchema = z.object(
{

  main: snowflake.nullable().optional(),
  event: snowflake.nullable().optional(),
  boss: snowflake.nullable().optional(),
  trader: snowflake.nullable().optional(),
  eventTop: snowflake.nullable().optional(),
  bossTop: snowflake.nullable().optional(),
  council: snowflake.nullable().optional(),
  fratia: snowflake.nullable().optional(),
}
).strict()
;

const verificationConfigSchema = z.object({
  enabled: z.boolean(),
  channelId: z.union([snowflake, z.literal("")]),
  roleId: z.union([snowflake, z.literal("")]),
  title: z.string().trim().min(1).max(256),
  message: z.string().trim().min(1).max(4_000),
  buttonLabel: z.string().trim().min(1).max(80),
  buttonEmoji: z.string().trim().max(100),
  successMessage: z.string().trim().min(1).max(2_000),
  alreadyVerifiedMessage: z.string().trim().min(1).max(2_000),
  panelMessageId: z.union([snowflake, z.literal("")]),
}).strict();

export const ticketQuestionConfigSchema = z.object(
{

  key: z.string().trim().min(1).max(32).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(45),
  description: z.string().trim().min(1).max(900),
  placeholder: z.string().trim().min(1).max(100),
  multiline: z.boolean(),
  required: z.boolean(),
  imageUrl: z.string().trim().max(2_000).optional().default(""),
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
  panelImageUrl: z.string().trim().max(2_000).optional().default(""),
  completionImageUrl: z.string().trim().max(2_000).optional().default(""),
  staffNotificationImageUrl: z.string().trim().max(2_000).optional().default(""),
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
  allianceRecruitmentText: z.string().trim().min(1).max(2_000),
  tickets: z.object(
{

    categories: z.object(
{

      staff: snowflake,
      partnership: snowflake,
      help_report: snowflake,
    
}
).strict(),
    staffReviewRoleId: snowflake,
    alliancePublicChannelId: snowflake,
    allianceOwnerGuildId: snowflake,
    allianceAnnouncementTemplate: z.string().trim().max(2_000).optional(),
    allianceAnnouncementMode: z.enum(["text", "embed"]).optional(),
    allianceAnnouncementImageUrl: z.string().trim().max(2_000).optional(),
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

function optionalExport<T>(getter: () => T): T | null {
  try {
    return getter();
  } catch {
    return null;
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


async function validateConfigTargets(guildId: string, config: ModerationConfig): Promise<void> 
{

  const client = getModerationClient()
;

  if (!client) throw new ModerationAuthError(503, "Discord moderation client is not available")
;

  const hasMessageContent = client.options.intents.has(GatewayIntentBits.MessageContent)
;

  const hasGuildMembers = client.options.intents.has(GatewayIntentBits.GuildMembers)
;

  if (!hasMessageContent && config.protection.enabled && (config.autoMod.enabled || config.antiSpam.enabled || config.antiFlood.enabled || config.ai.enabled)) 
{

    throw new ModerationAuthError(400, "Enable the Discord Message Content intent before enabling message moderation modules")
;

  
}

  if (!hasGuildMembers && config.protection.enabled && (config.antiRaid.enabled || config.suspiciousBehavior.enabled)) 
{

    throw new ModerationAuthError(400, "Enable the Discord Server Members intent before enabling raid or member-behaviour detection")
;

  
}

  const guild = await client.guilds.fetch(
{
 guild: guildId, force: true 
}
)
;

  const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()])
;

  const roleIds = [
    ...config.permissions.staffRoleIds, ...config.roles.sanctionableRoleIds,
    ...config.roles.protectedRoleIds, ...config.roles.ignoredAutoModRoleIds,
    ...config.roles.specialPermissionRoleIds, ...Object.values(config.manualTools.commandGrants).flat(),
  ]
;

  const channelIds = [
    ...config.channels.ignoredChannelIds, ...config.channels.protectedChannelIds,
    ...config.channels.autoSlowmodeChannelIds, ...config.channels.strictChannelIds,
    ...config.channels.softChannelIds,
    config.antiRaid.alertChannelId, config.antiSpam.logChannelId, config.audit.channelId,
    config.suspiciousBehavior.alertChannelId, config.ai.logChannelId,
  ].filter((id): id is string => Boolean(id))
;

  const missingRole = roleIds.find((id) => !roles.has(id))
;

  if (missingRole) throw new ModerationAuthError(400, `Role ${missingRole} is not in this guild`)
;

  const missingChannel = channelIds.find((id) => !channels.has(id))
;

  if (missingChannel) throw new ModerationAuthError(400, `Channel ${missingChannel} is not in this guild`)
;

  const nonTextChannel = channelIds.find((id) => !channels.get(id)?.isTextBased())
;

  if (nonTextChannel) throw new ModerationAuthError(400, `Channel ${nonTextChannel} is not a text-based guild channel`)
;

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
 authenticated: true, userId: session.userId, guilds, csrfToken: session.csrfToken, expiresAt: session.expiresAt.toISOString() 
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
  const bot = getModerationClient()?.user;

  res.json(
{

    discordOAuthConfigured: isDiscordOAuthConfigured(),
    authorizationUrl: "/api/moderation/oauth/discord",
    bot: bot ? {
      name: bot.globalName || bot.username,
      avatarUrl: bot.displayAvatarURL({ size: 128 }),
    } : null,
  
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

function verificationFailure(res: Response, guildId: string | undefined, code: string): void {
  const suffix = guildId ? `&guildId=${encodeURIComponent(guildId)}` : "";
  res.redirect(`/verificare?verification_error=${encodeURIComponent(code)}${suffix}`);
}

router.get("/oauth/discord", (req, res) => 
{

  try 
{

    assertLoginRateLimit(req)
;

    const verificationGuildId = typeof req.query.guildId === "string" ? parse(snowflake, req.query.guildId) : null;
    if (req.query.verification === "1") {
      if (!verificationGuildId) {
        res.redirect("/verificare?verification_error=invalid_server");
        return;
      }
      res.redirect(beginVerificationOAuth(res, verificationGuildId));
      return;
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

  const consumeRequest = optionalExport(() => consumeDiscordOAuthRequest);
  const consumeState = optionalExport(() => consumeDiscordOAuthState);
  const pendingState: PendingOAuthState | null = consumeRequest
    ? consumeRequest(req, res, state)
    : consumeState?.(req, res, state)
      ? { purpose: "moderation" as const, expiresAt: 0 }
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

    if (pendingState.purpose === "verification") {
      verificationFailure(res, pendingState.guildId, "cancelled");
    } else {
      oauthFailure(res, "cancelled");
    }
;

    return
;

  
}

  const code = typeof req.query.code === "string" ? req.query.code : undefined
;

  if (!code || oauthError) 
{

    if (pendingState.purpose === "verification") {
      verificationFailure(res, pendingState.guildId, "oauth_failed");
    } else {
      oauthFailure(res, "oauth_failed");
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

    if (pendingState.purpose === "verification") {
      const guildId = pendingState.guildId;
      if (!guildId) {
        res.redirect("/verificare?verification_error=invalid_server");
        return;
      }
      const snapshot = await fetchBotGuildSnapshot(guildId, identity.id);
      if (!snapshot) {
        res.redirect(`/verificare?guildId=${encodeURIComponent(guildId)}&verification_error=not_member`);
        return;
      }
      const client = getModerationClient();
      if (!client) {
        res.redirect(`/verificare?guildId=${encodeURIComponent(guildId)}&verification_error=bot_offline`);
        return;
      }
      const result = await verifyMember(client, guildId, identity.id);
      res.cookie(verificationCookieName(), createVerificationIdentityToken(guildId, identity.id), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1_000,
      });
      res.redirect(`/verificare?guildId=${encodeURIComponent(guildId)}&verification=${result}`);
      return;
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
  res.set("Cache-Control", "no-store").set("ETag", `"${result.version}"`).json(result);
}));

router.put("/guilds/:guildId/protection-toggle", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  const { key, enabled } = z.object({
    key: z.enum(["protection", "wordFilter", "linkBlock", "antiRaid", "antiSpam", "antiFlood", "ai"]),
    enabled: z.boolean(),
  }).parse(req.body);

  let result: Awaited<ReturnType<typeof moderationStore.putConfig>> | null = null;
  for (let attempt = 0; attempt < 5 && !result; attempt += 1) {
    const current = await moderationStore.getConfig(guildId);
    const nextConfig: ModerationConfig = { ...current.config };

    if (key === "protection") {
      nextConfig.protection = { ...current.config.protection, enabled };
    } else if (key === "wordFilter" || key === "linkBlock") {
      nextConfig.autoMod = {
        ...current.config.autoMod,
        enabled: enabled ? true : current.config.autoMod?.enabled,
        [key]: { ...current.config.autoMod?.[key], enabled },
      };
    } else if (key === "antiRaid") {
      nextConfig.antiRaid = { ...current.config.antiRaid, enabled };
    } else if (key === "antiSpam") {
      nextConfig.antiSpam = { ...current.config.antiSpam, enabled };
    } else if (key === "antiFlood") {
      nextConfig.antiFlood = { ...current.config.antiFlood, enabled };
    } else {
      nextConfig.ai = { ...current.config.ai, enabled };
    }

    try {
      await validateConfigTargets(guildId, nextConfig);
      result = await moderationStore.putConfig(guildId, nextConfig, session.userId, current.version);
    } catch (error) {
      if (!(error instanceof ModerationRevisionConflictError) || attempt === 4) throw error;
    }
  }

  if (!result) throw new Error("Configurația nu a putut fi salvată.");
  const client = getModerationClient();
  if (client) {
    void syncNativeAutoMod(client, guildId, result.config).catch((error) => {
      logger.warn({ error, guildId }, "Native Discord AutoMod synchronization failed after protection toggle");
    });
  }
  res.set("Cache-Control", "no-store").set("ETag", `"${result.version}"`).json(result);
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
  await setGameplayPaused(guildId, paused);

  if (paused) {
    stopGuildScheduler(guildId);
  } else {
    const client = getModerationClient();
    if (client) startGuildScheduler(client, guildId);
  }

  res.set("Cache-Control", "no-store").json({ paused });
}));

router.put("/guilds/:guildId/config", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  const config = parse(ModerationConfigSchema, req.body);
  await validateConfigTargets(guildId, config);
  const result = await moderationStore.putConfig(guildId, config, session.userId, expectedRevision(req));
  const client = getModerationClient();
  if (client) {
    void syncNativeAutoMod(client, guildId, result.config).catch((error) => {
      logger.warn({ error, guildId }, "Native Discord AutoMod synchronization failed after config save");
    });
  }
  res.set("Cache-Control", "no-store").set("ETag", `"${result.version}"`).json(result);
}));

router.get("/guilds/:guildId/bot-control", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config");
  await initGameplayConfig(guildId);
  const [channels, allianceRecruitmentText, tickets, verification] = await Promise.all([
    loadChannelConfig(guildId),
    loadAllianceRecruitmentText(guildId),
    loadTicketConfig(guildId),
    optionalExport(() => loadVerificationConfig)?.(guildId) ?? Promise.resolve(null),
  ]);
  res.set("Cache-Control", "no-store").json({
    channels: channels ?? {},
    allianceRecruitmentText: allianceRecruitmentText ?? "",
    tickets: normalizeTicketConfig(tickets),
    gameplayConfig: getGameplayConfig(guildId),
    verification: normalizeVerificationConfig(verification),
  });
}));

router.put("/guilds/:guildId/bot-control", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "config", true);
  const value = parse(botControlSchema, req.body);
  const tickets = normalizeTicketConfig(value.tickets);
  const channels: ChannelConfig = Object.fromEntries(
    Object.entries(value.channels).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  ) as ChannelConfig;
  await saveChannelConfig(guildId, channels);
  await saveAllianceRecruitmentText(guildId, value.allianceRecruitmentText);
  await saveTicketConfig(guildId, tickets);
  const gameplayConfig = await saveGuildGameplayConfig(guildId, value.gameplayConfig);
  const verification = normalizeVerificationConfig(value.verification);
  const saveVerification = optionalExport(() => saveVerificationConfig);
  if (saveVerification && Object.prototype.hasOwnProperty.call(req.body ?? {}, "verification")) {
    await saveVerification(guildId, verification);
  }
  let savedVerification = verification;
  if (verification.enabled && Object.prototype.hasOwnProperty.call(req.body ?? {}, "verification")) {
    const client = getModerationClient();
    if (!client) throw new ModerationAuthError(503, "Discord botul nu este disponibil pentru publicarea panoului.");
    savedVerification = await publishVerificationPanel(client, guildId, verification);
  }
  await initChannelConfig(guildId);
  setTicketConfig(guildId, tickets);
  res.status(200).json({
    channels,
    allianceRecruitmentText: value.allianceRecruitmentText,
    tickets,
    gameplayConfig,
    verification: savedVerification,
  });
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
  if (!client.options.intents.has(GatewayIntentBits.GuildMembers)) {
    throw new ModerationAuthError(503, "Botul nu are intentul Guild Members necesar pentru lista membrilor verificați.");
  }

  const config = normalizeVerificationConfig(await loadVerificationConfig(guildId));
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const role = config.roleId ? await guild.roles.fetch(config.roleId) : null;
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

  const members = await guild.members.fetch();
  const verifiedMembers = [...members.values()]
    .filter((member) => !member.user.bot && member.roles.cache.has(role.id))
    .map((member) => ({
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      avatarUrl: member.user.displayAvatarURL({ size: 64 }),
      joinedAt: member.joinedAt?.toISOString() ?? null,
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
  const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  res.json({
    guild: { id: guild.id, name: guild.name, ownerId: guild.ownerId },
    roles: [...roles.values()].filter(Boolean).map((role) => ({ id: role.id, name: role.name, position: role.position, managed: role.managed })),
    channels: [...channels.values()]
      .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
      .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId })),
    botCapabilities: {
      online: client.isReady(),
      messageContent: client.options.intents.has(GatewayIntentBits.MessageContent),
      guildMembers: client.options.intents.has(GatewayIntentBits.GuildMembers),
      canManageGuild: guild.members.me?.permissions.has("ManageGuild") ?? false,
      canModerateMembers: guild.members.me?.permissions.has("ModerateMembers") ?? false,
      canManageMessages: guild.members.me?.permissions.has("ManageMessages") ?? false,
      canManageChannels: guild.members.me?.permissions.has("ManageChannels") ?? false,
      canKickMembers: guild.members.me?.permissions.has("KickMembers") ?? false,
      canBanMembers: guild.members.me?.permissions.has("BanMembers") ?? false,
    },
  });
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

  const 
{
 limit, offset 
}
 = parse(paginationSchema, req.query)
;

  res.json(
{
 items: await moderationStore.listAudit(guildId, limit, offset) 
}
)
;

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
    const result = await executeModerationAction(actionInput);

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
