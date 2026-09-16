import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), access: vi.fn(), csrf: vi.fn(), client: vi.fn(),
  getConfig: vi.fn(), putConfig: vi.fn(), listCases: vi.fn(),
  listAudit: vi.fn(), listLogs: vi.fn(), beginAction: vi.fn(), getAction: vi.fn(),
  completeAction: vi.fn(), writeAudit: vi.fn(), execute: vi.fn(),
}));

vi.mock("../auth", () => ({
  ModerationAuthError: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
  requireSession: mocks.session,
  assertGuildAccess: mocks.access,
  assertCsrf: mocks.csrf,
  getModerationClient: mocks.client,
  assertTrustedOrigin: vi.fn(),
  assertLoginRateLimit: vi.fn(),
  assertMutationRateLimit: vi.fn(),
  clearSessionCookie: vi.fn(),
  listAccessibleGuilds: vi.fn(),
  revokeRequestSessionIfPresent: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("../store", () => ({
  moderationStore: {
    getConfig: mocks.getConfig, putConfig: mocks.putConfig,
    listCases: mocks.listCases, listAudit: mocks.listAudit,
    listModerationLogs: mocks.listLogs, pruneCases: vi.fn(),
    beginAction: mocks.beginAction, getAction: mocks.getAction, completeAction: mocks.completeAction,
    writeAudit: mocks.writeAudit,
  },
}));
vi.mock("../../bot/moderation/engine", () => ({ executeModerationAction: mocks.execute }));

import router from "../router";
import { ModerationAuthError } from "../auth";
import { defaultModerationConfig } from "../config";

describe("moderation HTTP authorization and mutation boundaries", () => {
  let server: Server;
  let base: string;
  const guildId = "123456789";
  const actorId = "987654321";
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/moderation", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    base = `http://127.0.0.1:${address.port}/moderation/guilds/${guildId}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: actorId, csrfToken: "csrf" });
    mocks.access.mockResolvedValue("owner");
    mocks.getConfig.mockResolvedValue({ config: structuredClone(defaultModerationConfig), version: 3 });
    mocks.putConfig.mockResolvedValue({ config: structuredClone(defaultModerationConfig), version: 4 });
    mocks.client.mockReturnValue({
      options: { intents: { has: () => true } },
      guilds: { fetch: vi.fn().mockResolvedValue({
        roles: { fetch: vi.fn().mockResolvedValue(new Map()) },
        channels: { fetch: vi.fn().mockResolvedValue(new Map()) },
      }) },
    });
    mocks.listCases.mockResolvedValue([]);
    mocks.listAudit.mockResolvedValue([]);
    mocks.listLogs.mockResolvedValue([]);
    mocks.beginAction.mockResolvedValue({ created: true, action: { id: "ledger", status: "pending" } });
    mocks.getAction.mockResolvedValue(null);
    mocks.execute.mockResolvedValue({ actionId: "action", summary: "applied" });
  });
  const post = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });

  it("rejects unauthenticated configuration reads before reading stored data", async () => {
    mocks.session.mockRejectedValue(new ModerationAuthError(401, "Authentication required"));
    expect((await fetch(`${base}/config`)).status).toBe(401);
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("checks owner settings access with the URL guild and server session identity", async () => {
    mocks.access.mockRejectedValue(new ModerationAuthError(403, "Owner only"));
    expect((await fetch(`${base}/config`)).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith(guildId, actorId, "config");
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("checks CSRF before creating any action", async () => {
    mocks.csrf.mockImplementation(() => { throw new ModerationAuthError(403, "CSRF required"); });
    expect((await fetch(`${base}/actions`, post({ type: "warn", targetId: "555555555" }))).status).toBe(403);
    expect(mocks.beginAction).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires a configuration revision and passes it to the compare-and-swap write", async () => {
    const init = { ...post(defaultModerationConfig), method: "PUT" };
    expect((await fetch(`${base}/config`, init)).status).toBe(428);
    expect(mocks.putConfig).not.toHaveBeenCalled();
    const response = await fetch(`${base}/config`, {
      ...init, headers: { ...init.headers, "if-match": '"3"' },
    });
    expect(response.status).toBe(200);
    expect(mocks.putConfig).toHaveBeenCalledWith(guildId, expect.any(Object), actorId, 3);
    expect(response.headers.get("etag")).toBe('"4"');
  });

  it("does not accept configured roles belonging to another server", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.permissions.staffRoleIds = ["444444444"];
    const response = await fetch(`${base}/config`, { ...post(config, { "if-match": '"3"' }), method: "PUT" });
    expect(response.status).toBe(400);
    expect(mocks.putConfig).not.toHaveBeenCalled();
  });

  it("keeps ordinary logs separate from owner-only audit", async () => {
    await fetch(`${base}/logs`);
    expect(mocks.access).toHaveBeenLastCalledWith(guildId, actorId, "operations");
    expect(mocks.listLogs).toHaveBeenCalledWith(guildId, 50, 0);
    await fetch(`${base}/logs/audit`);
    expect(mocks.access).toHaveBeenLastCalledWith(guildId, actorId, "audit");
    expect(mocks.listAudit).toHaveBeenCalledWith(guildId, 50, 0);
  });

  it("rejects unbounded pagination before running the cases query", async () => {
    expect((await fetch(`${base}/cases?limit=100000`)).status).toBe(400);
    expect(mocks.listCases).not.toHaveBeenCalled();
  });

  it("requires an idempotency key for destructive web actions", async () => {
    expect((await fetch(`${base}/actions`, post({ type: "ban", targetId: "555555555" }))).status).toBe(400);
    expect(mocks.beginAction).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("never trusts a client-supplied actor, guild, or automatic-enforcement source", async () => {
    const response = await fetch(`${base}/actions`, post({
      type: "warn", targetId: "555555555", actorId: "111111111",
      guildId: "222222222", source: "automod",
    }, { "idempotency-key": "test-action-unique-01" }));
    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ guildId, actorId, type: "warn" }));
    const input = mocks.execute.mock.calls[0]?.[0];
    expect(input.source).not.toBe("automod");
  });

  it("returns a completed action without repeating its Discord side effect", async () => {
    mocks.getAction.mockResolvedValue({
      id: "ledger", status: "applied", result: { summary: "Already applied" },
    });
    const response = await fetch(`${base}/actions`, post({ type: "warn", targetId: "555555555" }, {
      "idempotency-key": "test-action-unique-02",
    }));
    expect(response.status).toBe(200);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not repeat a pending or uncertain action", async () => {
    mocks.getAction.mockResolvedValue({ id: "ledger", status: "pending" });
    const response = await fetch(`${base}/actions`, post({ type: "warn", targetId: "555555555" }, {
      "idempotency-key": "test-action-unique-03",
    }));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([0, 600, 21600])("passes slowmode %i seconds unchanged, including disabling it", async (amount) => {
    const response = await fetch(`${base}/actions`, post({
      type: "slowmode", channelId: "555555555", amount,
    }, { "idempotency-key": `test-slowmode-${amount}-unique` }));
    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      guildId, actorId, type: "slowmode", channelId: "555555555", amount,
    }));
  });

  it.each([
    { type: "purge", channelId: "555555555", amount: 0 },
    { type: "purge", channelId: "555555555", amount: 101 },
    { type: "purge", amount: 10 },
    { type: "slowmode", channelId: "555555555" },
    { type: "slowmode", channelId: "555555555", amount: 21601 },
    { type: "lock" },
    { type: "unlock" },
    { type: "nick", targetId: "555555555" },
    { type: "role", targetId: "555555555" },
  ])("rejects incomplete command $type before calling Discord", async (payload) => {
    const response = await fetch(`${base}/actions`, post(payload, {
      "idempotency-key": "test-missing-argument-unique",
    }));
    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});