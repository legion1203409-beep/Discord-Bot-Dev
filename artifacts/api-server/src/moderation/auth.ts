import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { PermissionFlagsBits, type Client, type Guild, type GuildMember } from "discord.js";
import { moderationStore, type ModerationSession } from "./store";

const COOKIE_NAME = "moderation_session";
const LOGIN_CODE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 8 * 60 * 60_000;

let moderationClient: Client | null = null;
const loginAttempts = new Map<string, number[]>();
const mutationAttempts = new Map<string, number[]>();

export type GuildAccess = "staff" | "manager" | "administrator" | "owner";
export type GuildAccessPurpose = "operations" | "config" | "audit";

export interface AuthenticatedRequest extends Request {
  moderationSession?: ModerationSession;
}

export function setModerationClient(client: Client): void {
  moderationClient = client;
}

export function getModerationClient(): Client | null {
  return moderationClient;
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeLoginCode(): string {
  // Hex avoids ambiguous characters when staff types the code from Discord.
  return randomBytes(12).toString("hex").toUpperCase();
}

function makeSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function equalSecrets(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireClient(): Client {
  if (!moderationClient) throw new Error("Discord moderation client is not available");
  return moderationClient;
}

async function fetchGuildAndMember(guildId: string, userId: string): Promise<{ guild: Guild; member: GuildMember }> {
  const client = requireClient();
  // Permission changes must take effect immediately: cache reads would leave a
  // revoked staff member authorized until Discord evicts the cached member.
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const member = await guild.members.fetch({ user: userId, force: true });
  return { guild, member };
}

export async function getGuildAccess(guildId: string, userId: string): Promise<GuildAccess | null> {
  let guild: Guild;
  let member: GuildMember;
  try {
    ({ guild, member } = await fetchGuildAndMember(guildId, userId));
  } catch {
    // A missing member, inaccessible guild, or unavailable Discord client must
    // never be interpreted as permission to access moderation data.
    return null;
  }
  if (guild.ownerId === userId) return "owner";
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return "administrator";
  const config = await moderationStore.getConfig(guildId);
  if (config.config.permissions.allowManageGuild && member.permissions.has(PermissionFlagsBits.ManageGuild)) return "manager";
  if (config.config.permissions.staffRoleIds.some((id) => member.roles.cache.has(id))) return "staff";
  return null;
}

export async function assertGuildAccess(guildId: string, userId: string, purpose: GuildAccessPurpose): Promise<GuildAccess> {
  const access = await getGuildAccess(guildId, userId);
  if (!access) throw new ModerationAuthError(403, "You no longer have moderation access in this guild");
  if (purpose === "operations") return access;
  if (access === "owner") return access;
  const config = await moderationStore.getConfig(guildId);
  if (access === "administrator" && config.config.permissions.allowAdminsSettings) return access;
  throw new ModerationAuthError(403, "Only the guild owner may access moderation settings and audit");
}

export class ModerationAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Called by the Discord /moderare command; display the result only ephemerally. */
export async function issueLoginCode(guildId: string, userId: string): Promise<string> {
  await assertGuildAccess(guildId, userId, "operations");
  const code = makeLoginCode();
  await moderationStore.createLoginCode({
    guildId, userId, codeHash: hashSecret(code), expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
  });
  return code;
}

export async function exchangeLoginCode(code: string): Promise<{ token: string; session: ModerationSession; guildId: string }> {
  const login = await moderationStore.consumeLoginCode(hashSecret(code));
  if (!login) throw new ModerationAuthError(401, "Login code is invalid, expired, or has already been used");
  // Revalidate identity at the time of exchange, not merely when /moderare ran.
  await assertGuildAccess(login.guildId, login.userId, "operations");
  const token = makeSessionToken();
  const session: ModerationSession = {
    id: randomUUID(), userId: login.userId, tokenHash: hashSecret(token),
    csrfToken: randomBytes(24).toString("base64url"),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS), revokedAt: null,
  };
  await moderationStore.createSession(session);
  return { token, session, guildId: login.guildId };
}

export async function requireSession(req: AuthenticatedRequest): Promise<ModerationSession> {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (!token) throw new ModerationAuthError(401, "Authentication is required");
  const session = await moderationStore.getSession(hashSecret(token));
  if (!session) throw new ModerationAuthError(401, "Your moderation session has expired");
  req.moderationSession = session;
  return session;
}

/** Revoke an existing browser session after a successful code login replaces it. */
export async function revokeRequestSessionIfPresent(req: AuthenticatedRequest): Promise<void> {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (token) await moderationStore.revokeSession(hashSecret(token));
}

/** Reject cross-site browser login attempts; non-browser Discord/API clients have no Origin. */
export function assertTrustedOrigin(req: Request): void {
  const origin = req.header("origin");
  if (!origin) return;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    throw new ModerationAuthError(403, "Invalid request origin");
  }
  let configured: string | undefined;
  try {
    configured = process.env.MODERATION_WEB_ORIGIN
      ? new URL(process.env.MODERATION_WEB_ORIGIN).origin
      : undefined;
  } catch {
    throw new ModerationAuthError(503, "MODERATION_WEB_ORIGIN is invalid");
  }
  // Replit terminates TLS at its proxy while the Express hop is HTTP. Compare
  // the browser Origin host to the server-observed Host, never X-Forwarded-Host.
  const requestHost = req.get("host")?.toLowerCase();
  const originHost = new URL(normalized).host.toLowerCase();
  const sameHost = Boolean(requestHost && originHost === requestHost);
  if (normalized !== configured && !sameHost) {
    throw new ModerationAuthError(403, "Untrusted request origin");
  }
}

function consumeRateBucket(buckets: Map<string, number[]>, key: string, max: number, windowMs: number, message: string): void {
  const now = Date.now();
  const values = (buckets.get(key) ?? []).filter((at) => at > now - windowMs);
  if (values.length >= max) throw new ModerationAuthError(429, message);
  values.push(now);
  buckets.set(key, values);
  if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value!);
}

export function assertLoginRateLimit(req: Request): void {
  consumeRateBucket(loginAttempts, req.ip || "unknown", 10, 10 * 60_000, "Too many login attempts; try again later");
}

export function assertMutationRateLimit(session: ModerationSession): void {
  consumeRateBucket(mutationAttempts, session.id, 120, 60_000, "Too many moderation mutations; try again shortly");
}

export function assertCsrf(req: AuthenticatedRequest, session: ModerationSession): void {
  const value = req.header("x-csrf-token");
  if (!value || !equalSecrets(value, session.csrfToken)) {
    throw new ModerationAuthError(403, "A valid CSRF token is required");
  }
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/api/moderation",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/api/moderation",
  });
}

export async function listAccessibleGuilds(userId: string): Promise<Array<{ id: string; name: string; access: GuildAccess }>> {
  const client = requireClient();
  const guilds = await client.guilds.fetch();
  const result: Array<{ id: string; name: string; access: GuildAccess }> = [];
  for (const guild of guilds.values()) {
    const access = await getGuildAccess(guild.id, userId);
    if (access) result.push({ id: guild.id, name: guild.name, access });
  }
  return result;
}