import { describe, expect, it } from "vitest";
import { normalizeGameplayConfig } from "../gameplay-config";
import { buildDuelLeaderboard, duelPayout, eloDelta, simulateDuel, type Fighter } from "../duels";

const fighter = (over: Partial<Fighter>): Fighter => ({ id: "a", name: "Ana", maxHp: 100, atk: 10, def: 0, dodge: 0, crit: 0, ...over });

function seeded(seed: number) {
  let value = seed;
  return () => { value = (value * 1_103_515_245 + 12_345) % 2 ** 31; return value / 2 ** 31; };
}

describe("a duel", () => {
  it("is won by the much stronger fighter", () => {
    let wins = 0;
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = simulateDuel(fighter({ id: "a", atk: 60, maxHp: 300 }), fighter({ id: "b", name: "Bob", atk: 5, maxHp: 120 }), seeded(seed));
      if (result.winner.id === "a") wins += 1;
    }
    expect(wins).toBeGreaterThanOrEqual(48);
  });
  it("ends when someone falls, within 12 rounds, and logs the blows", () => {
    const result = simulateDuel(fighter({ id: "a" }), fighter({ id: "b", name: "Bob" }), seeded(7));
    expect(result.rounds.length).toBeGreaterThan(0);
    expect(result.rounds.length).toBeLessThanOrEqual(24);
    expect(result.rounds[0]).toContain("Runda 1.");
    expect([result.winner.id, result.loser.id].sort()).toEqual(["a", "b"]);
  });
  it("gives more rating for beating a better player, and pays the pot minus the tax", () => {
    expect(eloDelta(1_000, 1_000)).toBe(16);
    expect(eloDelta(1_000, 1_400)).toBeGreaterThan(eloDelta(1_400, 1_000));
    expect(duelPayout(1_000, 5)).toBe(1_900);
    expect(duelPayout(1_000, 0)).toBe(2_000);
  });
  it("lists the board", () => {
    expect(buildDuelLeaderboard([{ discordId: "9", rating: 1_032, wins: 2, losses: 0 }]).toJSON().description).toContain("🥇 <@9> — **1032** · 2V / 0Î");
    expect(buildDuelLeaderboard([]).toJSON().description).toContain("/duel");
  });
  it("keeps only valid settings", () => {
    expect(normalizeGameplayConfig({ duels: { maxBet: -1, taxPercent: 80, cooldownSeconds: 30 } }).duels)
      .toEqual({ enabled: true, maxBet: 5_000, cooldownSeconds: 30, taxPercent: 5 });
  });
});
