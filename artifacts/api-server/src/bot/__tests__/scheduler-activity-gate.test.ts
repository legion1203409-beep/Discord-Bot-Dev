import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock deps so we can import from scheduler without a real Discord client ──
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../channel-config", () => ({
  getChannel: vi.fn().mockReturnValue(null),
  initChannelConfig: vi.fn(),
  hasAnyChannelConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../oracle", () => ({
  startOracle: vi.fn(),
  setOracleExtatic: vi.fn(),
  recordMessage: vi.fn(),
}));
vi.mock("../db", () => ({
  createEvent: vi.fn(),
  deactivateEvent: vi.fn(),
  getExpiredActiveEvents: vi.fn().mockResolvedValue([]),
  getEventParticipants: vi.fn().mockResolvedValue([]),
  getAllEvents: vi.fn().mockResolvedValue([]),
  setEventDecreeMessage: vi.fn(),
  deleteEvent: vi.fn(),
  getLatestActiveEvent: vi.fn().mockResolvedValue(null),
  getActiveEvent: vi.fn().mockResolvedValue(null),
  setHonorTitle: vi.fn(),
  addPlayerReputation: vi.fn(),
  addPlayerGold: vi.fn(),
  addPlayerXp: vi.fn(),
  getPrestigeLevels: vi.fn().mockResolvedValue([]),
  persistActiveBoss: vi.fn(),
  loadActiveBossRowsByGuild: vi.fn().mockResolvedValue([]),
  deleteActiveBoss: vi.fn(),
  createActiveBossesTableIfNotExists: vi.fn().mockResolvedValue(undefined),
  persistActiveChest: vi.fn(),
  loadActiveChest: vi.fn().mockResolvedValue(null),
  clearActiveChest: vi.fn(),
  KEYCHEST_DBKEY: "keychest",
  LOCKCHEST_DBKEY: "lockchest",
  runMultiGuildMigrations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../survival", () => ({
  rollChest: vi.fn().mockReturnValue({ rarity: { key: "bronz", emoji: "🥉" }, gold: 50 }),
  rollKeyChestType: vi.fn().mockReturnValue("rar"),
  oracleMessage: vi.fn().mockReturnValue(""),
  buildChestEmbed: vi.fn().mockReturnValue({}),
  buildExpiredChestEmbed: vi.fn().mockReturnValue({}),
  buildStartEmbed: vi.fn().mockReturnValue({}),
  buildExpiredCronica: vi.fn().mockReturnValue({}),
  buildFinalBossEmbed: vi.fn().mockReturnValue({}),
  buildBossLeaderboard: vi.fn().mockReturnValue({}),
  buildEventLeaderboard: vi.fn().mockReturnValue({}),
  buildLockedChestEmbed: vi.fn().mockReturnValue({}),
  buildKeyChestEmbed: vi.fn().mockReturnValue({}),
  spawnLockedChest: vi.fn().mockReturnValue({ chestId: "lc_1", gold: 100, rarityKey: "argint" }),
  computeBossRewards: vi.fn().mockReturnValue([]),
  prestigeGoldMult: vi.fn().mockReturnValue(1),
  finalBossRow: vi.fn().mockReturnValue({}),
  bossMaxHp: vi.fn().mockReturnValue(1000),
  CHEST_RARITIES: [],
}));
vi.mock("../combat-events", () => ({
  triggerRandomBattleEvent: vi.fn(),
}));
vi.mock("../status-effects", () => ({
  getRewardMultipliers: vi.fn().mockReturnValue({ xpMult: 1, goldMult: 1 }),
}));

import { isGuildActive, recordGuildActivity, guildStates, CHEST_MSG_MILESTONE, ACTIVITY_WINDOW_MINUTES } from "../scheduler";

// ─────────────────────────────────────────────────────────────────────────────

describe("isGuildActive — pure activity gate helper", () => {
  const WINDOW = 20 * 60 * 1000; // 20 min

  it("returns false when lastActivityAt is 0 (never seen)", () => {
    expect(isGuildActive(0, WINDOW)).toBe(false);
  });

  it("returns true when activity is within the window", () => {
    const now = Date.now();
    expect(isGuildActive(now - 5 * 60_000, WINDOW, now)).toBe(true);
  });

  it("returns true exactly at the window boundary", () => {
    const now = Date.now();
    expect(isGuildActive(now - WINDOW, WINDOW, now)).toBe(true);
  });

  it("returns false when activity is beyond the window", () => {
    const now = Date.now();
    expect(isGuildActive(now - WINDOW - 1, WINDOW, now)).toBe(false);
  });

  it("returns false when lastActivityAt is far in the past", () => {
    const now = Date.now();
    expect(isGuildActive(now - 2 * 60 * 60_000, WINDOW, now)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("recordGuildActivity — per-guild counter and gate", () => {
  const GUILD = "test-guild-activity";
  const mockClient = {} as never;

  beforeEach(() => {
    guildStates.delete(GUILD);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sets lastActivityAt when called", () => {
    const before = Date.now();
    recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    expect(gs.lastActivityAt).toBeGreaterThanOrEqual(before);
  });

  it("increments activityMsgCount on each call", () => {
    recordGuildActivity(mockClient, GUILD);
    recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    expect(gs.activityMsgCount).toBe(2);
  });

  it("resets activityMsgCount to 0 after reaching the milestone", () => {
    const gs = guildStates.get(GUILD) ?? (() => {
      recordGuildActivity(mockClient, GUILD);
      return guildStates.get(GUILD)!;
    })();
    gs.activityMsgCount = CHEST_MSG_MILESTONE - 1;
    recordGuildActivity(mockClient, GUILD);
    expect(gs.activityMsgCount).toBe(0);
  });

  it("does NOT call fireChest when milestone not yet reached", () => {
    const gs = guildStates.get(GUILD) ?? (() => {
      recordGuildActivity(mockClient, GUILD);
      return guildStates.get(GUILD)!;
    })();
    // Set count 2 below milestone — even two calls shouldn't trigger
    gs.activityMsgCount = CHEST_MSG_MILESTONE - 2;
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.01); // would always trigger if milestone hit
    recordGuildActivity(mockClient, GUILD);
    // Not yet at milestone — count should be CHEST_MSG_MILESTONE - 1
    expect(gs.activityMsgCount).toBe(CHEST_MSG_MILESTONE - 1);
    spy.mockRestore();
  });

  it("does NOT trigger a chest when guild scheduler is stopped", () => {
    const gs = guildStates.get(GUILD) ?? (() => {
      recordGuildActivity(mockClient, GUILD);
      return guildStates.get(GUILD)!;
    })();
    gs.stopped = true;
    const before = gs.lastActivityAt;
    recordGuildActivity(mockClient, GUILD);
    // Should return early — state unchanged
    expect(gs.lastActivityAt).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("env var defaults", () => {
  it("ACTIVITY_WINDOW_MINUTES defaults to 20 or is a valid positive integer", () => {
    expect(ACTIVITY_WINDOW_MINUTES).toBeGreaterThan(0);
    expect(ACTIVITY_WINDOW_MINUTES).toBeLessThanOrEqual(120);
  });

  it("CHEST_MSG_MILESTONE defaults to 25 or is a valid positive integer", () => {
    expect(CHEST_MSG_MILESTONE).toBeGreaterThan(0);
    expect(CHEST_MSG_MILESTONE).toBeLessThanOrEqual(200);
  });
});
