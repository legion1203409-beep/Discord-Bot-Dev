import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type { Client, Guild } from "discord.js";
import type { GameGuildSnapshot } from "@workspace/db";
import {
  fetchBotGuildSnapshot,
  type DiscordOAuthGuild,
} from "../moderation/oauth";
import { getModerationClient } from "../moderation/auth";
import {
  createGamePlayerSession,
  getGamePlayerSession,
  hashGameSessionToken,
  revokeGamePlayerSession,
  type GamePlayerSession,
} from "./store";

const SESSION_COOKIE = "rpg_player_session";
const SESSION_COOKIE_PATH = "/api";
const SNOWFLAKE = /^\d{5,25}$/;

export class GameAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GameAuthError";
  }
}

export function parseGameCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireGamePlayerSession(req: Request): Promise<GamePlayerSession> {
  const token = parseGameCookie(req.headers.cookie);
  if (!token) throw new GameAuthError(401, "A player session is required");
  const session = await getGamePlayerSession(hashGameSessionToken(token));
  if (!session) throw new GameAuthError(401, "The player session has expired");
  return session;
}

export function assertGameCsrf(req: Request, session: GamePlayerSession): void {
  const supplied = req.header("x-csrf-token");
  if (!supplied || !equalSecret(supplied, session.csrfToken)) {
    throw new GameAuthError(403, "A valid CSRF token is required");
  }
}

export function setGamePlayerSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: SESSION_COOKIE_PATH,
  });
}

export function clearGamePlayerSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: SESSION_COOKIE_PATH,
  });
}

export async function revokeCurrentGamePlayerSession(req: Request): Promise<void> {
  const token = parseGameCookie(req.headers.cookie);
  if (token) await revokeGamePlayerSession(hashGameSessionToken(token));
}

function discordErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; rawError?: { code?: unknown }; status?: unknown };
  const code = value.code ?? value.rawError?.code;
  if (typeof code === "number") return code;
  if (typeof code === "string" && /^\d+$/.test(code)) return Number(code);
  if (value.status === 404) return 10007;
  return null;
}

function isNotFound(error: unknown): boolean {
  const code = discordErrorCode(error);
  return code === 10004 || code === 10007;
}

async function forceFetchGuildMember(
  client: Client,
  guildId: string,
  userId: string,
): Promise<Guild> {
  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  await guild.members.fetch({ user: userId, force: true });
  return guild;
}

export async function listPlayerGuilds(
  userId: string,
  oauthGuilds: DiscordOAuthGuild[],
): Promise<GameGuildSnapshot[]> {
  const client = getModerationClient();
  if (client) {
    const botGuilds = await client.guilds.fetch();
    return oauthGuilds.flatMap((candidate) => {
      const guild = botGuilds.get(candidate.id);
      if (!guild) return [];
      return [{
        id: guild.id,
        name: guild.name || candidate.name,
        iconUrl: guild.iconURL({ size: 64 }),
      }];
    });
  }

  const result: GameGuildSnapshot[] = [];
  for (let offset = 0; offset < oauthGuilds.length; offset += 5) {
    const batch = oauthGuilds.slice(offset, offset + 5);
    const verified = await Promise.all(batch.map(async (candidate) => {
      const snapshot = await fetchBotGuildSnapshot(candidate.id, userId);
      if (!snapshot) return null;
      return { id: snapshot.guild.id, name: snapshot.guild.name, iconUrl: null };
    }));
    for (const guild of verified) {
      if (guild) result.push(guild);
    }
  }
  return result;
}

export async function requirePlayerGuild(
  session: GamePlayerSession,
  guildId: string,
): Promise<GameGuildSnapshot> {
  if (!SNOWFLAKE.test(guildId) || !session.guilds.some((guild) => guild.id === guildId)) {
    throw new GameAuthError(403, "You are not eligible to play in this guild");
  }

  const client = getModerationClient();
  try {
    if (client) {
      const guild = await forceFetchGuildMember(client, guildId, session.userId);
      return {
        id: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL({ size: 64 }),
      };
    }
    const snapshot = await fetchBotGuildSnapshot(guildId, session.userId);
    if (!snapshot) {
      throw new GameAuthError(403, "You are no longer a member of this guild");
    }
    return { id: guildId, name: snapshot.guild.name, iconUrl: null };
  } catch (error) {
    if (error instanceof GameAuthError) throw error;
    if (isNotFound(error)) {
      throw new GameAuthError(403, "You are no longer a member of this guild");
    }
    throw new GameAuthError(503, "Discord membership could not be verified");
  }
}

export async function createPlayerSession(
  userId: string,
  username: string,
  guilds: GameGuildSnapshot[],
) {
  return createGamePlayerSession(userId, username, guilds);
}

export async function revokePlayerSession(session: GamePlayerSession): Promise<void> {
  await revokeGamePlayerSession(session.tokenHash);
}

