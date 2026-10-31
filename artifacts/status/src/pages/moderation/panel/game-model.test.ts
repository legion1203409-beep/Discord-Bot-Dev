import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  changedGameParts, progressOf, streakLadder, economyOf, eventsOf, eventsPerDay, gameDraftError, gameModuleForRoute, gameModuleSummary, isValidMultiplier, minutesText, missionOf,
} from "./game-model";

const config = (gameplayConfig: Record<string, unknown> = {}, channels: Record<string, string> = {}) => ({ channels, gameplayConfig: { paused: false, messages: { gamePaused: "Oprit." }, ...gameplayConfig } });

describe("the game page", () => {
  it("opens one module per route and is one wide page", () => {
    expect(gameModuleForRoute("/joc").id).toBe("state");
    expect(gameModuleForRoute("/joc/economie/").id).toBe("economy");
    expect(panelGroupRoute("/joc/misiuni")).toBe("/joc");
    expect(isWidePanelRoute("/joc/canale")).toBe(true);
  });

  it("marks only the modules whose settings changed", () => {
    const saved = config();
    const draft = { ...saved, channels: { event: "123456" } };
    expect(changedGameParts(saved, draft).map((part) => part.key)).toEqual(["channels"]);
    // Pausing goes through its own route at once, so it never marks the draft.
    const paused = { ...saved, gameplayConfig: { ...saved.gameplayConfig, paused: true } };
    expect(changedGameParts(saved, paused)).toEqual([]);
    const message = { ...saved, gameplayConfig: { ...saved.gameplayConfig, messages: { gamePaused: "Altceva." } } };
    expect(changedGameParts(saved, message).map((part) => part.key)).toEqual(["state"]);
  });

  it("sums up each module in the menu", () => {
    expect(gameModuleSummary("state", config({ paused: true }))).toBe("Jocul e oprit");
    expect(gameModuleSummary("channels", config({}, { event: "123456", boss: "234567" }))).toBe("2 din 8 canale alese");
    expect(gameModuleSummary("economy", config())).toBe("Valorile de bază");
    expect(gameModuleSummary("economy", config({ economy: { monsterGoldMultiplier: 2, monsterXpMultiplier: 1, bossGoldMultiplier: 1, bossXpMultiplier: 1.5 } }))).toBe("2× · 1× · 1× · 1,5×");
    expect(gameModuleSummary("missions", config())).toBe("10 · 3 · 1");
  });
});

describe("events", () => {
  it("fills the defaults and estimates how many events a day holds", () => {
    const events = eventsOf(config());
    expect(events.eventDurationMinutes).toBe(60);
    // 60 min + an average pause of 65 min → 1440 / 125 ≈ 11.5 a day.
    expect(eventsPerDay(events)).toEqual({ shadowHour: 11.5, dragon: 13.7, chests: 24 });
  });
  it("writes minutes in words", () => {
    expect(minutesText(1)).toBe("1 minut");
    expect(minutesText(45)).toBe("45 de minute");
    expect(minutesText(7)).toBe("7 minute");
    expect(minutesText(90)).toBe("1 oră și 30 de minute");
    expect(minutesText(120)).toBe("2 ore");
  });
});

describe("checks before saving", () => {
  it("accepts the defaults", () => {
    expect(gameDraftError(config())).toBeNull();
  });
  it("refuses what the server refuses", () => {
    expect(gameDraftError(config({ messages: { gamePaused: " " } }))).toContain("nu poate fi gol");
    expect(gameDraftError(config({}, { boss: "nu-e-id" }))).toContain("Dragonul Stins");
    expect(gameDraftError(config({ events: { eventDurationMinutes: 0 } }))).toContain("între 1 și 1440");
    expect(gameDraftError(config({ events: { chestExpireMinutes: 121 } }))).toContain("între 1 și 120");
    expect(gameDraftError(config({ events: { eventCooldownMinMinutes: 50, eventCooldownMaxMinutes: 20 } }))).toContain("pauza maximă");
    expect(gameDraftError(config({ events: { standaloneBossIntervalMinMinutes: 50, standaloneBossIntervalMaxMinutes: 20 } }))).toContain("intervalul maxim");
    expect(gameDraftError(config({ missions: { kill_10: { target: 0, rewardQty: 1 } } }))).toContain("ținta");
    expect(gameDraftError(config({ missions: { rare_3: { target: 3, rewardQty: 101 } } }))).toContain("recompensa");
    expect(gameDraftError(config({ economy: { monsterGoldMultiplier: 11 } }))).toContain("Oboli de la monștri");
    expect(gameDraftError(config({ economy: { bossXpMultiplier: Number.NaN } }))).toContain("XP de la boși");
  });
  it("reads missions and multipliers with their defaults", () => {
    expect(missionOf(config(), "rare_3")).toEqual({ target: 3, rewardQty: 2 });
    expect(economyOf(config()).bossGoldMultiplier).toBe(1);
    expect(isValidMultiplier(0.1)).toBe(true);
    expect(isValidMultiplier(0.05)).toBe(false);
  });
});

describe("streak and achievements", () => {
  it("reads the defaults and shows the bonus on each day like the bot", () => {
    expect(progressOf(config())).toMatchObject({ streakEnabled: true, streakBonusPercent: 10, streakMaxDays: 7 });
    expect(streakLadder({ streakBonusPercent: 10, streakMaxDays: 7 })).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(streakLadder({ streakBonusPercent: 15, streakMaxDays: 3 })).toEqual([0, 15, 30, 30, 30, 30, 30]);
    expect(gameModuleSummary("progress", config())).toBe("serie până la +60% · realizări");
    expect(gameModuleSummary("progress", config({ progress: { streakEnabled: false, achievementsEnabled: false } }))).toBe("Oprite");
  });
  it("refuses a bonus or a cap the server refuses", () => {
    expect(gameDraftError(config({ progress: { streakBonusPercent: 101 } }))).toContain("Bonusul pe zi");
    expect(gameDraftError(config({ progress: { streakMaxDays: 0 } }))).toContain("până în ziua");
  });
});

describe("seasons", () => {
  it("read the defaults, sum up and refuse bad prizes", async () => {
    const { seasonsOf } = await import("./game-model");
    expect(seasonsOf(config())).toEqual({ enabled: true, rewards: [10_000, 5_000, 2_500], roleIds: ["", "", ""], channelId: "" });
    expect(gameModuleSummary("seasons", config())).toBe("🥇 10.000 Oboli");
    expect(gameModuleSummary("seasons", config({ seasons: { enabled: false } }))).toBe("Oprite");
    expect(gameDraftError(config({ seasons: { enabled: true, rewards: [-1, 0, 0], roleIds: ["", "", ""], channelId: "" } }))).toContain("Locul 1");
    expect(gameDraftError(config({ seasons: { enabled: true, rewards: [1, 1, 1], roleIds: ["", "x", ""], channelId: "" } }))).toContain("Locul 2");
  });
});

describe("the weekly raid", () => {
  it("describes its window and refuses bad values", async () => {
    const { raidOf, raidWindowText } = await import("./game-model");
    expect(raidOf(config()).weekday).toBe(6);
    expect(raidWindowText({ weekday: 6, hour: 18, durationHours: 48 })).toBe("Sâmbătă 18:00 → luni 18:00");
    expect(raidWindowText({ weekday: 7, hour: 20, durationHours: 6 })).toBe("Duminică 20:00 → luni 02:00");
    expect(gameModuleSummary("raid", config({ raid: { enabled: false } }))).toBe("Oprit");
    expect(gameDraftError(config({ raid: { hour: 24 } }))).toContain("Ora");
    expect(gameDraftError(config({ raid: { hpPerPlayer: 10 } }))).toContain("Viață pe jucător");
  });
});
