import { describe, expect, it } from "vitest";
import { normalizeGameplayConfig, DEFAULT_GAMEPLAY_CONFIG } from "../gameplay-config";
import { SEASON_POINTS, buildSeasonEmbed, previousSeasonKey, seasonEndsAt, seasonKey, seasonName, seasonWinners } from "../seasons";

describe("seasons", () => {
  it("follow the calendar months in UTC", () => {
    expect(seasonKey(new Date("2026-10-31T23:59:00Z"))).toBe("2026-10");
    expect(previousSeasonKey(new Date("2026-11-01T00:10:00Z"))).toBe("2026-10");
    expect(previousSeasonKey(new Date("2027-01-03T00:00:00Z"))).toBe("2026-12");
    expect(seasonEndsAt(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("have a name, with October and December themed", () => {
    expect(seasonName("2026-10")).toBe("Sezonul Dovlecilor de Cenușă 2026");
    expect(seasonName("2026-12")).toBe("Sezonul Zăpezii de Cenușă 2026");
    expect(seasonName("2027-03")).toBe("Sezonul de Martie 2027");
  });
  it("give no points for messages, so chatting cannot win a season", () => {
    expect(SEASON_POINTS.messages).toBe(0);
    expect(SEASON_POINTS.bosses).toBeGreaterThan(SEASON_POINTS.kills);
  });
  it("reward the top three with Oboli and a title", () => {
    const top = [1, 2, 3, 4].map((rank) => ({ discordId: `10000000000000000${rank}`, points: 100 - rank, rank }));
    const winners = seasonWinners("2026-11", top, DEFAULT_GAMEPLAY_CONFIG.seasons);
    expect(winners.map((winner) => [winner.rank, winner.gold])).toEqual([[1, 10_000], [2, 5_000], [3, 2_500]]);
    expect(winners[0]!.title).toBe("Campionul Sezonului de Noiembrie 2026");
    expect(winners[2]!.title).toBe("Bronzul Sezonului de Noiembrie 2026");
  });
  it("show the top, your place and the prizes", () => {
    const card = buildSeasonEmbed("2026-11", [{ discordId: "1", points: 1200, rank: 1 }], { discordId: "2", points: 30, rank: 7 }, DEFAULT_GAMEPLAY_CONFIG.seasons, new Date("2026-12-01T00:00:00Z")).toJSON();
    expect(card.description).toContain("🥇 <@1> — **1.200** puncte");
    expect(JSON.stringify(card.fields)).toContain("**7** · 30 puncte");
    expect(JSON.stringify(card.fields)).toContain("10.000 Oboli");
  });
  it("keep only valid settings", () => {
    expect(normalizeGameplayConfig({ seasons: { enabled: false, rewards: [1, -5, "x"], roleIds: ["123456", "nu"], channelId: "999999" } }).seasons)
      .toEqual({ enabled: false, rewards: [1, 5_000, 2_500], roleIds: ["123456", "", ""], channelId: "999999" });
  });
});
