import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ incrementDailyQuest: vi.fn() }));

import { incrementDailyQuest } from "../db";
import { awardRareBossDailyQuest } from "../boss-daily-quest";

const increment = vi.mocked(incrementDailyQuest);

describe("rare boss daily quest after defeat", () => {
  beforeEach(() => {
    increment.mockReset();
    increment.mockResolvedValue({ newProgress: 1, justCompleted: true });
  });

  it.each(["epic", "legendar"] as const)("rewards every fighter on a %s defeat, not just the final hitter", async (rarity) => {
    const winners = await awardRareBossDailyQuest(
      "guild-a", rarity, new Map([["alice", 100], ["bob", 1], ["spectator", 0]]),
    );
    expect(winners).toEqual(["alice", "bob"]);
    expect(increment).toHaveBeenCalledTimes(2);
    for (const id of winners) {
      expect(increment).toHaveBeenCalledWith(
        id, "guild-a", "kill_boss_rare", 1, { itemKey: "inima_abisului", qty: 1 },
      );
    }
  });

  it.each(["comun", "rar"] as const)("does not advance the quest for a %s boss", async (rarity) => {
    expect(await awardRareBossDailyQuest("guild-a", rarity, new Map([["alice", 100]]))).toEqual([]);
    expect(increment).not.toHaveBeenCalled();
  });

  it("does not announce a second reward when the daily claim was already taken", async () => {
    increment.mockResolvedValue({ newProgress: 1, justCompleted: false });
    expect(await awardRareBossDailyQuest("guild-a", "epic", new Map([["alice", 100]]))).toEqual([]);
  });

  it("uses the boss guild without changing the other daily quest keys", async () => {
    await awardRareBossDailyQuest("guild-b", "legendar", new Map([["alice", 5]]));
    expect(increment.mock.calls[0]?.slice(0, 4)).toEqual(["alice", "guild-b", "kill_boss_rare", 1]);
  });

  it("fails explicitly if the reward transaction fails", async () => {
    increment.mockRejectedValue(new Error("inventory unavailable"));
    await expect(awardRareBossDailyQuest("guild-a", "epic", new Map([["alice", 1]])))
      .rejects.toThrow("inventory unavailable");
  });
});
