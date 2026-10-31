import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameGuildSnapshot } from "@workspace/db";
import type { Response } from "express";
import {
  assertGameCsrf,
  GameAuthError,
  requirePlayerGuild,
  setGamePlayerSessionCookie,
} from "../auth";
import type { GamePlayerSession } from "../store";

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  fetchSnapshot: vi.fn(),
}));

vi.mock("../../moderation/auth", () => ({
  getModerationClient: mocks.getClient,
}));

vi.mock("../../moderation/oauth", () => ({
  fetchBotGuildSnapshot: mocks.fetchSnapshot,
}));

function session(guilds: GameGuildSnapshot[], csrfToken = "csrf-token"): GamePlayerSession {
  return {
    userId: "987654321",
    guilds,
    csrfToken,
  } as unknown as GamePlayerSession;
}

describe("browser RPG guild access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getClient.mockReturnValue(null);
  });

  it("rejects a guild that is not in the signed-in player's guild snapshot", async () => {
    await expect(requirePlayerGuild(
      session([{ id: "123456789", name: "First guild", iconUrl: null }]),
      "222222222",
    )).rejects.toMatchObject({ status: 403 });
    expect(mocks.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("rechecks current Discord membership with the session user ID", async () => {
    mocks.fetchSnapshot.mockResolvedValue({
      guild: { id: "123456789", name: "Current guild", ownerId: "111111111" },
      member: { id: "987654321", roleIds: [] },
      roles: [],
    });

    await expect(requirePlayerGuild(
      session([{ id: "123456789", name: "Old name", iconUrl: null }]),
      "123456789",
    )).resolves.toEqual({
      id: "123456789",
      name: "Current guild",
      iconUrl: null,
    });
    expect(mocks.fetchSnapshot).toHaveBeenCalledWith("123456789", "987654321");
  });

  it("denies access after the player leaves the guild", async () => {
    mocks.fetchSnapshot.mockResolvedValue(null);

    await expect(requirePlayerGuild(
      session([{ id: "123456789", name: "Eligible guild", iconUrl: null }]),
      "123456789",
    )).rejects.toMatchObject({
      status: 403,
      message: "You are no longer a member of this guild",
    } satisfies Partial<GameAuthError>);
  });

  it("fails closed when Discord cannot verify current membership", async () => {
    mocks.fetchSnapshot.mockRejectedValue(new Error("Discord unavailable"));

    await expect(requirePlayerGuild(
      session([{ id: "123456789", name: "Eligible guild", iconUrl: null }]),
      "123456789",
    )).rejects.toMatchObject({ status: 503 });
  });

  it("requires the player session CSRF token on mutations", () => {
    const req = { header: vi.fn(() => "csrf-token") } as unknown as Parameters<typeof assertGameCsrf>[0];
    expect(() => assertGameCsrf(req, session([]))).not.toThrow();
    expect(() => assertGameCsrf(
      { header: vi.fn(() => "wrong-token") } as unknown as typeof req,
      session([]),
    )).toThrow(GameAuthError);
  });

  it("scopes the HttpOnly player cookie to the API while allowing the shared OAuth callback", () => {
    const res = { cookie: vi.fn() } as unknown as Response;
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    setGamePlayerSessionCookie(res, "opaque-token", expiresAt);
    expect(res.cookie).toHaveBeenCalledWith(
      "rpg_player_session",
      "opaque-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/api",
        expires: expiresAt,
      }),
    );
  });
});
