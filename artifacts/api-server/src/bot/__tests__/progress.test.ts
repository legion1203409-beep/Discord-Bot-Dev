import { describe, expect, it } from "vitest";
import { normalizeGameplayConfig, DEFAULT_GAMEPLAY_CONFIG } from "../gameplay-config";
import { ACHIEVEMENTS, buildAchievementsEmbed, newlyReached, nextStreak, profileProgressLine, streakBonusPercent, unseenLine } from "../progress";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const counters = { kills: 0, bosses: 0, quests: 0, keys: 0, messages: 0, chests: 0 };

describe("the daily streak", () => {
  it("grows on the next day, stays the same day and starts again after a gap", () => {
    expect(nextStreak({ streak: 3, lastDay: "2026-10-30" }, day("2026-10-31"))).toEqual({ streak: 4, restarted: false, sameDay: false });
    expect(nextStreak({ streak: 3, lastDay: "2026-10-31" }, day("2026-10-31"))).toEqual({ streak: 3, restarted: false, sameDay: true });
    expect(nextStreak({ streak: 5, lastDay: "2026-10-28" }, day("2026-10-31"))).toEqual({ streak: 1, restarted: true, sameDay: false });
    expect(nextStreak({ streak: 0, lastDay: null }, day("2026-10-31"))).toEqual({ streak: 1, restarted: false, sameDay: false });
  });
  it("adds the bonus from the second day, up to the cap", () => {
    const settings = { streakBonusPercent: 10, streakMaxDays: 7 };
    expect(streakBonusPercent(1, settings)).toBe(0);
    expect(streakBonusPercent(2, settings)).toBe(10);
    expect(streakBonusPercent(7, settings)).toBe(60);
    expect(streakBonusPercent(40, settings)).toBe(60);
    expect(streakBonusPercent(5, { streakBonusPercent: 0, streakMaxDays: 7 })).toBe(0);
  });
});

describe("achievements", () => {
  it("are reached by the lifetime counters and the best streak, once", () => {
    const reached = newlyReached({ counters: { ...counters, kills: 120, bosses: 10 }, achievements: {}, bestStreak: 7 });
    expect(reached.map((achievement) => achievement.key)).toEqual(["kills_100", "bosses_10", "streak_7"]);
    expect(newlyReached({ counters: { ...counters, kills: 120 }, achievements: { kills_100: "2026-10-01" }, bestStreak: 0 })).toEqual([]);
  });
  it("have unique keys, a reward and steps that grow", () => {
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.key)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every((achievement) => achievement.reward > 0 && achievement.target > 0)).toBe(true);
  });
  it("show on the card, the profile and the next reply", () => {
    const progress = { streak: 4, bestStreak: 9, lastDay: "2026-10-31", counters: { ...counters, kills: 50 }, achievements: { streak_7: "2026-10-20T10:00:00Z" }, unseen: [] };
    const card = buildAchievementsEmbed("Ana", progress).toJSON();
    expect(card.title).toContain("Ana");
    expect(card.description).toContain("O Săptămână de Foc");
    expect(card.description).toContain("50/100");
    expect(JSON.stringify(card.fields)).toContain("+30% la cufăr");
    expect(profileProgressLine(progress)).toBe("🔥 Serie: **4** zile · 🏅 **1/15** realizări 🔥");
    expect(unseenLine([ACHIEVEMENTS[0]!])).toContain("Prima Vânătoare (+300 Oboli)");
  });
});

describe("the settings", () => {
  it("default to on with 10% a day for up to 7 days and keep only valid values", () => {
    expect(normalizeGameplayConfig({}).progress).toEqual(DEFAULT_GAMEPLAY_CONFIG.progress);
    expect(normalizeGameplayConfig({ progress: { streakEnabled: false, streakBonusPercent: 25, streakMaxDays: 14, weeklyKey: false } }).progress)
      .toMatchObject({ streakEnabled: false, streakBonusPercent: 25, streakMaxDays: 14, weeklyKey: false, achievementsEnabled: true });
    expect(normalizeGameplayConfig({ progress: { streakBonusPercent: 500, streakMaxDays: 0 } }).progress).toMatchObject({ streakBonusPercent: 10, streakMaxDays: 7 });
  });
});

describe("the panel's list of achievements", () => {
  it("names every achievement with its reward, as the bot gives it", async () => {
    const { readFileSync } = await import("node:fs");
    const panel = readFileSync(new URL("../../../../status/src/pages/moderation/panel/game-model.ts", import.meta.url), "utf8");
    for (const achievement of ACHIEVEMENTS) {
      expect(panel).toContain(`name: "${achievement.name}"`);
      expect(panel).toContain(`reward: ${achievement.reward.toLocaleString("en-US").replaceAll(",", "_")}`);
    }
  });
});
