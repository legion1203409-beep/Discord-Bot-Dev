import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockTextChannel,
  mockDeleteEvent,
  mockGetAllEvents,
  mockGetChannel,
  mockLogger,
} = vi.hoisted(() => {
  const instances = new WeakSet<object>();
  class MockTextChannel {
    id: string;
    guildId = "";
    parentId: string | null = null;
    messages = { fetch: vi.fn() };
    send = vi.fn();

    constructor(id = "channel") {
      this.id = id;
      instances.add(this);
    }

    static [Symbol.hasInstance](value: unknown): boolean {
      return typeof value === "object" && value !== null && instances.has(value);
    }
  }

  return {
    MockTextChannel,
    mockDeleteEvent: vi.fn().mockResolvedValue(undefined),
    mockGetAllEvents: vi.fn().mockResolvedValue([]),
    mockGetChannel: vi.fn(),
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock("discord.js", () => {
  class MockSlashCommandBuilder {
    setName(_name?: string) { return this; }
    setDescription(_description?: string) { return this; }
    addSubcommand(callback: (builder: MockSlashCommandBuilder) => unknown) {
      callback(this);
      return this;
    }
  }
  class Builder {
    addComponents() { return this; }
    setColor() { return this; }
    setTitle() { return this; }
    setDescription() { return this; }
    setImage() { return this; }
    setFooter() { return this; }
    setTimestamp() { return this; }
    setCustomId() { return this; }
    setLabel() { return this; }
    setStyle() { return this; }
    setEmoji() { return this; }
    setDisabled() { return this; }
  }
  return {
    Client: class MockClient {},
    SlashCommandBuilder: MockSlashCommandBuilder,
    TextChannel: MockTextChannel,
    ActionRowBuilder: Builder,
    ButtonBuilder: Builder,
    EmbedBuilder: Builder,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
  };
});

vi.mock("../haunted-house", () => ({
  beginHauntedHouseStop: vi.fn(() => null),
  cancelHauntedHouseStop: vi.fn(),
  clearPersistedHauntedHouseSession: vi.fn().mockResolvedValue(undefined),
  completeHauntedHouseStop: vi.fn(),
  generateScheduledGhostStory: vi.fn().mockResolvedValue("story"),
  getHauntedHouseExpiry: vi.fn(() => null),
  getHauntedHouseSessionId: vi.fn(() => null),
  isHauntedHouseActive: vi.fn(() => false),
  persistHauntedHouseSession: vi.fn().mockResolvedValue(undefined),
  restoreHauntedHouseSession: vi.fn().mockResolvedValue(undefined),
  startHauntedHouse: vi.fn(() => false),
  stopHauntedHouse: vi.fn(),
  updateHauntedHouseLeaderboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/logger", () => ({ logger: mockLogger }));
vi.mock("../channel-config", () => ({
  getChannel: mockGetChannel,
  initChannelConfig: vi.fn(),
  hasAnyChannelConfigured: vi.fn(() => true),
}));
vi.mock("../ticket-categories", () => ({ isTicketCategoryParentId: vi.fn(() => false) }));
vi.mock("../db", () => ({
  createEvent: vi.fn(),
  deactivateEvent: vi.fn(),
  getExpiredActiveEvents: vi.fn().mockResolvedValue([]),
  getEventParticipants: vi.fn().mockResolvedValue([]),
  getAllEvents: mockGetAllEvents,
  setEventDecreeMessage: vi.fn(),
  deleteEvent: mockDeleteEvent,
  getLatestActiveEvent: vi.fn(),
  getActiveEvent: vi.fn(),
  setHonorTitle: vi.fn(),
  addPlayerReputation: vi.fn(),
  addPlayerGold: vi.fn(),
  addPlayerXp: vi.fn(),
  getPrestigeLevels: vi.fn().mockResolvedValue(new Map()),
  persistActiveBoss: vi.fn(),
  loadActiveBossRowsByGuild: vi.fn().mockResolvedValue([]),
  deleteActiveBoss: vi.fn(),
  createActiveBossesTableIfNotExists: vi.fn(),
  persistActiveChest: vi.fn(),
  loadActiveChest: vi.fn(),
  clearActiveChest: vi.fn(),
  getFinalBossKills: vi.fn(),
  loadLeaderboardMessageId: vi.fn(),
  saveLeaderboardMessageId: vi.fn(),
  KEYCHEST_DBKEY: "keychest",
  LOCKCHEST_DBKEY: "lockchest",
  runMultiGuildMigrations: vi.fn(),
}));
vi.mock("../survival", () => ({
  buildStartEmbed: vi.fn(),
  buildExpiredCronica: vi.fn(),
  buildChestEmbed: vi.fn(),
  rollChest: vi.fn(),
  oracleMessage: vi.fn(),
  buildFinalBossEmbed: vi.fn(),
  buildBossLeaderboard: vi.fn(),
  buildEventLeaderboard: vi.fn(),
  buildLockedChestEmbed: vi.fn(),
  buildKeyChestEmbed: vi.fn(),
  spawnLockedChest: vi.fn(),
  rollKeyChestType: vi.fn(),
  computeBossRewards: vi.fn(() => new Map()),
  prestigeGoldMult: vi.fn(() => 1),
  finalBossRow: vi.fn(),
  bossMaxHp: vi.fn(),
  veteranRank: vi.fn(),
  veteranMult: vi.fn(),
  CHEST_RARITIES: [],
}));
vi.mock("../combat-events", () => ({ triggerRandomBattleEvent: vi.fn() }));
vi.mock("../status-effects", () => ({
  getRewardMultipliers: vi.fn(() => ({ goldMult: 1, xpMult: 1 })),
}));
vi.mock("../oracle", () => ({ startOracle: vi.fn(), setOracleExtatic: vi.fn() }));
vi.mock("../oracle-council", () => ({
  rehydrateCouncilDecree: vi.fn(),
  startOracleCouncilScheduler: vi.fn(),
  stopOracleCouncilScheduler: vi.fn(),
}));
vi.mock("../chest-expansions", () => ({
  openFratiaVote: vi.fn(),
  rehydrateFratiaVote: vi.fn(),
  spawnSeasonalChest: vi.fn(),
  rehydrateSeasonalChest: vi.fn(),
  rehydrateHiddenChest: vi.fn(),
  settleExpiredAuction: vi.fn(),
}));
vi.mock("../tribute", () => ({
  setTributeGamePaused: vi.fn(),
  startTributeScheduler: vi.fn(),
  stopTributeScheduler: vi.fn(),
}));

import {
  cleanupOldEvents,
  deleteEventMessages,
  EVENT_MESSAGE_RETENTION_MS,
  scheduleEventMessageDeletion,
  publishLeaderboardResult,
} from "../scheduler";
import { loadLeaderboardMessageId, saveLeaderboardMessageId } from "../db";

function discordError(code: number, message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

function makeClient(channels: Record<string, InstanceType<typeof MockTextChannel>>) {
  return {
    channels: {
      fetch: vi.fn(async (id: string) => channels[id] ?? null),
    },
  } as unknown as import("discord.js").Client;
}

function expiredAt(): Date {
  return new Date(Date.now() - EVENT_MESSAGE_RETENTION_MS - 1);
}

describe("persistent leaderboard publication", () => {
  it.each(["fetch", "edit", "history", "database"])("does not repost after a temporary %s failure", async (phase) => {
    const channel = new MockTextChannel("main-channel");
    channel.guildId = "leaderboard-deleted";
    const saved = vi.mocked(loadLeaderboardMessageId);
    saved.mockReset();
    if (phase === "database") saved.mockRejectedValueOnce(new Error("database unavailable"));
    else saved.mockResolvedValueOnce("deleted-top");
    const message = { id: "new-top", edit: vi.fn().mockResolvedValue({ id: "new-top" }) };
    if (phase === "edit") {
      channel.messages.fetch.mockResolvedValue(message);
      message.edit.mockRejectedValueOnce(new Error("edit unavailable"));
    } else if (phase === "fetch") {
      channel.messages.fetch.mockRejectedValue(new Error("network unavailable"));
    } else if (phase === "history") {
      channel.messages.fetch.mockImplementation(async (id: unknown) => {
        if (id === "deleted-top") throw discordError(10008, "Unknown Message");
        throw new Error("history unavailable");
      });
    }
    await expect(publishLeaderboardResult(makeClient({ "main-channel": channel }), channel.guildId, "eventTop", { embeds: [] }))
      .rejects.toThrow();
    expect(channel.send).not.toHaveBeenCalled();
    expect(saveLeaderboardMessageId).not.toHaveBeenCalled();
  });

  it("replaces a definitively deleted message once, even for concurrent publications", async () => {
    const channel = new MockTextChannel("main-channel");
    channel.guildId = "leaderboard-deleted";
    const saved = vi.mocked(loadLeaderboardMessageId);
    saved.mockReset();
    saved.mockResolvedValueOnce("deleted-top").mockResolvedValue("new-top");
    const message = { id: "new-top", edit: vi.fn().mockResolvedValue({ id: "new-top" }) };
    channel.messages.fetch.mockImplementation(async (id: unknown) => {
      if (id === "deleted-top") throw discordError(10008, "Unknown Message");
      if (id === "new-top") return message;
      return { find: () => undefined };
    });
    channel.send.mockResolvedValue(message);
    const client = makeClient({ "main-channel": channel });
    const results = await Promise.all(Array.from({ length: 3 }, () =>
      publishLeaderboardResult(client, channel.guildId, "eventTop", { embeds: [] }),
    ));
    expect(results.map((entry) => entry?.id)).toEqual(Array(3).fill("new-top"));
    expect(channel.send).toHaveBeenCalledTimes(1);
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  vi.clearAllMocks();
  mockGetChannel.mockImplementation((type: string) => type === "event" ? "event-channel" : "main-channel");
  mockDeleteEvent.mockResolvedValue(undefined);
  mockGetAllEvents.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("persisted event message cleanup", () => {
  it("treats Discord 10008 from message fetch as already deleted", async () => {
    const eventChannel = new MockTextChannel("event-channel");
    eventChannel.guildId = "guild-delete-retry";
    eventChannel.messages.fetch.mockRejectedValue(discordError(10008, "Unknown Message"));

    scheduleEventMessageDeletion(
      makeClient({ "event-channel": eventChannel }),
      "guild-delete-retry",
      104,
      "event-message",
      expiredAt(),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(mockDeleteEvent).toHaveBeenCalledWith(104);
    expect(eventChannel.messages.fetch).toHaveBeenCalledWith("event-message");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockDeleteEvent).toHaveBeenCalledOnce();
  });

  it("keeps an unconfigured channel retryable with structured context", async () => {
    mockGetChannel.mockReturnValue(null);

    await expect(deleteEventMessages(
      makeClient({}),
      "guild-unconfigured",
      107,
      "event-message",
    )).resolves.toBe(true);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 107,
        failures: [expect.objectContaining({
          phase: "channel-config",
          code: "CHANNEL_UNCONFIGURED",
          messageId: "event-message",
        })],
      }),
      "Event message cleanup will retry",
    );
    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });

  it("does not create duplicate timers for the same guild event", async () => {
    const eventMessage = { delete: vi.fn().mockResolvedValue(undefined) };
    const eventChannel = new MockTextChannel("event-channel");
    eventChannel.guildId = "guild-fetch-retry";
    eventChannel.messages.fetch
      .mockRejectedValueOnce(discordError(500, "temporary gateway failure"))
      .mockResolvedValue(eventMessage);
    const client = makeClient({ "event-channel": eventChannel });

    scheduleEventMessageDeletion(client, "guild-fetch-retry", 103, "event-message", expiredAt());
    scheduleEventMessageDeletion(client, "guild-fetch-retry", 103, "event-message", expiredAt());
    await vi.advanceTimersByTimeAsync(0);

    expect(eventChannel.messages.fetch).toHaveBeenCalledOnce();
    expect(mockDeleteEvent).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 103,
        failures: [expect.objectContaining({
          target: "event",
          phase: "message-fetch",
          code: "500",
          message: "temporary gateway failure",
          messageId: "event-message",
        })],
      }),
      "Event message cleanup will retry",
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventChannel.messages.fetch).toHaveBeenCalledTimes(2);
    expect(eventMessage.delete).toHaveBeenCalledOnce();
    expect(mockDeleteEvent).toHaveBeenCalledWith(103);
  });

  it("retries a transient message-delete failure", async () => {
    const eventMessage = {
      delete: vi.fn().mockRejectedValueOnce(discordError(500, "temporary delete failure"))
        .mockResolvedValue(undefined),
    };
    const eventChannel = new MockTextChannel("event-channel");
    eventChannel.guildId = "guild-fetch-retry";
    eventChannel.messages.fetch.mockResolvedValue(eventMessage);
    const client = makeClient({ "event-channel": eventChannel });

    scheduleEventMessageDeletion(client, "guild-fetch-retry", 103, "event-message", expiredAt());
    await vi.advanceTimersByTimeAsync(0);

    expect(mockDeleteEvent).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 103,
        failures: [expect.objectContaining({
          target: "event",
          phase: "message-delete",
          code: "500",
          message: "temporary delete failure",
          messageId: "event-message",
        })],
      }),
      "Event message cleanup will retry",
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventMessage.delete).toHaveBeenCalledTimes(2);
    expect(mockDeleteEvent).toHaveBeenCalledWith(103);
  });

  it("deletes the event record after an expired message is removed", async () => {
    const eventMessage = { delete: vi.fn().mockResolvedValue(undefined) };
    const eventChannel = new MockTextChannel("event-channel");
    eventChannel.guildId = "guild-delete-retry";
    eventChannel.messages.fetch.mockResolvedValue(eventMessage);

    scheduleEventMessageDeletion(
      makeClient({ "event-channel": eventChannel }),
      "guild-delete-retry",
      104,
      "event-message",
      expiredAt(),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(eventMessage.delete).toHaveBeenCalledOnce();
    expect(mockDeleteEvent).toHaveBeenCalledWith(104);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventMessage.delete).toHaveBeenCalledOnce();
  });

  it("keeps an unconfigured channel retryable with structured context", async () => {
    mockGetChannel.mockReturnValue(null);

    await expect(deleteEventMessages(
      makeClient({}),
      "guild-unconfigured",
      107,
      "event-message",
    )).resolves.toBe(true);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 107,
        failures: [expect.objectContaining({
          phase: "channel-config",
          code: "CHANNEL_UNCONFIGURED",
          messageId: "event-message",
        })],
      }),
      "Event message cleanup will retry",
    );
    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });

  it("does not create duplicate timers for the same guild event", async () => {
    const eventMessage = { delete: vi.fn().mockResolvedValue(undefined) };
    const eventChannel = new MockTextChannel("event-channel");
    eventChannel.guildId = "guild-deduplicated";
    eventChannel.messages.fetch.mockResolvedValue(eventMessage);
    const client = makeClient({ "event-channel": eventChannel });
    const expiry = expiredAt();

    scheduleEventMessageDeletion(client, "guild-deduplicated", 108, "event-message", expiry);
    scheduleEventMessageDeletion(client, "guild-deduplicated", 108, "event-message", expiry);
    await vi.advanceTimersByTimeAsync(0);

    expect(eventChannel.messages.fetch).toHaveBeenCalledOnce();
    expect(eventMessage.delete).toHaveBeenCalledOnce();
    expect(mockDeleteEvent).toHaveBeenCalledOnce();
  });

  it("cleans both the event and decree messages before deleting the record", async () => {
    const eventMessage = { delete: vi.fn().mockResolvedValue(undefined) };
    const decreeMessage = { delete: vi.fn().mockResolvedValue(undefined) };
    const eventChannel = new MockTextChannel("event-channel");
    const mainChannel = new MockTextChannel("main-channel");
    eventChannel.guildId = "guild-decree";
    mainChannel.guildId = "guild-decree";
    eventChannel.messages.fetch.mockResolvedValue(eventMessage);
    mainChannel.messages.fetch.mockResolvedValue(decreeMessage);

    scheduleEventMessageDeletion(
      makeClient({ "event-channel": eventChannel, "main-channel": mainChannel }),
      "guild-decree",
      105,
      "event-message",
      expiredAt(),
      "decree-message",
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(eventChannel.messages.fetch).toHaveBeenCalledWith("event-message");
    expect(mainChannel.messages.fetch).toHaveBeenCalledWith("decree-message");
    expect(eventMessage.delete).toHaveBeenCalledOnce();
    expect(decreeMessage.delete).toHaveBeenCalledOnce();
    expect(mockDeleteEvent).toHaveBeenCalledWith(105);
  });

  it("routes the legacy old-event sweep through the retrying timer cleanup", async () => {
    const eventMessage = { delete: vi.fn().mockResolvedValue(undefined) };
    const eventChannel = new MockTextChannel("event-channel");
    eventChannel.guildId = "guild-legacy";
    eventChannel.messages.fetch.mockResolvedValue(eventMessage);
    mockGetAllEvents.mockResolvedValue([{
      id: 106,
      messageId: "legacy-event-message",
      decreeMessageId: null,
      expiresAt: expiredAt(),
    }]);

    await cleanupOldEvents(
      makeClient({ "event-channel": eventChannel }),
      "guild-legacy",
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(eventChannel.messages.fetch).toHaveBeenCalledWith("legacy-event-message");
    expect(mockDeleteEvent).toHaveBeenCalledWith(106);
  });

  it("does not delete a tracked message through another server's channel", async () => {
    const foreignChannel = new MockTextChannel("event-channel");
    foreignChannel.guildId = "other-guild";
    await expect(deleteEventMessages(
      makeClient({ "event-channel": foreignChannel }),
      "guild-routing",
      109,
      "event-message",
    )).resolves.toBe(true);
    expect(foreignChannel.messages.fetch).not.toHaveBeenCalled();
    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });
});
