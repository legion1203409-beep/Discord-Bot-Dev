import { EventEmitter } from "node:events";
import { ChannelType, Events, type Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { defaultModerationConfig, type ModerationConfig } from "../../../moderation/config";
import { attachModerationEvents, type ModerationEventHelpers } from "../events";

const waitForHandlers = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const roles = {
  some: () => false,
  has: () => false,
  filter: () => ({ map: () => [] }),
};

function guild(id: string) {
  return {
    id,
    channels: { cache: new Map(), fetch: vi.fn(async () => new Map()) },
    members: { fetch: vi.fn() },
    fetchAuditLogs: vi.fn(async () => ({ entries: new Map() })),
  };
}

function member(theGuild: ReturnType<typeof guild>, id: string, createdTimestamp = 0) {
  return {
    id,
    guild: theGuild,
    user: { id, bot: false, createdTimestamp },
    displayAvatarURL: vi.fn((_options?: { size?: number }) =>
      `https://cdn.discordapp.com/avatars/${id}/avatar.webp?size=256`),
    roles: { cache: roles },
    nickname: null,
  };
}

function roleCache(entries: Array<{ id: string; name: string }>) {
  const values = new Map(entries.map((entry) => [entry.id, entry]));
  return {
    some: (predicate: (role: { id: string; name: string }) => boolean) =>
      [...values.values()].some(predicate),
    has: (id: string) => values.has(id),
    get: (id: string) => values.get(id),
    filter: (predicate: (role: { id: string; name: string }) => boolean) => {
      const filtered = [...values.values()].filter(predicate);
      return { map: <T>(mapper: (role: { id: string; name: string }) => T) => filtered.map(mapper) };
    },
  };
}

function message(theGuild: ReturnType<typeof guild>, authorId = "22222") {
  return {
    id: `message-${authorId}`,
    guild: theGuild,
    guildId: theGuild.id,
    channelId: "33333",
    author: { id: authorId, bot: false },
    member: { user: { bot: false }, roles: { cache: roles } },
    content: "changed",
    partial: false,
    delete: vi.fn(async () => undefined),
  };
}

function setup(config: ModerationConfig) {
  const emitter = new EventEmitter();
  const client = Object.assign(emitter, { user: { id: "99999", bot: true } }) as unknown as Client;
  const helpers: ModerationEventHelpers = {
    getConfig: vi.fn(async () => config),
    executeModerationAction: vi.fn(async () => ({})),
    handleMessage: vi.fn(async () => false),
    handleNativeAutoModerationExecution: vi.fn(async () => undefined),
    notify: vi.fn(async () => undefined),
    auditExternal: vi.fn(async () => undefined),
    recordMemberJoin: vi.fn(async () => undefined),
    getMemberJoinAt: vi.fn(async () => null as Date | null),
    clearMemberJoinAt: vi.fn(async () => undefined),
  };
  attachModerationEvents(client, helpers);
  return { client, emitter, helpers };
}

describe("non-message moderation events", () => {
  it("shows role names for member role changes instead of role IDs", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.members = true;
    config.activityLog.categories.roles = true;
    config.activityLog.channelIds.members = "log-members";
    config.activityLog.channelIds.roles = "log-roles";
    const { emitter } = setup(config);
    const targetGuild = guild("10017");
    const send = vi.fn(async (_payload: unknown) => undefined);
    const memberSend = vi.fn(async (_payload: unknown) => undefined);
    targetGuild.channels.cache.set("log-members", {
      guildId: targetGuild.id,
      isTextBased: () => true,
      send: memberSend,
    });
    targetGuild.channels.cache.set("log-roles", {
      guildId: targetGuild.id,
      isTextBased: () => true,
      send,
    });
    const oldMember = {
      ...member(targetGuild, "70017"),
      roles: { cache: roleCache([{ id: "1504480351987433613", name: "Scout" }]) },
    };
    const newMember = {
      ...member(targetGuild, "70017"),
      roles: { cache: roleCache([{ id: "1504480351987433614", name: "LEGION" }]) },
    };

    emitter.emit(Events.GuildMemberUpdate, oldMember, newMember);
    await waitForHandlers();

    expect(send).toHaveBeenCalledTimes(1);
    expect(memberSend).not.toHaveBeenCalled();
    const payload = send.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { title: string; fields: Array<{ name: string; value: string }> } }>;
    };
    const embed = payload.embeds[0]!.toJSON();
    const details = embed.fields.find((field) => field.name === "Detalii")?.value ?? "";
    expect(embed.title).toBe("Rolurile membrului au fost schimbate");
    expect(details).toContain("**Roluri adăugate:** LEGION");
    expect(details).toContain("**Roluri eliminate:** Scout");
    expect(details).not.toContain("1504480351987433613");
    expect(details).not.toContain("1504480351987433614");
  });

  it("shows channel category names and voice channel names in activity details", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.channels = true;
    config.activityLog.categories.voice = true;
    config.activityLog.channelIds.channels = "log-channels";
    config.activityLog.channelIds.voice = "log-voice";
    const { emitter } = setup(config);
    const targetGuild = guild("10018");
    const channelSend = vi.fn(async (_payload: unknown) => undefined);
    const voiceSend = vi.fn(async (_payload: unknown) => undefined);
    targetGuild.channels.cache.set("log-channels", {
      guildId: targetGuild.id,
      isTextBased: () => true,
      send: channelSend,
    });
    targetGuild.channels.cache.set("log-voice", {
      guildId: targetGuild.id,
      isTextBased: () => true,
      send: voiceSend,
    });
    targetGuild.channels.cache.set("category-old", { id: "category-old", name: "Lobby" });
    targetGuild.channels.cache.set("category-new", { id: "category-new", name: "Archive" });
    targetGuild.channels.cache.set("voice-old", { id: "voice-old", name: "Waiting Room" });
    targetGuild.channels.cache.set("voice-new", { id: "voice-new", name: "Raid Room" });
    const beforeChannel = {
      id: "text-target",
      guild: targetGuild,
      name: "general",
      type: ChannelType.GuildText,
      parentId: "category-old",
      topic: null,
      nsfw: false,
      rateLimitPerUser: 0,
      isDMBased: () => false,
    };
    const afterChannel = { ...beforeChannel, parentId: "category-new" };

    emitter.emit(Events.ChannelUpdate, beforeChannel, afterChannel);
    const voiceState = (channelId: string | null) => ({
      id: "70018",
      guild: targetGuild,
      channelId,
      selfMute: false,
      serverMute: false,
      selfDeaf: false,
      serverDeaf: false,
      streaming: false,
      selfVideo: false,
    });
    emitter.emit(Events.VoiceStateUpdate, voiceState("voice-old"), voiceState("voice-new"));
    await waitForHandlers();

    const channelPayload = channelSend.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { fields: Array<{ name: string; value: string }> } }>;
    };
    const channelDetails = channelPayload.embeds[0]!.toJSON().fields.find((field) => field.name === "Detalii")?.value ?? "";
    expect(channelDetails).toContain("**Categorie:** #Lobby → #Archive");
    expect(channelDetails).not.toContain("category-old");
    expect(channelDetails).not.toContain("category-new");

    const voicePayload = voiceSend.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { fields: Array<{ name: string; value: string }> } }>;
    };
    const voiceDetails = voicePayload.embeds[0]!.toJSON().fields.find((field) => field.name === "Detalii")?.value ?? "";
    expect(voiceDetails).toContain("**Canal vocal anterior:** #Waiting Room");
    expect(voiceDetails).toContain("**Canal vocal nou:** #Raid Room");
    expect(voiceDetails).not.toContain("voice-old");
    expect(voiceDetails).not.toContain("voice-new");
  });

  it("routes native AutoMod blocks to the managed-rule handler", async () => {
    const config = structuredClone(defaultModerationConfig);
    const { client, emitter, helpers } = setup(config);
    const targetGuild = guild("10007");
    const execution = { guild: targetGuild, ruleId: "30001" } as never;

    emitter.emit(Events.AutoModerationActionExecution, execution);
    await waitForHandlers();

    expect(helpers.handleNativeAutoModerationExecution).toHaveBeenCalledWith(client, execution);
  });

  it("does not notify or enforce when defaults are disabled", async () => {
    const config = structuredClone(defaultModerationConfig);
    const { client, emitter, helpers } = setup(config);
    const targetGuild = guild("10000");
    const joined = member(targetGuild, "20000", 0);
    const edited = message(targetGuild);

    emitter.emit(Events.GuildMemberAdd, joined);
    emitter.emit(Events.MessageUpdate, { content: "before" }, edited);
    await waitForHandlers();

    expect(helpers.executeModerationAction).not.toHaveBeenCalled();
    expect(helpers.notify).not.toHaveBeenCalled();
    // Re-running content checks is harmless with defaults off, and prevents an
    // edit from bypassing a subsequently enabled content rule.
    expect(helpers.handleMessage).toHaveBeenCalledWith(client, edited);
  });

  it("includes a deleted Discord image attachment in the activity-log details", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "message-log";
    const { emitter } = setup(config);
    const targetGuild = guild("10043");
    const send = vi.fn(async (_payload: unknown) => undefined);
    targetGuild.channels.cache.set("message-log", {
      guildId: targetGuild.id,
      isTextBased: () => true,
      send,
    });
    const deletedMessage = {
      ...message(targetGuild, "20043"),
      attachments: new Map([["attachment-1", {
        url: "https://cdn.discordapp.com/attachments/30043/40043/photo.webp",
        contentType: "image/webp",
      }]]),
    };

    emitter.emit(Events.MessageDelete, deletedMessage);
    await waitForHandlers();

    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]![0] as {
      embeds: Array<{ toJSON: () => { image?: { url: string } } }>;
    };
    expect(payload.embeds[0]!.toJSON().image?.url)
      .toBe("https://cdn.discordapp.com/attachments/30043/40043/photo.webp");
  });

  it("keeps the member entry time across a restart and uses it in the departure log", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.members = true;
    config.activityLog.channelIds.members = "member-log";
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10042");
    const send = vi.fn(async (_payload: unknown) => undefined);
    targetGuild.channels.cache.set("member-log", {
      guildId: targetGuild.id,
      isTextBased: () => true,
      send,
    });

    const userId = "20042";
    const joinedAt = Date.now() - 11 * 86_400_000 - 3 * 3_600_000;
    const accountCreatedAt = Date.UTC(2021, 4, 6, 10, 30);
    const user = {
      id: userId,
      bot: false,
      createdTimestamp: accountCreatedAt,
      username: "adina",
      globalName: "Adina",
    };
    const joined = {
      ...member(targetGuild, userId, accountCreatedAt),
      user,
      displayName: "Adina pe server",
      joinedTimestamp: joinedAt,
    };

    emitter.emit(Events.GuildMemberAdd, joined);
    await waitForHandlers();
    expect(helpers.recordMemberJoin).toHaveBeenCalledWith(targetGuild.id, userId, new Date(joinedAt));
    expect(vi.mocked(helpers.auditExternal).mock.calls[0]?.[4]).not.toHaveProperty("memberAvatarUrl");

    vi.mocked(helpers.getMemberJoinAt).mockResolvedValueOnce(new Date(joinedAt));
    const departed = {
      ...joined,
      joinedTimestamp: null,
    };
    emitter.emit(Events.GuildMemberRemove, departed);
    await waitForHandlers();
    expect(vi.mocked(helpers.auditExternal).mock.calls[1]?.[4]).not.toHaveProperty("memberAvatarUrl");

    expect(helpers.clearMemberJoinAt).toHaveBeenCalledWith(targetGuild.id, userId, new Date(joinedAt));
    const payloads = send.mock.calls.map((call) => call[0] as {
      embeds: Array<{ toJSON: () => {
        fields: Array<{ name: string; value: string }>;
        thumbnail?: { url: string };
      } }>;
    });
    expect(payloads).toHaveLength(2);

    const joinEmbed = payloads[0]!.embeds[0]!.toJSON();
    const joinFields = joinEmbed.fields;
    expect(joinEmbed.thumbnail?.url).toBe("https://cdn.discordapp.com/avatars/20042/avatar.webp?size=256");
    const memberField = joinFields.find((field) => field.name === "Membru")?.value ?? "";
    // Member log presentation uses readable identity, not a ping.
    expect(memberField).not.toContain("<@20042>");
    expect(memberField).toContain("Adina pe server");
    expect(memberField).toContain("@adina");
    expect(joinFields.find((field) => field.name === "Activitate pe server")?.value)
      .toContain(`<t:${Math.floor(joinedAt / 1_000)}:F>`);
    expect(joinFields.find((field) => field.name === "Cont Discord creat")?.value)
      .toContain(`<t:${Math.floor(accountCreatedAt / 1_000)}:F>`);

    const leaveEmbed = payloads[1]!.embeds[0]!.toJSON();
    const leaveFields = leaveEmbed.fields;
    expect(leaveEmbed.thumbnail?.url).toBe("https://cdn.discordapp.com/avatars/20042/avatar.webp?size=256");
    expect(leaveFields.find((field) => field.name === "Activitate pe server")?.value)
      .toContain(`<t:${Math.floor(joinedAt / 1_000)}:F>`);
    expect(leaveFields.find((field) => field.name === "Durata pe server")?.value)
      .toMatch(/\d+ zile în total/);
  });

  it("rechecks edited content and applies the configured edit-spam action", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiSpam.enabled = true;
    config.antiSpam.edit = { enabled: true, action: "mute", severity: "normal", thresholds: { limit: 1, window: 60 } };
    const { client, emitter, helpers } = setup(config);
    const targetGuild = guild("10001");
    const first = message(targetGuild, "20001");
    const second = message(targetGuild, "20001");
    const third = message(targetGuild, "20001");

    emitter.emit(Events.MessageUpdate, { content: "first" }, first);
    emitter.emit(Events.MessageUpdate, { content: "second" }, second);
    emitter.emit(Events.MessageUpdate, { content: "third" }, third);
    await waitForHandlers();

    expect(helpers.handleMessage).toHaveBeenCalledTimes(3);
    expect(helpers.executeModerationAction).toHaveBeenCalledTimes(1);
    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: "10001", targetId: "20001", type: "mute", source: "automod",
      channelId: "33333",
      idempotencyKey: expect.stringMatching(/^edit:10001:20001:/),
    }));
  });

  it("routes configured edit deletion through the moderation action ledger", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiSpam.enabled = true;
    config.antiSpam.edit = { enabled: true, action: "delete", severity: "normal", thresholds: { limit: 1, window: 60 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10007");
    const first = message(targetGuild, "20007");
    const second = message(targetGuild, "20007");

    emitter.emit(Events.MessageUpdate, { content: "first" }, first);
    emitter.emit(Events.MessageUpdate, { content: "second" }, second);
    await waitForHandlers();

    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: "10007", targetId: "20007", type: "delete", messageId: second.id, channelId: "33333",
      source: "automod", idempotencyKey: expect.stringMatching(/^edit:10007:20007:/),
    }));
    expect(first.delete).not.toHaveBeenCalled();
    expect(second.delete).not.toHaveBeenCalled();
  });

  it("does not count a content-neutral message update as edit spam", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiSpam.enabled = true;
    config.antiSpam.edit = { enabled: true, action: "warn", severity: "normal", thresholds: { limit: 1, window: 60 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10008");
    const edited = message(targetGuild, "20008");
    emitter.emit(Events.MessageUpdate, { content: edited.content }, edited);
    emitter.emit(Events.MessageUpdate, { content: edited.content }, edited);
    await waitForHandlers();
    expect(helpers.handleMessage).not.toHaveBeenCalled();
    expect(helpers.executeModerationAction).not.toHaveBeenCalled();
  });

  it("rechecks updates with unknown old content without counting them as edits", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.protection.enabled = true;
    config.antiSpam.enabled = true;
    config.antiSpam.edit = { enabled: true, action: "warn", severity: "normal", thresholds: { limit: 1, window: 60 } };
    config.suspiciousBehavior.enabled = true;
    config.suspiciousBehavior.massEdits = {
      enabled: true, action: "warn", severity: "normal", thresholds: { limit: 1, window: 60 },
    };
    const { client, emitter, helpers } = setup(config);
    const targetGuild = guild("10010");
    const first = message(targetGuild, "20010");
    const second = message(targetGuild, "20010");

    emitter.emit(Events.MessageUpdate, { content: null }, first);
    emitter.emit(Events.MessageUpdate, { content: undefined }, second);
    await waitForHandlers();

    expect(helpers.handleMessage).toHaveBeenCalledTimes(2);
    expect(helpers.handleMessage).toHaveBeenCalledWith(client, first);
    expect(helpers.handleMessage).toHaveBeenCalledWith(client, second);
    expect(helpers.executeModerationAction).not.toHaveBeenCalled();
    expect(helpers.notify).not.toHaveBeenCalled();
  });

  it("locks fetchable uncached text channels during anti-raid lockdown", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiRaid.enabled = true;
    config.antiRaid.lockdown = true;
    config.antiRaid.rule = { enabled: true, action: "none", severity: "normal", thresholds: { joins: 0, windowSeconds: 60 } };
    config.channels.ignoredChannelIds = ["ignored-channel"];
    config.channels.protectedChannelIds = ["protected-channel"];
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10011");
    const cachedText = { id: "cached-text", type: ChannelType.GuildText };
    const fetchedText = { id: "fetched-text", type: ChannelType.GuildText };
    const ignoredText = { id: "ignored-channel", type: ChannelType.GuildText };
    const protectedText = { id: "protected-channel", type: ChannelType.GuildText };
    const fetchedVoice = { id: "fetched-voice", type: ChannelType.GuildVoice };
    targetGuild.channels.cache.set(cachedText.id, cachedText);
    (targetGuild.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Map([
      [fetchedText.id, fetchedText],
      [ignoredText.id, ignoredText],
      [protectedText.id, protectedText],
      [fetchedVoice.id, fetchedVoice],
    ]));

    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20011", Date.now()));
    await waitForHandlers();

    expect(targetGuild.channels.fetch).toHaveBeenCalledOnce();
    expect(helpers.executeModerationAction).toHaveBeenCalledTimes(2);
    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: "10011", type: "lock", channelId: "cached-text", source: "raid",
    }));
    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: "10011", type: "lock", channelId: "fetched-text", source: "raid",
    }));
    expect(helpers.executeModerationAction).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "lock", channelId: expect.stringMatching(/^(ignored-channel|protected-channel|fetched-voice)$/),
    }));
  });

  it("routes a rapid-join raid alert to antiRaid.alertChannelId", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiRaid.enabled = true;
    config.antiRaid.alertChannelId = "44444";
    config.antiRaid.rule = { enabled: true, action: "warn", severity: "normal", thresholds: { joins: 1, windowSeconds: 60 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10002");

    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20002"));
    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20003"));
    await waitForHandlers();

    expect(helpers.notify).toHaveBeenCalledWith(config, targetGuild, "Alertă anti-raid", expect.any(String), "44444");
    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      targetId: "20003", type: "warn", source: "raid",
    }));
  });

  it("keeps evaluating anti-raid when a repeated join/leave alert is on cooldown", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.suspiciousBehavior.enabled = true;
    config.suspiciousBehavior.alertChannelId = "44445";
    config.suspiciousBehavior.joinLeaveFlood = {
      enabled: true, action: "none", severity: "normal", thresholds: { limit: 1, windowSeconds: 60 },
    };
    config.antiRaid.enabled = true;
    config.antiRaid.alertChannelId = "44444";
    config.antiRaid.rule = {
      enabled: true, action: "warn", severity: "normal", thresholds: { joins: 1, windowSeconds: 1 },
    };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10009");
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20009"));
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20010"));
      await waitForHandlers();
      now += 15_100;
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20011"));
      await waitForHandlers();
      expect((helpers.notify as ReturnType<typeof vi.fn>).mock.calls
        .filter(([, , title]) => title === "Alertă anti-raid")).toHaveLength(2);
      expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
        targetId: "20011", type: "warn", source: "raid",
      }));
    } finally {
      clock.mockRestore();
    }
  });

  it("catches handler and enforcement failures instead of leaking rejected listeners", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiRaid.enabled = true;
    config.antiRaid.rule = { enabled: true, action: "warn", severity: "normal", thresholds: { joins: 1, windowSeconds: 60 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10003");
    (helpers.executeModerationAction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("hierarchy"));

    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20004"));
    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20005"));
    await expect(waitForHandlers()).resolves.toBeUndefined();
  });

  it("never punishes a message author or changed-role target when the audit actor is unverified", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiSpam.enabled = true;
    config.antiSpam.delete = { enabled: true, action: "ban", severity: "normal", thresholds: { limit: 1, window: 60 } };
    config.suspiciousBehavior.enabled = true;
    config.suspiciousBehavior.alertChannelId = "44445";
    config.suspiciousBehavior.roleChanges = { enabled: true, action: "kick", severity: "normal", thresholds: { limit: 1 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10004");

    emitter.emit(Events.MessageDelete, message(targetGuild, "author-id"));
    emitter.emit(Events.MessageDelete, message(targetGuild, "author-id"));
    const oldMember = member(targetGuild, "role-target");
    const changedRoles = {
      some: () => false,
      has: () => false,
      filter: (predicate: (role: { id: string }) => boolean) => ({
        map: (mapper: (role: { id: string }) => string) => [{ id: "55555" }].filter(predicate).map(mapper),
      }),
    };
    const changedMember = { ...member(targetGuild, "role-target"), roles: { cache: changedRoles } };
    emitter.emit(Events.GuildMemberUpdate, oldMember, changedMember);
    emitter.emit(Events.GuildMemberUpdate, oldMember, changedMember);
    await waitForHandlers();

    expect(helpers.executeModerationAction).not.toHaveBeenCalled();
    expect(helpers.notify).toHaveBeenCalledWith(config, targetGuild, "Activitate suspectă", expect.stringContaining("Actor neverificat"), "44445");
  });

  it("keeps rate state isolated between guilds", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiRaid.enabled = true;
    config.antiRaid.rule = { enabled: true, action: "warn", severity: "normal", thresholds: { joins: 1, windowSeconds: 60 } };
    const { emitter, helpers } = setup(config);
    const firstGuild = guild("10005");
    const secondGuild = guild("10006");

    emitter.emit(Events.GuildMemberAdd, member(firstGuild, "21001"));
    emitter.emit(Events.GuildMemberAdd, member(secondGuild, "22001"));
    await waitForHandlers();
    expect(helpers.executeModerationAction).not.toHaveBeenCalled();

    emitter.emit(Events.GuildMemberAdd, member(firstGuild, "21002"));
    await waitForHandlers();
    expect(helpers.executeModerationAction).toHaveBeenCalledTimes(1);
    expect(helpers.executeModerationAction).toHaveBeenLastCalledWith(expect.objectContaining({ guildId: "10005" }));
  });

  it("explains unusual server activity, its threshold, target and unverified actor", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.protection.enabled = true;
    config.suspiciousBehavior.enabled = true;
    config.suspiciousBehavior.alertChannelId = "44445";
    config.suspiciousBehavior.unusualActivity = {
      enabled: true, action: "none", severity: "normal", thresholds: { limit: 1, windowSeconds: 60 },
    };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10022");
    const beforeChannel = {
      id: "text-target",
      guild: targetGuild,
      name: "general",
      type: ChannelType.GuildText,
      parentId: null,
      topic: null,
      nsfw: false,
      rateLimitPerUser: 0,
      isDMBased: () => false,
    };

    emitter.emit(Events.ChannelUpdate, beforeChannel, { ...beforeChannel, topic: "First update" });
    emitter.emit(Events.ChannelUpdate, beforeChannel, { ...beforeChannel, topic: "Second update" });
    await waitForHandlers();

    expect(helpers.notify).toHaveBeenCalledWith(
      config,
      targetGuild,
      "Activitate suspectă",
      expect.stringContaining("2 evenimente de securitate în fluxul comun al serverului, în 60 secunde. Limita configurată (1) a fost depășită."),
      "44445",
      { memberId: null, moderatorId: null, channelId: "text-target", durationMinutes: null },
    );
    const description = (helpers.notify as ReturnType<typeof vi.fn>).mock.calls[0]?.[3] as string;
    expect(description).toContain("modificarea unui canal");
    expect(description).toContain("#general (<#text-target>)");
    expect(description).toContain("Actorul nu a putut fi identificat");
    expect(description).toContain("nu se aplică sancțiune");
  });

  describe("the actions ticked for a rule", () => {
    /** A guild whose audit log names a verified, non-staff member as the executor. */
    function guildWithVerifiedActor(id: string, targetId: string, executorId: string) {
      const entry = { createdTimestamp: Date.now(), targetId, executorId, executor: { bot: false }, extra: null };
      const executor = { id: executorId, user: { bot: false }, roles: { cache: roles }, permissions: { has: () => false } };
      return Object.assign(guild(id), {
        fetchAuditLogs: vi.fn(async () => ({
          entries: { find: (predicate: (candidate: typeof entry) => boolean) => [entry].find(predicate) },
        })),
        members: { fetch: vi.fn(async () => executor) },
      });
    }

    it("warns, bans and pings the staff for one raid, counting the warning only once", async () => {
      const config = structuredClone(defaultModerationConfig);
      config.antiRaid.enabled = true;
      config.antiRaid.alertChannelId = "44444";
      config.antiRaid.rule = {
        enabled: true, action: "ban", warnMember: true, alertStaff: true, severity: "normal",
        thresholds: { joins: 1, windowSeconds: 60 },
      };
      const { emitter, helpers } = setup(config);
      const targetGuild = guild("10101");

      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20101"));
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20102"));
      await waitForHandlers();

      expect(helpers.notify).toHaveBeenCalledWith(
        config, targetGuild, "Alertă anti-raid", expect.any(String), "44444", undefined, { pingStaff: true },
      );
      const calls = vi.mocked(helpers.executeModerationAction).mock.calls.map(([input]) => input);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        targetId: "20102", type: "warn", source: "raid", countsAsOffense: false,
        idempotencyKey: expect.stringMatching(/^raid:10101:.*:member:20102:warn$/),
      });
      expect(calls[1]).toMatchObject({
        targetId: "20102", type: "ban", source: "raid",
        idempotencyKey: expect.stringMatching(/^raid:10101:.*:member:20102$/),
      });
      expect(calls[1]).not.toHaveProperty("countsAsOffense");
    });

    it("mutes for the configured length and warns with a ticked warning alone", async () => {
      const config = structuredClone(defaultModerationConfig);
      config.antiRaid.enabled = true;
      config.antiRaid.rule = {
        enabled: true, action: "mute", muteMinutes: 120, severity: "normal", thresholds: { joins: 1, windowSeconds: 60 },
      };
      const { emitter, helpers } = setup(config);
      const targetGuild = guild("10102");
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20103"));
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20104"));
      await waitForHandlers();
      expect(helpers.executeModerationAction).toHaveBeenCalledTimes(1);
      expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
        targetId: "20104", type: "mute", durationMinutes: 120, source: "raid",
      }));

      const warnOnly = structuredClone(defaultModerationConfig);
      warnOnly.antiRaid.enabled = true;
      warnOnly.antiRaid.rule = {
        enabled: true, action: "none", warnMember: true, severity: "normal", thresholds: { joins: 1, windowSeconds: 60 },
      };
      const second = setup(warnOnly);
      const otherGuild = guild("10103");
      second.emitter.emit(Events.GuildMemberAdd, member(otherGuild, "20105"));
      second.emitter.emit(Events.GuildMemberAdd, member(otherGuild, "20106"));
      await waitForHandlers();
      expect(second.helpers.executeModerationAction).toHaveBeenCalledTimes(1);
      expect(second.helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
        targetId: "20106", type: "warn", source: "raid",
      }));
    });

    it("sends nothing extra for a rule saved before the new ticks existed", async () => {
      const config = structuredClone(defaultModerationConfig);
      config.antiRaid.enabled = true;
      config.antiRaid.alertChannelId = "44444";
      config.antiRaid.rule = { enabled: true, action: "mute", severity: "normal", thresholds: { joins: 1, windowSeconds: 60 } };
      const { emitter, helpers } = setup(config);
      const targetGuild = guild("10104");
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20107"));
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20108"));
      await waitForHandlers();

      expect(helpers.notify).toHaveBeenCalledWith(config, targetGuild, "Alertă anti-raid", expect.any(String), "44444");
      const [input] = vi.mocked(helpers.executeModerationAction).mock.calls[0]!;
      // Ten minutes is what a mute always lasted; nothing else is added to the request.
      expect(input).toMatchObject({ type: "mute", durationMinutes: 10 });
      expect(input).not.toHaveProperty("countsAsOffense");
      expect(helpers.executeModerationAction).toHaveBeenCalledTimes(1);
    });

    it("deletes an edit-spam message, warns the author and pings the staff in the anti-spam log", async () => {
      const config = structuredClone(defaultModerationConfig);
      config.antiSpam.enabled = true;
      config.antiSpam.logChannelId = "55555";
      config.antiSpam.edit = {
        enabled: true, action: "delete", warnMember: true, alertStaff: true, severity: "normal",
        thresholds: { limit: 1, window: 60 },
      };
      const { emitter, helpers } = setup(config);
      const targetGuild = guild("10105");
      const first = message(targetGuild, "20109");
      const second = message(targetGuild, "20109");

      emitter.emit(Events.MessageUpdate, { content: "first" }, first);
      emitter.emit(Events.MessageUpdate, { content: "second" }, second);
      await waitForHandlers();

      const calls = vi.mocked(helpers.executeModerationAction).mock.calls.map(([input]) => input);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        type: "delete", messageId: second.id, targetId: "20109",
        idempotencyKey: expect.stringMatching(/^edit:10105:20109:.*:delete$/),
      });
      expect(calls[1]).toMatchObject({ type: "warn", targetId: "20109", source: "automod" });
      expect(calls[1]).not.toHaveProperty("countsAsOffense");
      expect(helpers.notify).toHaveBeenCalledTimes(1);
      expect(helpers.notify).toHaveBeenCalledWith(
        config, targetGuild, "Spam de editări", expect.any(String), "55555",
        expect.objectContaining({ memberId: "20109", channelId: "33333" }), { pingStaff: true },
      );
    });

    it("applies the module's ticks to a verified actor's mass deletion", async () => {
      const config = structuredClone(defaultModerationConfig);
      config.suspiciousBehavior.enabled = true;
      config.suspiciousBehavior.alertChannelId = "44446";
      config.suspiciousBehavior.action = "mute";
      config.suspiciousBehavior.warnMember = true;
      config.suspiciousBehavior.alertStaff = true;
      config.suspiciousBehavior.muteMinutes = 180;
      config.suspiciousBehavior.massDeletes = {
        enabled: true, action: "none", severity: "normal", thresholds: { limit: 1, windowSeconds: 60 },
      };
      const { emitter, helpers } = setup(config);
      const targetGuild = guildWithVerifiedActor("10106", "author-10106", "70106");

      emitter.emit(Events.MessageDelete, message(targetGuild, "author-10106"));
      emitter.emit(Events.MessageDelete, message(targetGuild, "author-10106"));
      await waitForHandlers();

      expect(helpers.notify).toHaveBeenCalledWith(
        config, targetGuild, "Activitate suspectă", expect.any(String), "44446", undefined, { pingStaff: true },
      );
      const calls = vi.mocked(helpers.executeModerationAction).mock.calls.map(([input]) => input);
      expect(calls).toHaveLength(2);
      // The person who deleted the messages is sanctioned, never the author of the deleted ones.
      expect(calls[0]).toMatchObject({ type: "warn", targetId: "70106", countsAsOffense: false });
      expect(calls[1]).toMatchObject({ type: "mute", targetId: "70106", durationMinutes: 180 });
    });

    it("keeps a rule's own sanction instead of mixing in the module's one", async () => {
      const config = structuredClone(defaultModerationConfig);
      config.suspiciousBehavior.enabled = true;
      config.suspiciousBehavior.alertChannelId = "44448";
      config.suspiciousBehavior.action = "ban";
      config.suspiciousBehavior.warnMember = true;
      config.suspiciousBehavior.massDeletes = {
        enabled: true, action: "kick", severity: "normal", thresholds: { limit: 1, windowSeconds: 60 },
      };
      const { emitter, helpers } = setup(config);
      const targetGuild = guildWithVerifiedActor("10107", "author-10107", "70107");

      emitter.emit(Events.MessageDelete, message(targetGuild, "author-10107"));
      emitter.emit(Events.MessageDelete, message(targetGuild, "author-10107"));
      await waitForHandlers();

      expect(helpers.executeModerationAction).toHaveBeenCalledTimes(1);
      expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({ type: "kick", targetId: "70107" }));
      expect(helpers.notify).toHaveBeenCalledWith(config, targetGuild, "Activitate suspectă", expect.any(String), "44448");
    });

    it("pings the staff for a join/leave flood, which never sanctions anyone", async () => {
      const config = structuredClone(defaultModerationConfig);
      config.suspiciousBehavior.enabled = true;
      config.suspiciousBehavior.alertChannelId = "44447";
      config.suspiciousBehavior.joinLeaveFlood = {
        enabled: true, action: "ban", alertStaff: true, severity: "normal", thresholds: { limit: 1, windowSeconds: 60 },
      };
      const { emitter, helpers } = setup(config);
      const targetGuild = guild("10108");

      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20110"));
      emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20111"));
      await waitForHandlers();

      expect(helpers.notify).toHaveBeenCalledWith(
        config, targetGuild, "Activitate suspectă", expect.any(String), "44447", undefined, { pingStaff: true },
      );
      expect(helpers.executeModerationAction).not.toHaveBeenCalled();
    });
  });
});