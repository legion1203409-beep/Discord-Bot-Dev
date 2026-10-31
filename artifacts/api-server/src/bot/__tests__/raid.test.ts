import { describe, expect, it } from "vitest";
import { DEFAULT_GAMEPLAY_CONFIG, normalizeGameplayConfig } from "../gameplay-config";
import { buildRaidEmbed, isRaidTime, localParts, raidDamage, raidMaxHp, raidRewards, titanFor } from "../raid";

const settings = DEFAULT_GAMEPLAY_CONFIG.raid;

describe("the raid's schedule", () => {
  it("reads the day and hour in Romania's time", () => {
    // 31 Oct 2026 is a Saturday; 16:00 UTC is 18:00 in Bucharest (winter time).
    expect(localParts(new Date("2026-10-31T16:00:00Z"))).toMatchObject({ weekday: 6, hour: 18 });
    expect(localParts(new Date("2026-11-02T08:00:00Z")).isoWeek).toBe("2026-W45");
  });
  it("runs from Saturday 18:00 for 48 hours by default", () => {
    expect(isRaidTime(new Date("2026-10-31T15:59:00Z"), settings)).toBe(false);
    expect(isRaidTime(new Date("2026-10-31T16:00:00Z"), settings)).toBe(true);
    expect(isRaidTime(new Date("2026-11-01T21:00:00Z"), settings)).toBe(true);
    expect(isRaidTime(new Date("2026-11-02T08:00:00Z"), settings)).toBe(false);
  });
  it("picks a titan per week and scales its health with the active players", () => {
    expect(titanFor("2026-W45").name).not.toBe(titanFor("2026-W46").name);
    expect(raidMaxHp(2, 15_000)).toBe(75_000);
    expect(raidMaxHp(40, 15_000)).toBe(600_000);
  });
});

describe("hits and the prize", () => {
  it("hits harder with more attack and doubles on a crit", () => {
    const always = () => 0;
    const weak = raidDamage({ atk: 0, crit: 0 }, () => 0.5);
    const strong = raidDamage({ atk: 50, crit: 0 }, () => 0.5);
    expect(strong.damage).toBeGreaterThan(weak.damage);
    const crit = raidDamage({ atk: 10, crit: 100 }, always);
    expect(crit.crit).toBe(true);
    expect(crit.damage).toBe(Math.round(80 * 0.85 * 2));
  });
  it("splits the pool by damage, gives keys to the top three and a quarter when the titan escapes", () => {
    const rows = [
      { discordId: "a", damage: 600, hits: 3 }, { discordId: "b", damage: 300, hits: 2 }, { discordId: "c", damage: 90, hits: 1 }, { discordId: "d", damage: 10, hits: 1 },
    ];
    const won = raidRewards(rows, true, { rewardPool: 10_000 });
    expect(won.map((row) => [row.discordId, row.gold, row.key])).toEqual([["a", 6_000, true], ["b", 3_000, true], ["c", 900, true], ["d", 200, false]]);
    const lost = raidRewards(rows, false, { rewardPool: 10_000 });
    expect(lost[0]!.gold).toBe(1_500);
    expect(lost.every((row) => !row.key)).toBe(true);
    expect(raidRewards([], true, { rewardPool: 10_000 })).toEqual([]);
  });
  it("shows health, the best fighters and the button state", () => {
    const raid = { id: 1, guildId: "1", titan: "Hidra Abisului", maxHp: 100_000, hp: 40_000, startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000), channelId: null, messageId: null, status: "open" as const, week: "2026-W45" };
    const card = buildRaidEmbed(raid, [{ discordId: "9", damage: 1234, hits: 2 }], settings).toJSON();
    expect(card.title).toContain("Hidra Abisului");
    expect(card.description).toContain("40.000 / 100.000");
    expect(JSON.stringify(card.fields)).toContain("1.234 daune");
  });
  it("keeps only valid settings", () => {
    expect(normalizeGameplayConfig({ raid: { weekday: 9, hour: 25, durationHours: 0, cooldownMinutes: 5, channelId: "nu" } }).raid)
      .toMatchObject({ weekday: 6, hour: 18, durationHours: 48, cooldownMinutes: 5, channelId: "" });
  });
});
