import { describe, expect, test } from "bun:test";
import { DEFAULT_ORACLE_SETTINGS, normalizeOracleSettings } from "../oracle-settings";
import { ORACLE_QUESTIONS, isDailyQuestionDue, questionForDay } from "../oracle-question";

const on = (patch: Record<string, unknown> = {}) => normalizeOracleSettings({
  community: { dailyQuestion: { enabled: true, channelId: "123456789012345678", hour: 18, timeZone: "UTC", ...patch } },
});

describe("întrebarea zilei", () => {
  test("implicit e oprită", () => {
    expect(DEFAULT_ORACLE_SETTINGS.community.dailyQuestion.enabled).toBe(false);
    expect(normalizeOracleSettings({}).community.dailyQuestion.enabled).toBe(false);
  });
  test("setările proaste se curăță", () => {
    const q = normalizeOracleSettings({ community: { dailyQuestion: { enabled: true, channelId: "x", hour: 99, timeZone: "Nu/Exista", ownQuestions: [" a ", "", 5, "b".repeat(400)] } } }).community.dailyQuestion;
    expect(q).toMatchObject({ channelId: "", hour: 18, timeZone: "Europe/Bucharest" });
    expect(q.ownQuestions).toEqual(["a", "b".repeat(300)]);
  });
  test("e scadentă o dată pe zi, la ora aleasă", () => {
    const at = new Date("2026-11-05T18:10:00Z");
    expect(isDailyQuestionDue(on(), null, at)).toEqual({ due: true, day: "2026-11-05" });
    expect(isDailyQuestionDue(on(), "2026-11-05", at).due).toBe(false);
    expect(isDailyQuestionDue(on(), null, new Date("2026-11-05T17:59:00Z")).due).toBe(false);
    expect(isDailyQuestionDue(on({ channelId: "" }), null, at).due).toBe(false);
    expect(isDailyQuestionDue({ ...on(), enabled: false }, null, at).due).toBe(false);
  });
  test("aceeași întrebare toată ziua, din lista serverului dacă e aleasă", () => {
    expect(questionForDay(on(), "2026-11-05")).toBe(questionForDay(on(), "2026-11-05"));
    expect(ORACLE_QUESTIONS).toContain(questionForDay(on(), "2026-11-05"));
    expect(questionForDay(on({ useOwnQuestions: true, ownQuestions: ["Una singură?"] }), "2026-11-06")).toBe("Una singură?");
  });
});
