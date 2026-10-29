import { describe, expect, it } from "vitest";
import {
  AI_CATEGORIES, aiCategoryHasOwnActions, aiCategoryRule, aiCategorySummary, aiDraftError, aiEnabledCategoryCount, aiOnlyRecords,
  isDiscordId, setAiCategoryOwn, setAiCategorySensitivity, setAiCategoryTicks,
} from "./ai-model";
import { toggleTick } from "./model";

const general = () => ({
  enabled: true, sensitivity: "medium", action: "mute", deleteMessage: true, warnMember: true, muteMinutes: 120,
  categories: { toxicity: true, threats: true, scams: false },
  categorySettings: {} as Record<string, any>,
});

describe("what an AI category does", () => {
  it("follows the general ticks until it has its own", () => {
    const ai = general();
    expect(aiCategoryHasOwnActions(ai, "toxicity")).toBe(false);
    expect(aiCategoryRule(ai, "toxicity")).toEqual({ action: "mute", deleteMessage: true, warnMember: true, muteMinutes: 120 });
  });

  it("keeps following the general ticks when only its sensitivity is its own", () => {
    const ai = setAiCategorySensitivity(general(), "toxicity", "high");
    expect(ai.categorySettings.toxicity).toEqual({ sensitivity: "high" });
    expect(aiCategoryHasOwnActions(ai, "toxicity")).toBe(false);
    expect(aiCategoryRule(ai, "toxicity")).toEqual(aiCategoryRule(general(), "toxicity"));
  });

  it("reads categories saved before the extra ticks existed like the bot does", () => {
    const ai = { action: "warn", deleteMessage: true, categorySettings: { attacks: { action: "kick" }, scams: { deleteMessage: false } } };
    expect(aiCategoryRule(ai, "attacks")).toEqual({ action: "kick", deleteMessage: true });
    expect(aiCategoryRule(ai, "scams")).toEqual({ action: "warn", deleteMessage: false });
    expect(aiCategoryRule(ai, "bullying")).toEqual({ action: "warn", deleteMessage: true });
    expect(aiCategoryRule({}, "bullying")).toEqual({ action: "none", deleteMessage: false });
  });

  it("starts its own ticks from exactly what it did, so switching changes nothing yet", () => {
    const own = setAiCategoryOwn(general(), "threats", true);
    expect(aiCategoryHasOwnActions(own, "threats")).toBe(true);
    expect(own.categorySettings.threats).toEqual({ action: "mute", deleteMessage: true, warnMember: true, muteMinutes: 120 });
    expect(aiCategoryRule(own, "threats")).toEqual(aiCategoryRule(general(), "threats"));
    // The other categories still follow the general ticks.
    expect(aiCategoryHasOwnActions(own, "toxicity")).toBe(false);
  });

  it("then uses only what is ticked in it, while the general ticks keep changing for the others", () => {
    let ai: Record<string, any> = setAiCategoryOwn(general(), "threats", true);
    ai = setAiCategoryTicks(ai, "threats", toggleTick(aiCategoryRule(ai, "threats"), "ban", true, "message"));
    ai = setAiCategoryTicks(ai, "threats", toggleTick(aiCategoryRule(ai, "threats"), "alert", true, "message"));
    ai = { ...ai, warnMember: false, alertStaff: false };
    expect(aiCategoryRule(ai, "threats")).toEqual({ action: "ban", deleteMessage: true, warnMember: true, alertStaff: true, muteMinutes: 120 });
    expect(aiCategoryRule(ai, "toxicity")).toEqual({ action: "mute", deleteMessage: true, muteMinutes: 120 });
  });

  it("keeps its own choice of not deleting even when the general ticks delete", () => {
    let ai = setAiCategoryOwn(general(), "threats", true);
    ai = setAiCategoryTicks(ai, "threats", toggleTick(aiCategoryRule(ai, "threats"), "delete", false, "message"));
    expect(ai.categorySettings.threats.deleteMessage).toBe(false);
    expect(aiCategoryRule(ai, "threats").deleteMessage).toBe(false);
    expect(aiCategoryHasOwnActions(ai, "threats")).toBe(true);
  });

  it("goes back to the general ticks and keeps its own sensitivity", () => {
    let ai = setAiCategorySensitivity(general(), "threats", "low");
    ai = setAiCategoryOwn(ai, "threats", true);
    ai = setAiCategoryOwn(ai, "threats", false);
    expect(ai.categorySettings.threats).toEqual({ sensitivity: "low" });
    ai = setAiCategorySensitivity(ai, "threats", "inherit");
    expect(ai.categorySettings).not.toHaveProperty("threats");
  });

  it("does not change the settings it was given", () => {
    const ai = general();
    setAiCategoryOwn(ai, "threats", true);
    setAiCategorySensitivity(ai, "threats", "high");
    expect(ai.categorySettings).toEqual({});
  });
});

describe("summaries", () => {
  it("counts the categories that are on", () => {
    expect(aiEnabledCategoryCount(general())).toBe(2);
    expect(aiEnabledCategoryCount({})).toBe(0);
    expect(AI_CATEGORIES).toHaveLength(9);
  });

  it("describes a category in one line", () => {
    const ai = setAiCategorySensitivity(general(), "threats", "high");
    expect(aiCategorySummary(ai, "scams")).toBe("Oprită");
    expect(aiCategorySummary(ai, "toxicity")).toBe("Ca setările generale: Șterge mesajul + Avertisment + Mute 2 ore");
    expect(aiCategorySummary(ai, "threats")).toBe("Sensibilitate ridicată · Ca setările generale: Șterge mesajul + Avertisment + Mute 2 ore");
    const own = setAiCategoryTicks(setAiCategoryOwn(ai, "threats", true), "threats", { action: "ban", deleteMessage: false });
    expect(aiCategorySummary(own, "threats")).toBe("Sensibilitate ridicată · Ban");
  });

  it("knows when the enabled categories only record what they find", () => {
    expect(aiOnlyRecords(general())).toBe(false);
    expect(aiOnlyRecords({ action: "none", categories: { toxicity: true } })).toBe(true);
    expect(aiOnlyRecords({ action: "none", categories: { toxicity: true }, categorySettings: { toxicity: { action: "warn" } } })).toBe(false);
  });
});

describe("checks before saving", () => {
  it("accepts valid settings and skips them when the AI is not being saved", () => {
    expect(aiDraftError({ ai: general() })).toBeNull();
    expect(aiDraftError({ ai: { muteMinutes: 0 } }, ["protection.enabled"])).toBeNull();
  });

  it("names the mute length that Discord would refuse", () => {
    expect(aiDraftError({ ai: { muteMinutes: 0 } })).toMatch(/^Judecătorul AI — Durata mute-ului/);
    expect(aiDraftError({ ai: { categorySettings: { threats: { muteMinutes: 50_000 } } } })).toMatch(/^Amenințări — Durata mute-ului/);
  });

  it("refuses exceptions that are not Discord IDs or are too many", () => {
    expect(aiDraftError({ ai: { excludedChannelIds: ["123456789012345678", "abc"] } })).toMatch(/Canale exceptate: „abc”/);
    expect(aiDraftError({ ai: { excludedRoleIds: Array.from({ length: 101 }, (_, index) => String(100000 + index)) } })).toMatch(/Roluri exceptate: cel mult 100/);
    expect(isDiscordId("123456789012345678")).toBe(true);
    expect(isDiscordId("1234")).toBe(false);
    expect(isDiscordId("12345678901234567890123456")).toBe(false);
  });
});
