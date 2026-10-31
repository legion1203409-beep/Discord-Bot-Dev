import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  recordBanFingerprint: vi.fn(), removeBanFingerprint: vi.fn(), listRecentBanFingerprints: vi.fn(), writeAudit: vi.fn(),
}));
vi.mock("../../../moderation/store", () => ({ moderationStore: store }));

import { attachBanEvasion, evasionAlert, findEvasionMatches, handleBanEvasionButton, namesLookAlike, normalizeName } from "../ban-evasion";

const DAY = 86_400_000;
const banned = (over: Record<string, unknown> = {}) => ({
  guildId: "1", userId: "200000000000000001", username: "dark_lord99", globalName: "Dark Lord", avatarHash: "abc123",
  accountCreatedAt: new Date(Date.now() - 400 * DAY), bannedAt: new Date(Date.now() - 2 * DAY), ...over,
});
const joining = (over: Record<string, unknown> = {}) => ({
  id: "300000000000000001", username: "someone", globalName: null, avatarHash: null, createdAt: new Date(Date.now() - DAY), ...over,
});
const both = { matchName: true, matchAvatar: true };

describe("look-alike names", () => {
  it("ignores case, accents, digits used as letters, dots and repeated letters", () => {
    expect(normalizeName("D4rk_L0rd.99")).toBe("darklord");
    expect(normalizeName("Ștefan")).toBe("stefan");
    expect(namesLookAlike("dark_lord99", "darklord_2")).toBe(true);
    expect(namesLookAlike("dark_lord99", "d4rk.l0rd")).toBe(true);
    expect(namesLookAlike("dark_lord99", "darklorddd")).toBe(true);
    expect(namesLookAlike("xdarklordx", "darklord")).toBe(true);
  });
  it("does not match short or plainly different names", () => {
    expect(namesLookAlike("ana", "ana")).toBe(false);
    expect(namesLookAlike("dark_lord", "light_lady")).toBe(false);
    expect(namesLookAlike("andrei", "andreea_m")).toBe(false);
    expect(namesLookAlike(null, "darklord")).toBe(false);
  });
});

describe("matching a joining account against recent bans", () => {
  it("flags the same avatar or a look-alike name, and says when the account came after the ban", () => {
    const [byAvatar] = findEvasionMatches(joining({ avatarHash: "abc123" }), [banned()], both);
    expect(byAvatar!.reasons).toEqual(["Are exact aceeași poză de profil", "Contul a fost creat după ban"]);
    const [byName] = findEvasionMatches(joining({ username: "d4rk.lord" }), [banned()], both);
    expect(byName!.reasons[0]).toContain("Nume asemănător");
  });
  it("respects the switches, skips the same account and orders the best match first", () => {
    expect(findEvasionMatches(joining({ avatarHash: "abc123" }), [banned()], { matchName: true, matchAvatar: false })).toEqual([]);
    expect(findEvasionMatches(joining({ username: "darklord" }), [banned()], { matchName: false, matchAvatar: true })).toEqual([]);
    expect(findEvasionMatches(joining({ id: "200000000000000001", avatarHash: "abc123" }), [banned()], both)).toEqual([]);
    const weak = banned({ userId: "200000000000000002", username: "darklord_old", avatarHash: null });
    const strong = banned({ userId: "200000000000000003", username: "darklord_x", avatarHash: "zzz" });
    const matches = findEvasionMatches(joining({ username: "darklord", avatarHash: "zzz" }), [weak, strong], both);
    expect(matches.map((match) => match.fingerprint.userId)).toEqual(["200000000000000003", "200000000000000002"]);
  });
  it("writes an alert with both accounts, the reasons and the two buttons", () => {
    const account = joining({ username: "d4rk.lord" });
    const alert = evasionAlert(account, findEvasionMatches(account, [banned()], both));
    expect(alert.embeds[0]!.data.description).toContain("300000000000000001");
    expect(JSON.stringify(alert.embeds[0]!.data.fields)).toContain("200000000000000001");
    expect((alert.components[0] as any).components.map((button: any) => button.data.custom_id ?? button.data.customId))
      .toEqual(["evasion_ban_300000000000000001_200000000000000001", "evasion_dismiss_300000000000000001"]);
  });
});

describe("the bot's events", () => {
  const handlers = new Map<string, (value: any) => void>();
  const client = { on: (event: string, handler: any) => handlers.set(event, handler) } as never;
  const execute = vi.fn();
  const config = (over: Record<string, unknown> = {}) => ({ embeds: {}, banEvasion: { enabled: true, alertChannelId: "400000000000000001", watchDays: 30, maxAccountAgeDays: 30, matchName: true, matchAvatar: true, ...over } });
  const getConfig = vi.fn();
  attachBanEvasion(client, { getConfig, executeModerationAction: execute });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  function member(over: Record<string, unknown> = {}) {
    const send = vi.fn(async () => ({}));
    return {
      send,
      member: {
        id: "300000000000000001",
        user: { bot: false, username: "d4rk.lord", globalName: null, avatar: null, createdAt: new Date(Date.now() - DAY), ...over },
        guild: { id: "1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    store.recordBanFingerprint.mockResolvedValue(undefined);
    store.removeBanFingerprint.mockResolvedValue(undefined);
    store.writeAudit.mockResolvedValue(undefined);
    store.listRecentBanFingerprints.mockResolvedValue([banned()]);
    getConfig.mockResolvedValue(config());
  });

  it("remembers a banned account and forgets it on unban", async () => {
    const user = { id: "200000000000000001", username: "dark_lord99", globalName: "Dark Lord", avatar: "abc123", createdAt: new Date() };
    handlers.get("guildBanAdd")?.({ guild: { id: "1" }, user }) ?? handlers.get("GuildBanAdd")?.({ guild: { id: "1" }, user });
    await flush();
    expect(store.recordBanFingerprint).toHaveBeenCalledWith(expect.objectContaining({ guildId: "1", userId: user.id, username: "dark_lord99", avatarHash: "abc123" }));
    (handlers.get("guildBanRemove") ?? handlers.get("GuildBanRemove"))!({ guild: { id: "1" }, user });
    await flush();
    expect(store.removeBanFingerprint).toHaveBeenCalledWith("1", user.id);
  });

  it("alerts staff about a young look-alike account and audits it", async () => {
    const { member: joined, send } = member();
    (handlers.get("guildMemberAdd") ?? handlers.get("GuildMemberAdd"))!(joined);
    await flush(); await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ban_evasion.suspected", targetId: "300000000000000001" }));
  });

  it("stays quiet when off, without a channel, for old accounts and for no match", async () => {
    const join = async (over: Record<string, unknown>, settings: Record<string, unknown> = {}) => {
      getConfig.mockResolvedValue(config(settings));
      const { member: joined, send } = member(over);
      (handlers.get("guildMemberAdd") ?? handlers.get("GuildMemberAdd"))!(joined);
      await flush(); await flush();
      return send;
    };
    expect(await join({}, { enabled: false })).not.toHaveBeenCalled();
    expect(await join({}, { alertChannelId: null })).not.toHaveBeenCalled();
    expect(await join({ createdAt: new Date(Date.now() - 90 * DAY) })).not.toHaveBeenCalled();
    expect(await join({ username: "complet_altcineva" })).not.toHaveBeenCalled();
  });
});

describe("the alert's buttons", () => {
  const interaction = (customId: string, canBan = true) => ({
    customId, guildId: "1", user: { id: "500000000000000001" },
    memberPermissions: { has: () => canBan },
    message: { embeds: [], edit: vi.fn(async () => ({})) },
    reply: vi.fn(), deferReply: vi.fn(), deferUpdate: vi.fn(), editReply: vi.fn(),
  });
  it("needs Ban Members", async () => {
    const press = interaction("evasion_dismiss_300000000000000001", false);
    expect(await handleBanEvasionButton(press as never)).toBe(true);
    expect(press.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Ban Members") }));
  });
  it("bans through the normal ban, as the staff member", async () => {
    const execute = vi.fn(async () => ({}));
    attachBanEvasion({ on: () => undefined } as never, { getConfig: vi.fn(), executeModerationAction: execute });
    const press = interaction("evasion_ban_300000000000000001_200000000000000001");
    await handleBanEvasionButton(press as never);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actorId: "500000000000000001", type: "ban", targetId: "300000000000000001", source: "manual" }));
    expect(press.message.edit).toHaveBeenCalled();
  });
  it("closes the alert on „Nu e el” and ignores other buttons", async () => {
    const press = interaction("evasion_dismiss_300000000000000001");
    await handleBanEvasionButton(press as never);
    expect(press.message.edit).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
    expect(await handleBanEvasionButton(interaction("ticket_x") as never)).toBe(false);
  });
});
