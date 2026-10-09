import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  pool: { connect: mocks.connect, query: mocks.poolQuery },
  playersTable: {},
  playerItemsTable: {},
  activeEventsTable: {},
  eventParticipantsTable: {},
  eventClaimsTable: {},
  botStateTable: {},
  activeBossesTable: {},
  playerTalismansTable: {},
  playerDailyQuestsTable: {},
}));

import { incrementDailyQuest } from "../db";

const reward = { itemKey: "inima_abisului", qty: 1 };

describe("daily quest reward transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockReset();
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("RETURNING progress")) return { rows: [{ progress: 1, completed: true }] };
      if (sql.includes("SET reward_given = true")) return { rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
  });

  it("commits the independent quest claim and item together", async () => {
    expect(await incrementDailyQuest("alice", "guild-a", "kill_boss_rare", 1, reward))
      .toEqual({ newProgress: 1, justCompleted: true });
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("ON CONFLICT (discord_id, guild_id, quest_key)");
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([
      "alice", "guild-a", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 1, "kill_boss_rare",
    ]);
    expect(mocks.query.mock.calls[2]?.[1]?.[3]).toBe("kill_boss_rare");
    expect(statements[3]).toContain("INSERT INTO player_items");
    expect(mocks.query.mock.calls[3]?.[1]).toEqual(["alice", "guild-a", "inima_abisului", 1]);
    expect(statements[4]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("does not add an item when another call already claimed today's reward", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("RETURNING progress")) return { rows: [{ progress: 1, completed: true }] };
      return { rowCount: 0 };
    });
    expect(await incrementDailyQuest("alice", "guild-a", "kill_boss_rare", 1, reward))
      .toEqual({ newProgress: 1, justCompleted: false });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO player_items"))).toBe(false);
    expect(mocks.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rolls back the claim when inventory writing fails, allowing a retry", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("RETURNING progress")) return { rows: [{ progress: 1, completed: true }] };
      if (sql.includes("INSERT INTO player_items")) throw new Error("inventory failed");
      return { rowCount: 1 };
    });
    await expect(incrementDailyQuest("alice", "guild-a", "kill_boss_rare", 1, reward))
      .rejects.toThrow("inventory failed");
    expect(mocks.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.query).not.toHaveBeenCalledWith("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not grant a reward before reaching the quest target", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("RETURNING progress")) return { rows: [{ progress: 1, completed: false }] };
      return { rowCount: 1 };
    });
    expect(await incrementDailyQuest("alice", "guild-a", "other_quest", 3, reward))
      .toEqual({ newProgress: 1, justCompleted: false });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("SET reward_given"))).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO player_items"))).toBe(false);
  });
});
