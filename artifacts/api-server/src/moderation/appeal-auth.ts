/**
 * Cine e logat pe pagina de contestație: un cookie semnat, separat de sesiunea
 * panoului, care ține doar contul Discord (ID, nume, poză). Nu dă acces la
 * nimic din panou; servește numai rutelor /api/moderation/appeals.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const APPEAL_COOKIE = "regat_appeal";
const APPEAL_COOKIE_PATH = "/api/moderation/appeals";
const APPEAL_TTL_MS = 2 * 60 * 60 * 1_000;

export type AppealIdentity = { userId: string; name: string; username: string; avatar: string | null };

function secret(): string {
  // A key of its own, so a verification cookie can never pass for this one.
  return `${process.env.SESSION_SECRET?.trim() || "development-verification-secret"}:ban-appeal`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createAppealToken(identity: AppealIdentity, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ kind: "appeal", ...identity, exp: now + APPEAL_TTL_MS }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseAppealToken(token: string | null | undefined, now = Date.now()): AppealIdentity | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const left = Buffer.from(signature);
  const right = Buffer.from(sign(payload));
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (value.kind !== "appeal" || typeof value.exp !== "number" || value.exp <= now) return null;
    if (typeof value.userId !== "string" || !/^\d{5,25}$/.test(value.userId)) return null;
    return {
      userId: value.userId,
      name: typeof value.name === "string" ? value.name : value.userId,
      username: typeof value.username === "string" ? value.username : "",
      avatar: typeof value.avatar === "string" ? value.avatar : null,
    };
  } catch {
    return null;
  }
}

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: APPEAL_COOKIE_PATH,
    ...(expires ? { expires, maxAge: APPEAL_TTL_MS } : {}),
  };
}

export function setAppealCookie(res: Response, identity: AppealIdentity): void {
  res.cookie(APPEAL_COOKIE, createAppealToken(identity), cookieOptions(new Date(Date.now() + APPEAL_TTL_MS)));
}

export function clearAppealCookie(res: Response): void {
  res.clearCookie(APPEAL_COOKIE, cookieOptions());
}

export function appealIdentityFromRequest(req: Pick<Request, "headers">): AppealIdentity | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== APPEAL_COOKIE) continue;
    try {
      return parseAppealToken(decodeURIComponent(value.join("=")));
    } catch {
      return null;
    }
  }
  return null;
}
