import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPoolQuery } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  pool: { query: mockPoolQuery },
  playersTable: {},
  activeEventsTable: {},
  eventParticipantsTable: {},
  eventClaimsTable: {},
  botStateTable: {},
  activeBossesTable: {},
  playerItemsTable: {},
  playerTalismansTable: {},
  playerDailyQuestsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  gt: vi.fn(),
  lt: vi.fn(),
  inArray: vi.fn(),
  sql: Object.assign(vi.fn(), { empty: "" }),
  desc: vi.fn(),
}));

vi.mock("../survival", () => ({
  CLASSES: {},
  isClassKey: vi.fn(),
  classStats: vi.fn(),
  classPowerLevel: vi.fn(),
  isClassPowerSlot: vi.fn(),
  isEquipmentKey: vi.fn(),
  equipmentSlot: vi.fn(),
  equipmentStats: vi.fn(),
  equipmentLevel: vi.fn(),
  rollRarity: vi.fn(),
  isCompanionKey: vi.fn(),
  companionStats: vi.fn(),
  prestigeStartLevel: vi.fn(),
  monsterSpawnHp: vi.fn(),
  ABILITY_BUY_COST: 0,
  UPGRADE_BASE_COST: 0,
  UPGRADE_COST_GROWTH: 0,
  UPGRADE_XP_COST: 0,
}));

vi.mock("../message-media", () => ({
  normalizeMessageImageUrl: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  hasProcessedMessageTranslation,
  markMessageTranslationProcessed,
} from "../db";

describe("persistent message translation deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("looks up completed message IDs using a guild-specific key", async () => {
    mockPoolQuery.mockImplementation(async (query: string) => {
      if (query.startsWith("SELECT value FROM bot_state")) {
        return { rows: [{ value: '["message-1"]' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(hasProcessedMessageTranslation("guild-a", "message-1")).resolves.toBe(true);
    expect(mockPoolQuery).toHaveBeenLastCalledWith(
      "SELECT value FROM bot_state WHERE key = $1",
      ["guild-a:message_translation_processed"],
    );
  });

  it("stores IDs in a bounded per-guild record for restart deduplication", async () => {
    await markMessageTranslationProcessed("guild-b", "message-2");

    expect(mockPoolQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("jsonb_array_elements_text"),
      ["guild-b:message_translation_processed", "message-2", 2_000],
    );
    expect(mockPoolQuery.mock.calls.at(-1)?.[0]).toContain("ON CONFLICT (key) DO UPDATE");
  });
});
