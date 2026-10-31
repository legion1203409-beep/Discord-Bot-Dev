import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeState: vi.fn(),
  consumeRequest: vi.fn(),
  exchange: vi.fn(),
  identity: vi.fn(),
  listGuilds: vi.fn(),
  createSession: vi.fn(),
  revoke: vi.fn(),
  setCookie: vi.fn(),
  clearCookie: vi.fn(),
  configured: vi.fn(),
  invite: vi.fn(),
  beginVerification: vi.fn(),
  verificationWebsiteUrl: vi.fn(),
  createTicket: vi.fn(),
  consumeTicket: vi.fn(),
  loadVerificationConfig: vi.fn(),
  snapshot: vi.fn(),
  verifyMember: vi.fn(),
  requireSession: vi.fn(),
  access: vi.fn(),
  csrf: vi.fn(),
  client: vi.fn(),
  getConfig: vi.fn(),
  putConfig: vi.fn(),
  listCases: vi.fn(),
  listAudit: vi.fn(),
  listLogs: vi.fn(),
  getAction: vi.fn(),
  execute: vi.fn(),
  appealUser: vi.fn(),
  appealUrl: vi.fn(),
  beginAppeal: vi.fn(),
  appealStatus: vi.fn(),
  submitAppeal: vi.fn(),
  answerClarification: vi.fn(),
}));

vi.mock("../auth", () => ({
  ModerationAuthError: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
  requireSession: mocks.requireSession,
  assertGuildAccess: mocks.access,
  assertCsrf: mocks.csrf,
  getModerationClient: mocks.client,
  assertLoginRateLimit: vi.fn(),
  assertMutationRateLimit: vi.fn(),
  clearSessionCookie: mocks.clearCookie,
  createModerationSession: mocks.createSession,
  listAccessibleGuilds: mocks.listGuilds,
  revokeRequestSessionIfPresent: mocks.revoke,
  setSessionCookie: mocks.setCookie,
}));

vi.mock("../oauth", () => ({
  beginDiscordOAuth: vi.fn(() => "https://discord.com/oauth2/authorize?state=opaque"),
  beginVerificationOAuth: mocks.beginVerification,
  consumeDiscordOAuthRequest: mocks.consumeRequest,
  consumeDiscordOAuthState: mocks.consumeState,
  exchangeDiscordOAuthCode: mocks.exchange,
  fetchDiscordOAuthIdentity: mocks.identity,
  fetchBotGuildSnapshot: mocks.snapshot,
  isDiscordOAuthConfigured: mocks.configured,
  getDiscordBotInviteUrl: mocks.invite,
  getVerificationWebsiteUrl: mocks.verificationWebsiteUrl,
  fetchDiscordOAuthUser: mocks.appealUser,
  getAppealWebsiteUrl: mocks.appealUrl,
  beginAppealOAuth: mocks.beginAppeal,
}));

vi.mock("../appeals", () => ({
  appealStatus: mocks.appealStatus,
  submitAppeal: mocks.submitAppeal,
  answerClarification: mocks.answerClarification,
}));

vi.mock("../../bot/verification", () => ({
  createVerificationLinkToken: mocks.createTicket,
  createVerificationIdentityToken: vi.fn(() => "signed-verification-token"),
  consumeVerificationLinkToken: mocks.consumeTicket,
  normalizeVerificationConfig: vi.fn((value) => value),
  parseVerificationIdentityToken: vi.fn(),
  publishVerificationPanel: vi.fn(),
  verificationCookieName: vi.fn(() => "verification_identity"),
  verifyMember: mocks.verifyMember,
  grantVerificationRoles: vi.fn(),
  extraRoleProblem: vi.fn(() => null),
  DEFAULT_VERIFICATION_CONFIG: {},
  MAX_MANUAL_VERIFICATION_MEMBERS: 25,
  MAX_VERIFICATION_EXTRA_ROLES: 10,
  VERIFICATION_ELEVATED_PERMISSIONS: [],
}));

vi.mock("../../bot/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bot/db")>()),
  loadVerificationConfig: mocks.loadVerificationConfig,
}));

vi.mock("../../bot/invite-recruitment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bot/invite-recruitment")>()),
  completeRecruitmentReferral: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../store", () => ({
  moderationStore: {
    getConfig: mocks.getConfig,
    putConfig: mocks.putConfig,
    listCases: mocks.listCases,
    listAudit: mocks.listAudit,
    listModerationLogs: mocks.listLogs,
    pruneCases: vi.fn(),
    getAction: mocks.getAction,
  },
}));

vi.mock("../../bot/moderation/engine", () => ({ executeModerationAction: mocks.execute }));

import router from "../router";

describe("Discord OAuth moderation routes", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/moderation", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    base = `http://127.0.0.1:${address.port}/moderation`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.invite.mockReturnValue("https://discord.com/oauth2/authorize?client_id=123456789&scope=bot+applications.commands&permissions=268528688");
    mocks.consumeRequest.mockReturnValue({ purpose: "moderation", expiresAt: Date.now() + 60_000 });
    mocks.consumeState.mockReturnValue(true);
    mocks.exchange.mockResolvedValue("server-only-oauth-token");
    mocks.identity.mockResolvedValue({
      id: "987654321",
      guilds: [{ id: "123456789", name: "Eligible guild" }],
    });
    mocks.listGuilds.mockResolvedValue([{ id: "123456789", name: "Eligible guild", access: "owner" }]);
    mocks.createSession.mockResolvedValue({
      token: "opaque-session-token",
      session: { userId: "987654321", csrfToken: "csrf", expiresAt: new Date("2030-01-01T00:00:00.000Z") },
    });
    mocks.beginVerification.mockReturnValue("https://discord.com/oauth2/authorize?state=verification-state");
    mocks.verificationWebsiteUrl.mockImplementation((guildId: string) => `https://codelinked.app/verificare?guildId=${encodeURIComponent(guildId)}`);
    mocks.createTicket.mockResolvedValue("a".repeat(43));
    mocks.consumeTicket.mockResolvedValue({ guildId: "123456789", userId: "987654321" });
    mocks.loadVerificationConfig.mockResolvedValue({ enabled: true, roleId: "555555555" });
    mocks.snapshot.mockResolvedValue({
      guild: { id: "123456789", name: "Eligible guild", ownerId: "111111111" },
      member: { id: "987654321", roleIds: [] },
      roles: [],
    });
    mocks.client.mockReturnValue({});
    mocks.verifyMember.mockResolvedValue("verified");
  });

  it("exposes only the public OAuth configuration", async () => {
    const response = await fetch(`${base}/auth-config`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      discordOAuthConfigured: true,
      authorizationUrl: "/api/moderation/oauth/discord",
      botInviteUrl: "https://discord.com/oauth2/authorize?client_id=123456789&scope=bot+applications.commands&permissions=268528688",
      bot: null,
    });
    expect(mocks.invite).toHaveBeenCalledWith();
  });

  it("does not offer a dead invitation when the application ID is unavailable", async () => {
    mocks.invite.mockReturnValue(null);
    const response = await fetch(`${base}/auth-config`);
    const body = await response.json() as { botInviteUrl: string | null };
    expect(body.botInviteUrl).toBeNull();
  });

  it("redirects a cancelled callback without exchanging a code", async () => {
    mocks.identity.mockReset();
    const response = await fetch(`${base}/oauth/discord/callback?state=valid&error=access_denied`, {
      headers: { cookie: "moderation_oauth_state=valid" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/moderare?auth_error=cancelled");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("redirects a state mismatch before any OAuth token request", async () => {
    mocks.consumeRequest.mockReturnValue(null);
    mocks.consumeState.mockReturnValue(false);
    const response = await fetch(`${base}/oauth/discord/callback?state=attacker&code=one-time-code`, {
      redirect: "manual",
    });
    expect(response.headers.get("location")).toBe("/moderare?auth_error=state_mismatch");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("returns a safe error for token exchange failures", async () => {
    mocks.exchange.mockRejectedValue(new Error("token body must not reach the client"));
    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });
    expect(response.headers.get("location")).toBe("/moderare?auth_error=oauth_failed");
    expect((await response.text())).not.toContain("one-time-code");
  });

  it("issues a one-time slider ticket and returns to the public verification page", async () => {
    mocks.consumeRequest.mockReturnValue({ purpose: "verification", guildId: "123456789", expiresAt: Date.now() + 60_000 });

    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://codelinked.app/verificare?guildId=123456789#ticket=${"a".repeat(43)}`);
    expect(mocks.createTicket).toHaveBeenCalledWith("123456789", "987654321");
    expect(mocks.verifyMember).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie") ?? "").not.toContain("verification_identity=");
  });

  it("redirects a cancelled member verification to the verification page without exchanging a code", async () => {
    mocks.consumeRequest.mockReturnValue({ purpose: "verification", guildId: "123456789", expiresAt: Date.now() + 60_000 });

    const response = await fetch(`${base}/oauth/discord/callback?state=valid&error=access_denied`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://codelinked.app/verificare?guildId=123456789&verification_error=cancelled");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("keeps member verification OAuth failures on the verification page without leaking the token", async () => {
    mocks.consumeRequest.mockReturnValue({ purpose: "verification", guildId: "123456789", expiresAt: Date.now() + 60_000 });
    mocks.exchange.mockRejectedValue(new Error("server-only-oauth-token must not reach the client"));

    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://codelinked.app/verificare?guildId=123456789&verification_error=oauth_failed");
    const body = await response.text();
    expect(body).not.toContain("server-only-oauth-token");
    expect(body).not.toContain("one-time-code");
  });

  it("sets the verification identity cookie on the public site after the slider is completed", async () => {
    const client = { isReady: () => true };
    mocks.client.mockReturnValue(client);

    const response = await fetch(`${base}/verification/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: "a".repeat(43), sliderCompleted: true }),
    });

    expect(response.status).toBe(200);
    expect(mocks.consumeTicket).toHaveBeenCalledWith("a".repeat(43));
    expect(mocks.verifyMember).toHaveBeenCalledWith(client, "123456789", "987654321");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("verification_identity=signed-verification-token");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("rejects a login with no bot-eligible guild", async () => {
    mocks.listGuilds.mockResolvedValue([]);
    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });
    expect(response.headers.get("location")).toBe("/moderare?auth_error=no_eligible_guild");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates the session from the server OAuth identity, never a callback identity", async () => {
    const response = await fetch(
      `${base}/oauth/discord/callback?state=valid&code=one-time-code&user_id=attacker`,
      { headers: { cookie: "moderation_session=old-session" }, redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/moderare");
    expect(mocks.createSession).toHaveBeenCalledWith("987654321");
    expect(mocks.createSession).not.toHaveBeenCalledWith("attacker");
    expect(mocks.revoke).toHaveBeenCalled();
    expect(mocks.setCookie).toHaveBeenCalledWith(
      expect.anything(),
      "opaque-session-token",
      expect.any(Date),
    );
  });

  it("disables the legacy code login endpoint", async () => {
    const response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCDEF" }),
    });
    expect(response.status).toBe(410);
  });

  describe("ban appeals", () => {
    const GUILD = "123456789012345678";
    const identity = { userId: "234567890123456789", name: "Ana", username: "ana", avatar: null };

    async function signedIn() {
      const { createAppealToken } = await import("../appeal-auth");
      return `regat_appeal=${encodeURIComponent(createAppealToken(identity))}`;
    }

    beforeEach(() => {
      mocks.appealUrl.mockReturnValue(`/contestatie?guildId=${GUILD}`);
      mocks.getConfig.mockResolvedValue({ config: { appeals: { enabled: true } } });
    });

    it("sends the person to Discord with the appeal purpose", async () => {
      mocks.beginAppeal.mockReturnValue("https://discord.com/oauth2/authorize?x=1");
      const response = await fetch(`${base}/oauth/discord?appeal=1&guildId=${GUILD}`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(mocks.beginAppeal).toHaveBeenCalledWith(expect.anything(), GUILD);
    });

    it("signs in with a cookie of its own and goes back to the appeal page, without panel access", async () => {
      mocks.consumeRequest.mockReturnValue({ purpose: "appeal", guildId: GUILD, expiresAt: Date.now() + 60_000 });
      mocks.appealUser.mockResolvedValue({ id: identity.userId, name: "Ana", username: "ana", avatar: null });
      const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`/contestatie?guildId=${GUILD}`);
      const cookie = response.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("regat_appeal=");
      expect(cookie.toLowerCase()).toContain("httponly");
      expect(cookie).toContain("Path=/api/moderation/appeals");
      expect(mocks.createSession).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain("server-only-oauth-token");
    });

    it("comes back with a message when the person cancels at Discord", async () => {
      mocks.consumeRequest.mockReturnValue({ purpose: "appeal", guildId: GUILD, expiresAt: Date.now() + 60_000 });
      const response = await fetch(`${base}/oauth/discord/callback?state=valid&error=access_denied`, { redirect: "manual" });
      expect(response.headers.get("location")).toBe(`/contestatie?guildId=${GUILD}&appeal_error=cancelled`);
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("tells a visitor who is not signed in only whether appeals are on", async () => {
      const response = await fetch(`${base}/appeals/session?guildId=${GUILD}`);
      expect(await response.json()).toMatchObject({ authenticated: false, enabled: true });
      expect(mocks.appealStatus).not.toHaveBeenCalled();
    });

    it("shows the signed-in person their own ban and appeal state", async () => {
      mocks.appealStatus.mockResolvedValue({ banned: true });
      const response = await fetch(`${base}/appeals/session?guildId=${GUILD}`, { headers: { cookie: await signedIn() } });
      expect(await response.json()).toMatchObject({ authenticated: true, user: { id: identity.userId }, status: { banned: true } });
      expect(mocks.appealStatus).toHaveBeenCalledWith(expect.anything(), GUILD, identity.userId);
    });

    it("takes an appeal only from a signed-in person, as that person", async () => {
      const post = (headers: Record<string, string>) => fetch(`${base}/appeals`, {
        method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ guildId: GUILD, text: "x".repeat(40), userId: "999999999999999999" }),
      });
      expect((await post({})).status).toBe(401);
      mocks.submitAppeal.mockResolvedValue({ appeal: { status: "pending" } });
      const ok = await post({ cookie: await signedIn() });
      expect(ok.status).toBe(200);
      expect(mocks.submitAppeal).toHaveBeenCalledWith(expect.anything(), GUILD, expect.objectContaining({ userId: identity.userId }), "x".repeat(40));
    });

    it("answers a clarification only when signed in, and signs out by clearing the cookie", async () => {
      const answer = (headers: Record<string, string>) => fetch(`${base}/appeals/answer`, {
        method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ clarificationId: "q1", text: "răspuns" }),
      });
      expect((await answer({})).status).toBe(401);
      mocks.answerClarification.mockResolvedValue({ appeal: null });
      expect((await answer({ cookie: await signedIn() })).status).toBe(200);
      const out = await fetch(`${base}/appeals/logout`, { method: "POST" });
      expect(out.headers.get("set-cookie") ?? "").toContain("regat_appeal=;");
    });
  });
});