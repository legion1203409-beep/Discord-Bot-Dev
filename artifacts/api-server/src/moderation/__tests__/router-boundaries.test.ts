import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), access: vi.fn(), csrf: vi.fn(), client: vi.fn(),
  getConfig: vi.fn(), putConfig: vi.fn(), listCases: vi.fn(),
  listAudit: vi.fn(), listLogs: vi.fn(), beginAction: vi.fn(), getAction: vi.fn(),
  completeAction: vi.fn(), writeAudit: vi.fn(), execute: vi.fn(),
  loadChannelConfig: vi.fn(), saveChannelConfig: vi.fn(),
  loadAllianceRecruitmentText: vi.fn(), saveAllianceRecruitmentText: vi.fn(),
  loadTicketConfig: vi.fn(), saveTicketConfig: vi.fn(),
  initGameplayConfig: vi.fn(), getGameplayConfig: vi.fn(), saveGuildGameplayConfig: vi.fn(),
  initChannelConfig: vi.fn(),
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
vi.mock("../../bot/db", () => ({
  loadChannelConfig: mocks.loadChannelConfig,
  saveChannelConfig: mocks.saveChannelConfig,
  loadAllianceRecruitmentText: mocks.loadAllianceRecruitmentText,
  saveAllianceRecruitmentText: mocks.saveAllianceRecruitmentText,
  loadTicketConfig: mocks.loadTicketConfig,
  saveTicketConfig: mocks.saveTicketConfig,
}));
vi.mock("../../bot/gameplay-store", () => ({
  initGameplayConfig: mocks.initGameplayConfig,
  getGameplayConfig: mocks.getGameplayConfig,
  saveGuildGameplayConfig: mocks.saveGuildGameplayConfig,
}));
vi.mock("../../bot/channel-config", () => ({ initChannelConfig: mocks.initChannelConfig }));

import router from "../router";
import { ModerationAuthError } from "../auth";
import { defaultModerationConfig } from "../config";
import { DEFAULT_GAMEPLAY_CONFIG } from "../../bot/gameplay-config";
import { DEFAULT_TICKET_CONFIG } from "../../bot/ticket-config";

type BotControlResponse = {
  tickets: {
    staffReviewRoleId: string;
    alliancePublicChannelId: string;
    flows: {
      staff: { completionAction: string; title: string; questions: Array<{ key: string; label: string }> };
      partnership: { completionAction: string; staffNotificationMessage: string; questions: Array<{ key: string; label: string }> };
      help_report: { completionAction: string; questions: Array<{ key: string; label: string }> };
    };
  };
};

describe("moderation HTTP authorization and mutation boundaries", () => {
  let server: Server;
  let base: string;
  const guildId = "123456789";
  const actorId = "987654321";
  let persistedTicketConfig = structuredClone(DEFAULT_TICKET_CONFIG);
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
    persistedTicketConfig = structuredClone(DEFAULT_TICKET_CONFIG);
    mocks.loadChannelConfig.mockResolvedValue({ main: "111111111" });
    mocks.saveChannelConfig.mockResolvedValue(undefined);
    mocks.loadAllianceRecruitmentText.mockResolvedValue("Text salvat");
    mocks.saveAllianceRecruitmentText.mockResolvedValue(undefined);
    mocks.loadTicketConfig.mockImplementation(async () => structuredClone(persistedTicketConfig));
    mocks.saveTicketConfig.mockImplementation(async (_guildId, config) => {
      persistedTicketConfig = structuredClone(config);
    });
    mocks.initGameplayConfig.mockResolvedValue(undefined);
    mocks.getGameplayConfig.mockReturnValue(structuredClone(DEFAULT_GAMEPLAY_CONFIG));
    mocks.saveGuildGameplayConfig.mockResolvedValue(structuredClone(DEFAULT_GAMEPLAY_CONFIG));
    mocks.initChannelConfig.mockResolvedValue(undefined);
  });
  const post = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });

  const botControlPayload = () => {
    const flow = (name: string, action: "lock" | "notify_staff" | "keep_open") => ({
      mode: "custom" as const,
      title: `${name} title`,
      startButtonLabel: `${name} start`,
      panelDescription: `${name} panel`,
      requirementsText: `${name} requirements`,
      completionMessage: `${name} completed`,
      staffNotificationMessage: `${name} staff`,
      completionAction: action,
      questions: [
        {
          key: `${name.toLowerCase()}_first`,
          label: `${name} first`,
          description: `${name} first question`,
          placeholder: "First answer",
          multiline: false,
          required: true,
        },
        {
          key: `${name.toLowerCase()}_second`,
          label: `${name} second`,
          description: `${name} second question`,
          placeholder: "Second answer",
          multiline: true,
          required: false,
        },
      ],
    });
    return {
      channels: { main: "111111111" },
      allianceRecruitmentText: "Mesajul alianței",
      tickets: {
        categories: {
          staff: "222222222",
          partnership: "333333333",
          help_report: "444444444",
        },
        staffReviewRoleId: "555555555",
        alliancePublicChannelId: "666666666",
        allianceOwnerGuildId: guildId,
        incompleteTimeoutMinutes: 60,
        firstWarningMinutes: 20,
        secondWarningMinutes: 50,
        flows: {
          staff: flow("Staff", "notify_staff"),
          partnership: flow("Partnership", "keep_open"),
          help_report: flow("Help", "lock"),
        },
      },
      gameplayConfig: structuredClone(DEFAULT_GAMEPLAY_CONFIG),
    };
  };

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

  it("persists all custom ticket flows and returns them unchanged after a later GET", async () => {
    const payload = botControlPayload();
    const putResponse = await fetch(`${base}/bot-control`, {
      ...post(payload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });

    expect(putResponse.status).toBe(200);
    expect(mocks.saveTicketConfig).toHaveBeenCalledWith(guildId, expect.objectContaining({
      staffReviewRoleId: "555555555",
    }));
    expect(mocks.saveTicketConfig.mock.calls[0]?.[1].flows).toEqual(
      expect.objectContaining({
        staff: expect.objectContaining({ mode: "custom" }),
        partnership: expect.objectContaining({ mode: "custom" }),
        help_report: expect.objectContaining({ mode: "custom" }),
      }),
    );

    const getResponse = await fetch(`${base}/bot-control`);
    expect(getResponse.status).toBe(200);
    const result = await getResponse.json() as BotControlResponse;
    expect(result.tickets.staffReviewRoleId).toBe("555555555");
    expect(result.tickets.alliancePublicChannelId).toBe("666666666");
    expect(result.tickets.flows.staff.completionAction).toBe("notify_staff");
    expect(result.tickets.flows.partnership.completionAction).toBe("keep_open");
    expect(result.tickets.flows.help_report.completionAction).toBe("lock");
    expect(result.tickets.flows.staff.questions.map((question: { key: string }) => question.key))
      .toEqual(["staff_first", "staff_second"]);
    expect(result.tickets.flows.partnership.questions.map((question: { key: string }) => question.key))
      .toEqual(["partnership_first", "partnership_second"]);
    expect(result.tickets.flows.help_report.questions.map((question: { key: string }) => question.key))
      .toEqual(["help_first", "help_second"]);
    expect(result.tickets.flows.staff.title).toBe("Staff title");
    expect(result.tickets.flows.partnership.staffNotificationMessage).toBe("Partnership staff");
  });

  it("rejects an invalid custom ticket payload before changing the existing configuration", async () => {
    const payload = botControlPayload();
    const initialPut = await fetch(`${base}/bot-control`, {
      ...post(payload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });
    expect(initialPut.status).toBe(200);
    mocks.saveTicketConfig.mockClear();
    mocks.saveChannelConfig.mockClear();
    mocks.saveAllianceRecruitmentText.mockClear();
    mocks.saveGuildGameplayConfig.mockClear();

    const invalidPayload = structuredClone(payload);
    invalidPayload.tickets.flows.staff.questions[0].label = "";
    const invalidPut = await fetch(`${base}/bot-control`, {
      ...post(invalidPayload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });

    expect(invalidPut.status).toBe(400);
    expect(mocks.saveTicketConfig).not.toHaveBeenCalled();
    expect(mocks.saveChannelConfig).not.toHaveBeenCalled();
    expect(mocks.saveAllianceRecruitmentText).not.toHaveBeenCalled();
    expect(mocks.saveGuildGameplayConfig).not.toHaveBeenCalled();

    const getResponse = await fetch(`${base}/bot-control`);
    const result = await getResponse.json() as BotControlResponse;
    expect(result.tickets.flows.staff.questions[0].label).toBe("Staff first");
    expect(result.tickets.flows.partnership.questions[1].key).toBe("partnership_second");
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