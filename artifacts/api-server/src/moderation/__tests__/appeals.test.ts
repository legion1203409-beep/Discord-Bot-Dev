import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  getConfig: vi.fn(), getWebAppeal: vi.fn(), decideAppeal: vi.fn(), updateCase: vi.fn(), writeAudit: vi.fn(), getCase: vi.fn(),
  listCases: vi.fn(), getLatestAppeal: vi.fn(), createWebAppeal: vi.fn(), createCase: vi.fn(), setAppealStaffMessage: vi.fn(),
  requestAppealClarification: vi.fn(), respondAppealClarification: vi.fn(), addCaseNote: vi.fn(),
}));
vi.mock("../store", () => ({ moderationStore: store, webAppealChannelId: (id: string) => `web:${id}` }));

import { acceptedAppealMessage, answerClarification, appealWindow, askWebAppeal, cleanAppealText, decideWebAppeal, submitAppeal, AppealError } from "../appeals";
import { appealIdentityFromRequest, createAppealToken, parseAppealToken } from "../appeal-auth";

const DAY = 86_400_000;
const GUILD = "123456789012345678";
const USER = "234567890123456789";
const APPEAL = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-8222-222222222222";

const config = (over: Record<string, unknown> = {}) => ({ appeals: { enabled: true, channelId: "345678901234567890", unbanOnAccept: true, cooldownDays: 30, ...over }, embeds: {} });
const webAppeal = (over: Record<string, unknown> = {}) => ({
  id: APPEAL, guildId: GUILD, caseId: CASE, status: "pending", appellantId: USER, channelId: `web:${APPEAL}`, source: "web", body: "x".repeat(40),
  createdAt: new Date(), decidedAt: null, decidedBy: null, decisionNote: null, clarification: null, staffChannelId: null, staffMessageId: null, ...over,
});

function client(over: { removeError?: unknown; banned?: boolean; dmError?: unknown } = {}) {
  const send = vi.fn(async () => { if (over.dmError) throw over.dmError; return {}; });
  const remove = vi.fn(async () => { if (over.removeError) throw over.removeError; });
  const guild = {
    name: "Regat", iconURL: () => null,
    bans: { remove, fetch: vi.fn(async () => { if (over.banned === false) throw { code: 10026 }; return { reason: "spam" }; }) },
  };
  return {
    remove, send,
    client: {
      isReady: () => true,
      guilds: { cache: new Map([[GUILD, guild]]), fetch: vi.fn() },
      channels: { fetch: vi.fn(async () => null) },
      users: { fetch: vi.fn(async () => ({ id: USER, send })) },
    } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.getConfig.mockResolvedValue({ config: config() });
  store.writeAudit.mockResolvedValue(undefined);
  store.updateCase.mockResolvedValue({});
  store.getCase.mockResolvedValue({ id: CASE, reason: "spam" });
  store.addCaseNote.mockResolvedValue({});
});

describe("when a ban can be appealed", () => {
  it("allows a first appeal and blocks while one waits or after it was accepted", () => {
    expect(appealWindow(null, 30).canAppeal).toBe(true);
    expect(appealWindow({ status: "pending", decidedAt: null }, 30).canAppeal).toBe(false);
    expect(appealWindow({ status: "accepted", decidedAt: new Date() }, 30).canAppeal).toBe(false);
  });
  it("waits the configured days after a rejection", () => {
    const now = Date.now();
    const recent = appealWindow({ status: "rejected", decidedAt: new Date(now - 10 * DAY) }, 30, now);
    expect(recent.canAppeal).toBe(false);
    expect(recent.nextAllowedAt?.getTime()).toBe(now + 20 * DAY);
    expect(appealWindow({ status: "rejected", decidedAt: new Date(now - 31 * DAY) }, 30, now).canAppeal).toBe(true);
    expect(appealWindow({ status: "rejected", decidedAt: new Date(now - 10 * DAY) }, 7, now).canAppeal).toBe(true);
  });
  it("strips control characters and trims the text", () => {
    expect(cleanAppealText("  salut\u0000 lume\u0007  ")).toBe("salut lume");
    expect(cleanAppealText(42)).toBe("");
  });
});

describe("the sign-in cookie of the appeal page", () => {
  const identity = { userId: USER, name: "Ana", username: "ana", avatar: null };
  it("round-trips, expires and rejects tampering", () => {
    const token = createAppealToken(identity, 1_000);
    expect(parseAppealToken(token, 2_000)).toEqual(identity);
    expect(parseAppealToken(token, 1_000 + 3 * 60 * 60 * 1_000)).toBeNull();
    expect(parseAppealToken(`${token}x`, 2_000)).toBeNull();
    expect(parseAppealToken(token.replace(/^./, "A"), 2_000)).toBeNull();
    expect(parseAppealToken(null)).toBeNull();
  });
  it("is read from the cookie header only", () => {
    const token = createAppealToken(identity);
    expect(appealIdentityFromRequest({ headers: { cookie: `a=b; regat_appeal=${encodeURIComponent(token)}` } })?.userId).toBe(USER);
    expect(appealIdentityFromRequest({ headers: { cookie: "regat_verification=x" } })).toBeNull();
    expect(appealIdentityFromRequest({ headers: {} })).toBeNull();
  });
});

describe("submitting an appeal", () => {
  const user = { userId: USER, name: "Ana", username: "ana" };
  it("needs a real text, appeals turned on and a ban", async () => {
    const { client: c } = client();
    await expect(submitAppeal(c, GUILD, user, "prea scurt")).rejects.toMatchObject({ status: 400 });
    store.getConfig.mockResolvedValue({ config: config({ enabled: false }) });
    store.listCases.mockResolvedValue([]);
    await expect(submitAppeal(c, GUILD, user, "x".repeat(40))).rejects.toMatchObject({ status: 403 });
    store.getConfig.mockResolvedValue({ config: config() });
    const { client: unbanned } = client({ banned: false });
    await expect(submitAppeal(unbanned, GUILD, user, "x".repeat(40))).rejects.toMatchObject({ status: 400 });
    expect(store.createWebAppeal).not.toHaveBeenCalled();
  });
  it("is refused during the wait after a rejection", async () => {
    const { client: c } = client();
    store.listCases.mockResolvedValue([{ id: CASE, reason: "spam", createdAt: new Date() }]);
    store.getLatestAppeal.mockResolvedValue(webAppeal({ status: "rejected", decidedAt: new Date(Date.now() - 5 * DAY) }));
    await expect(submitAppeal(c, GUILD, user, "x".repeat(40))).rejects.toMatchObject({ status: 409 });
    expect(store.createWebAppeal).not.toHaveBeenCalled();
  });
  it("saves the appeal on the ban's case when allowed", async () => {
    const { client: c } = client();
    store.listCases.mockResolvedValue([{ id: CASE, reason: "spam", createdAt: new Date() }]);
    store.getLatestAppeal.mockResolvedValue(null);
    store.createWebAppeal.mockResolvedValue(webAppeal());
    const view = await submitAppeal(c, GUILD, user, "  " + "x".repeat(40));
    expect(store.createWebAppeal).toHaveBeenCalledWith({ guildId: GUILD, caseId: CASE, appellantId: USER, body: "x".repeat(40) });
    expect(view.appeal?.status).toBe("pending");
    expect(view.canAppeal).toBe(false);
  });
  it("gives a ban made straight from Discord a case of its own", async () => {
    const { client: c } = client();
    store.listCases.mockResolvedValue([]);
    store.createCase.mockResolvedValue({ id: CASE, reason: "spam", createdAt: new Date() });
    store.createWebAppeal.mockResolvedValue(webAppeal());
    await submitAppeal(c, GUILD, user, "x".repeat(40));
    expect(store.createCase).toHaveBeenCalledWith(expect.objectContaining({ subjectId: USER, actionType: "ban" }));
  });
  it("says so when another appeal won the race", async () => {
    const { client: c } = client();
    store.listCases.mockResolvedValue([{ id: CASE, reason: "spam", createdAt: new Date() }]);
    store.getLatestAppeal.mockResolvedValue(null);
    store.createWebAppeal.mockResolvedValue(null);
    await expect(submitAppeal(c, GUILD, user, "x".repeat(40))).rejects.toBeInstanceOf(AppealError);
  });
});

describe("staff decisions", () => {
  const input = { guildId: GUILD, appealId: APPEAL, actorId: "999999999999999999", actorTag: "mod", note: "ok" };
  it("lifts the ban, notes it, closes the case", async () => {
    const { client: c, remove } = client();
    store.getWebAppeal.mockResolvedValueOnce(webAppeal()).mockResolvedValue(webAppeal({ status: "accepted" }));
    store.decideAppeal.mockResolvedValue({ appellantId: USER, channelId: `web:${APPEAL}` });
    const result = await decideWebAppeal(c, { ...input, decision: "accepted" });
    expect(remove).toHaveBeenCalledWith(USER, expect.stringContaining("mod"));
    expect(result.unbanned).toBe(true);
    expect(store.decideAppeal).toHaveBeenCalledWith(expect.objectContaining({ channelId: `web:${APPEAL}`, decision: "accepted" }));
    expect(store.updateCase).toHaveBeenCalledWith(expect.objectContaining({ caseId: CASE, status: "closed" }));
  });
  it("tells the member in private, with the server's link, and notes whether it arrived", async () => {
    const ok = client();
    store.getWebAppeal.mockResolvedValue(webAppeal());
    store.decideAppeal.mockResolvedValue({ appellantId: USER, channelId: `web:${APPEAL}` });
    expect((await decideWebAppeal(ok.client, { ...input, decision: "accepted", note: "Bine ai revenit" })).notified).toBe(true);
    const payload = (ok.send.mock.calls[0] as unknown as [any])[0];
    expect(payload.embeds[0].data.title).toContain("acceptată");
    expect(payload.embeds[0].data.fields[0].value).toBe("Bine ai revenit");
    expect(payload.components[0].components[0].data).toMatchObject({ label: "Intră în regat", url: "https://discord.gg/regatulcenusii" });
    expect(store.addCaseNote).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("a primit în privat") }));

    const closed = client({ dmError: new Error("Cannot send messages to this user") });
    store.addCaseNote.mockClear();
    expect((await decideWebAppeal(closed.client, { ...input, decision: "accepted" })).notified).toBe(false);
    expect(store.addCaseNote).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("nu a ajuns") }));
  });

  it("writes nothing in private on a rejection", async () => {
    const c = client();
    store.getWebAppeal.mockResolvedValue(webAppeal());
    store.decideAppeal.mockResolvedValue({ appellantId: USER, channelId: `web:${APPEAL}` });
    expect((await decideWebAppeal(c.client, { ...input, decision: "rejected" })).notified).toBe(false);
    expect(c.send).not.toHaveBeenCalled();
  });

  it("leaves out the default note from the private message", () => {
    expect(acceptedAppealMessage("Regat", "Contestație acceptată.").embeds[0]!.data.fields).toBeUndefined();
  });

  it("keeps the appeal open when Discord refuses to lift the ban", async () => {
    const { client: c } = client({ removeError: { code: 50013 } });
    store.getWebAppeal.mockResolvedValue(webAppeal());
    await expect(decideWebAppeal(c, { ...input, decision: "accepted" })).rejects.toMatchObject({ status: 502 });
    expect(store.decideAppeal).not.toHaveBeenCalled();
  });
  it("accepts without touching Discord when unbanning is off or the ban is already gone", async () => {
    store.getWebAppeal.mockResolvedValue(webAppeal());
    store.decideAppeal.mockResolvedValue({ appellantId: USER, channelId: `web:${APPEAL}` });
    store.getConfig.mockResolvedValue({ config: config({ unbanOnAccept: false }) });
    const off = client();
    expect((await decideWebAppeal(off.client, { ...input, decision: "accepted" })).unbanned).toBe(false);
    expect(off.remove).not.toHaveBeenCalled();
    store.getConfig.mockResolvedValue({ config: config() });
    const gone = client({ removeError: { code: 10026 } });
    expect((await decideWebAppeal(gone.client, { ...input, decision: "accepted" })).unbanned).toBe(false);
  });
  it("rejects without lifting anything and refuses a second decision", async () => {
    const { client: c, remove } = client();
    store.getWebAppeal.mockResolvedValue(webAppeal());
    store.decideAppeal.mockResolvedValueOnce({ appellantId: USER, channelId: `web:${APPEAL}` }).mockResolvedValueOnce(null);
    await decideWebAppeal(c, { ...input, decision: "rejected" });
    expect(remove).not.toHaveBeenCalled();
    await expect(decideWebAppeal(c, { ...input, decision: "rejected" })).rejects.toMatchObject({ status: 409 });
    store.getWebAppeal.mockResolvedValue(webAppeal({ status: "rejected" }));
    await expect(decideWebAppeal(c, { ...input, decision: "accepted" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("clarifications", () => {
  it("asks once, and the appellant answers on the site", async () => {
    const { client: c } = client();
    store.getWebAppeal.mockResolvedValue(webAppeal());
    store.requestAppealClarification.mockResolvedValue({ appellantId: USER });
    await askWebAppeal(c, { guildId: GUILD, appealId: APPEAL, actorId: "9".repeat(18), question: "De ce?", clarificationId: "q1" });
    expect(store.requestAppealClarification).toHaveBeenCalledWith(expect.objectContaining({ channelId: `web:${APPEAL}`, question: "De ce?" }));
    store.getWebAppeal.mockResolvedValue(webAppeal({ clarification: { id: "q1", question: "De ce?" } }));
    await expect(askWebAppeal(c, { guildId: GUILD, appealId: APPEAL, actorId: "9".repeat(18), question: "Încă?", clarificationId: "q2" })).rejects.toMatchObject({ status: 409 });

    store.listCases.mockResolvedValue([{ id: CASE, reason: "spam", createdAt: new Date() }]);
    store.getLatestAppeal.mockResolvedValue(webAppeal({ clarification: { id: "q1", question: "De ce?" } }));
    store.respondAppealClarification.mockResolvedValue({ staffId: "9".repeat(18), question: "De ce?" });
    const view = await answerClarification(c, GUILD, { userId: USER, name: "Ana" }, "q1", "Pentru că da");
    expect(store.respondAppealClarification).toHaveBeenCalledWith(expect.objectContaining({ appellantId: USER, clarificationId: "q1", answer: "Pentru că da" }));
    expect(view.appeal?.question).toBeNull();
    await expect(answerClarification(c, GUILD, { userId: USER, name: "Ana" }, "q9", "alt răspuns")).rejects.toMatchObject({ status: 409 });
  });
});
