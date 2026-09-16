import { Router, type ErrorRequestHandler, type RequestHandler, type Response } from "express";
import { z, ZodError } from "zod";
import { GatewayIntentBits } from "discord.js";
import {
  assertCsrf,
  assertLoginRateLimit,
  assertMutationRateLimit,
  assertTrustedOrigin,
  assertGuildAccess,
  clearSessionCookie,
  exchangeLoginCode,
  getModerationClient,
  listAccessibleGuilds,
  ModerationAuthError,
  requireSession,
  revokeRequestSessionIfPresent,
  setSessionCookie,
  type AuthenticatedRequest,
} from "./auth";
import { EvidenceSchema, ModerationConfigSchema, type ModerationConfig } from "./config";
import { ModerationRevisionConflictError } from "./errors";
import { moderationStore } from "./store";

const router = Router();
const snowflake = z.string().regex(/^\d{5,25}$/);
const uuid = z.string().uuid();
const actionType = z.enum(["warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock", "unlock", "nick", "role"]);

const loginSchema = z.object({ code: z.string().trim().regex(/^[0-9A-F]{24}$/i) });
const idempotencyKeySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
const actionSchema = z.object({
  type: actionType,
  targetId: snowflake.optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  durationMinutes: z.number().int().min(1).max(40_320).optional(),
  channelId: snowflake.optional(),
  roleId: snowflake.optional(),
  nickname: z.string().trim().min(1).max(32).optional(),
  amount: z.number().int().min(1).max(100).optional(),
}).superRefine((value, ctx) => {
  if (["warn", "mute", "kick", "ban", "unmute", "nick", "role"].includes(value.type) && !value.targetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "targetId is required for this action" });
  }
  if (value.type === "mute" && !value.durationMinutes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "durationMinutes is required for mute" });
  }
  if (value.type === "purge" && !value.amount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount is required for purge" });
  }
});

function asyncRoute(handler: (req: AuthenticatedRequest, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => { void handler(req as AuthenticatedRequest, res).catch(next); };
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}

function expectedRevision(req: AuthenticatedRequest): number {
  const value = req.header("if-match");
  const match = value?.match(/^"?(\d+)"?$/);
  if (!match) throw new ModerationAuthError(428, "If-Match configuration revision is required");
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new ModerationAuthError(400, "Invalid configuration revision");
  return revision;
}

async function validateConfigTargets(guildId: string, config: ModerationConfig): Promise<void> {
  const client = getModerationClient();
  if (!client) throw new ModerationAuthError(503, "Discord moderation client is not available");
  const hasMessageContent = client.options.intents.has(GatewayIntentBits.MessageContent);
  const hasGuildMembers = client.options.intents.has(GatewayIntentBits.GuildMembers);
  if (!hasMessageContent && (config.autoMod.enabled || config.antiSpam.enabled || config.antiFlood.enabled || config.ai.enabled)) {
    throw new ModerationAuthError(400, "Enable the Discord Message Content intent before enabling message moderation modules");
  }
  if (!hasGuildMembers && (config.antiRaid.enabled || config.suspiciousBehavior.enabled)) {
    throw new ModerationAuthError(400, "Enable the Discord Server Members intent before enabling raid or member-behaviour detection");
  }
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  const roleIds = [
    ...config.permissions.staffRoleIds, ...config.roles.sanctionableRoleIds,
    ...config.roles.protectedRoleIds, ...config.roles.ignoredAutoModRoleIds,
    ...config.roles.specialPermissionRoleIds, ...Object.values(config.manualTools.commandGrants).flat(),
  ];
  const channelIds = [
    ...config.channels.ignoredChannelIds, ...config.channels.protectedChannelIds,
    ...config.channels.autoSlowmodeChannelIds, ...config.channels.strictChannelIds,
    ...config.channels.softChannelIds,
    config.antiRaid.alertChannelId, config.antiSpam.logChannelId, config.audit.channelId,
    config.suspiciousBehavior.alertChannelId, config.ai.logChannelId,
  ].filter((id): id is string => Boolean(id));
  const missingRole = roleIds.find((id) => !roles.has(id));
  if (missingRole) throw new ModerationAuthError(400, `Role ${missingRole} is not in this guild`);
  const missingChannel = channelIds.find((id) => !channels.has(id));
  if (missingChannel) throw new ModerationAuthError(400, `Channel ${missingChannel} is not in this guild`);
  const nonTextChannel = channelIds.find((id) => !channels.get(id)?.isTextBased());
  if (nonTextChannel) throw new ModerationAuthError(400, `Channel ${nonTextChannel} is not a text-based guild channel`);
}

async function validateEvidenceTargets(guildId: string, evidence: z.infer<typeof EvidenceSchema>): Promise<void> {
  const channelIds = evidence.flatMap((item) => item.channelId ? [item.channelId] : []);
  if (!channelIds.length) return;
  const client = getModerationClient();
  if (!client) throw new ModerationAuthError(503, "Discord moderation client is not available");
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const channels = await guild.channels.fetch();
  const missing = channelIds.find((id) => !channels.has(id));
  if (missing) throw new ModerationAuthError(400, `Evidence channel ${missing} is not in this guild`);
}

async function enforceCaseRetention(guildId: string): Promise<ModerationConfig> {
  const config = (await moderationStore.getConfig(guildId)).config;
  await moderationStore.pruneCases(guildId, config.cases.retentionDays);
  return config;
}

async function sessionAndGuild(req: AuthenticatedRequest, guildId: string, purpose: "operations" | "config" | "audit", csrf = false) {
  const session = await requireSession(req);
  if (csrf) assertCsrf(req, session);
  if (csrf) assertMutationRateLimit(session);
  await assertGuildAccess(guildId, session.userId, purpose);
  return session;
}

router.get("/session", asyncRoute(async (req, res) => {
  try {
    const session = await requireSession(req);
    const guilds = await listAccessibleGuilds(session.userId);
    res.json({ authenticated: true, userId: session.userId, guilds, csrfToken: session.csrfToken, expiresAt: session.expiresAt.toISOString() });
  } catch (error) {
    if (error instanceof ModerationAuthError) {
      res.status(200).json({ authenticated: false });
      return;
    }
    throw error;
  }
}));

router.post("/login", asyncRoute(async (req, res) => {
  assertTrustedOrigin(req);
  assertLoginRateLimit(req);
  const { code } = parse(loginSchema, req.body);
  const { token, session } = await exchangeLoginCode(code);
  await revokeRequestSessionIfPresent(req);
  setSessionCookie(res, token, session.expiresAt);
  const guilds = await listAccessibleGuilds(session.userId);
  res.status(201).json({ guilds, csrfToken: session.csrfToken, expiresAt: session.expiresAt.toISOString() });
}));

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
  res.set("ETag", `"${result.version}"`).json(result);
}));

router.put("/guilds/:guildId/config", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "config", true);
  const config = parse(ModerationConfigSchema, req.body);
  await validateConfigTargets(guildId, config);
  const result = await moderationStore.putConfig(guildId, config, session.userId, expectedRevision(req));
  res.set("ETag", `"${result.version}"`).json(result);
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
    return `"${formulaPrefix ? `'${text}` : text}"`;
  };
  res.send(["id,subjectId,actorId,actionType,reason,status,createdAt",
    ...items.map((item) => [item.id, item.subjectId, item.actorId, item.actionType, item.reason, item.status, item.createdAt.toISOString()].map(quoted).join(",")),
  ].join("\n"));
}));

router.get("/guilds/:guildId/cases/:caseId", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const caseId = parse(uuid, req.params.caseId);
  await sessionAndGuild(req, guildId, "operations");
  await enforceCaseRetention(guildId);
  const item = await moderationStore.getCase(guildId, caseId);
  if (!item) { res.status(404).json({ error: "Case not found" }); return; }
  res.json({ ...item, notes: await moderationStore.listCaseNotes(guildId, caseId) });
}));

router.patch("/guilds/:guildId/cases/:caseId", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const caseId = parse(uuid, req.params.caseId);
  const session = await sessionAndGuild(req, guildId, "operations", true);
  const body = parse(z.object({ status: z.enum(["open", "closed"]).optional(), reason: z.string().trim().min(1).max(500).optional(), evidence: EvidenceSchema.optional() }).refine((v) => v.status || v.reason || v.evidence, "Provide an update"), req.body);
  if (body.evidence) await validateEvidenceTargets(guildId, body.evidence);
  const currentConfig = await enforceCaseRetention(guildId);
  if (body.status === "closed" && !currentConfig.cases.allowStaffClose) {
    await sessionAndGuild(req, guildId, "audit");
  }
  const item = await moderationStore.updateCase({ guildId, caseId, actorId: session.userId, ...body });
  if (!item) { res.status(404).json({ error: "Case not found" }); return; }
  res.json(item);
}));

router.post("/guilds/:guildId/cases/:caseId/notes", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const caseId = parse(uuid, req.params.caseId);
  const session = await sessionAndGuild(req, guildId, "operations", true);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4_000) }), req.body);
  if (!(await enforceCaseRetention(guildId)).cases.allowStaffNotes) {
    await sessionAndGuild(req, guildId, "audit");
  }
  const note = await moderationStore.addCaseNote({ guildId, caseId, authorId: session.userId, body });
  if (!note) { res.status(404).json({ error: "Case not found" }); return; }
  res.status(201).json(note);
}));

router.get("/guilds/:guildId/logs/audit", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "audit");
  const { limit, offset } = parse(paginationSchema, req.query);
  res.json({ items: await moderationStore.listAudit(guildId, limit, offset) });
}));

router.get("/guilds/:guildId/logs", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "operations");
  const { limit, offset } = parse(paginationSchema, req.query);
  res.json({ items: await moderationStore.listModerationLogs(guildId, limit, offset) });
}));

router.post("/guilds/:guildId/actions", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const session = await sessionAndGuild(req, guildId, "operations", true);
  const input = parse(actionSchema, req.body);
  const idempotencyKey = parse(idempotencyKeySchema, req.header("idempotency-key"));
  const existing = await moderationStore.getAction(guildId, idempotencyKey);
  if (existing) {
    if (existing.status === "applied") {
      res.status(200).json(existing.result ?? { actionId: existing.id, summary: "Action already applied" });
      return;
    }
    res.status(409).json({ error: existing.status === "pending" || existing.status === "uncertain" ? "Action requires operator reconciliation" : "Action previously failed", actionId: existing.id, status: existing.status });
    return;
  }
  // The engine alone reserves the ledger so Discord commands, AutoMod, and
  // HTTP use exactly one idempotency reservation path.
  try {
    const { executeModerationAction } = await import("../bot/moderation/engine");
    const result = await executeModerationAction({ guildId, actorId: session.userId, ...input, idempotencyKey } as never);
    res.status(201).json(result);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === "MODERATION_ACTION_PENDING" || code === "MODERATION_ACTION_UNCERTAIN" || code === "MODERATION_ACTION_FAILED") {
      res.status(409).json({ error: "Action requires operator reconciliation", code });
      return;
    }
    throw error;
  }
}));

router.get("/guilds/:guildId/actions", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  await sessionAndGuild(req, guildId, "audit");
  const { limit, offset } = parse(paginationSchema, req.query);
  const { status } = parse(z.object({ status: z.enum(["pending", "uncertain", "applied", "failed"]).optional() }), req.query);
  res.json({ items: await moderationStore.listActions(guildId, status, limit, offset) });
}));

router.patch("/guilds/:guildId/actions/:actionId/reconcile", asyncRoute(async (req, res) => {
  const guildId = parse(snowflake, req.params.guildId);
  const actionId = parse(uuid, req.params.actionId);
  const session = await sessionAndGuild(req, guildId, "audit", true);
  const body = parse(z.object({
    status: z.enum(["applied", "failed", "uncertain"]), note: z.string().trim().min(1).max(500),
    confirmedOffense: z.object({ userId: snowflake, resetAfterDays: z.number().int().min(1).max(3650) }).optional(),
  }), req.body);
  const item = await moderationStore.reconcileAction({ guildId, actionId, actorId: session.userId, ...body });
  if (!item) { res.status(404).json({ error: "Pending or uncertain action not found" }); return; }
  res.json(item);
}));

const moderationErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ModerationAuthError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid moderation request", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    return;
  }
  if (error instanceof ModerationRevisionConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Moderation request failed" });
};
router.use(moderationErrorHandler);

export default router;