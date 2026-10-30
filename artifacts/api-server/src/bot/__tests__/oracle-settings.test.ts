import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  loadOracleSettings: vi.fn(async () => null),
  saveOracleSettings: vi.fn(async () => undefined),
}));

import {
  DEFAULT_ORACLE_SETTINGS, localDayAndHour, normalizeOracleSettings, oracleChatAllowedIn, oracleStyleInstruction, prophecyUsesLeft,
  recordProphecyUse,
} from "../oracle-settings";

describe("the Oracle's settings", () => {
  it("keep the previous behaviour for a server that never chose them", () => {
    const settings = normalizeOracleSettings(null);
    expect(settings.enabled).toBe(true);
    expect(settings.chat).toMatchObject({ channelIds: [], replyToReplies: true, tone: "implicit", length: "mediu" });
    expect(settings.prophecy).toMatchObject({ commandEnabled: true, daily: { enabled: false } });
    expect(oracleStyleInstruction(settings)).toBeNull();
  });

  it("drop what the bot cannot use", () => {
    const settings = normalizeOracleSettings({
      enabled: false,
      chat: { channelIds: ["123456789", "x", "123456789"], tone: "furios", length: "lung", cooldownSeconds: 99_999 },
      prophecy: { dailyLimit: 0, daily: { enabled: true, channelId: "nu", hour: 25, timeZone: "Mars/Olympus" } },
    });
    expect(settings.enabled).toBe(false);
    expect(settings.chat).toMatchObject({ channelIds: ["123456789"], tone: "implicit", length: "lung", cooldownSeconds: DEFAULT_ORACLE_SETTINGS.chat.cooldownSeconds });
    expect(settings.prophecy.dailyLimit).toBe(DEFAULT_ORACLE_SETTINGS.prophecy.dailyLimit);
    expect(settings.prophecy.daily).toMatchObject({ enabled: true, channelId: "", hour: 9, timeZone: "Europe/Bucharest" });
  });

  it("answer only in the chosen channels, their categories and their threads", () => {
    const settings = normalizeOracleSettings({ chat: { channelIds: ["111111111"] } });
    expect(oracleChatAllowedIn(settings, "111111111")).toBe(true);
    expect(oracleChatAllowedIn(settings, "222222222", "111111111")).toBe(true);
    expect(oracleChatAllowedIn(settings, "333333333", "222222222", "111111111")).toBe(true);
    expect(oracleChatAllowedIn(settings, "222222222", "444444444")).toBe(false);
    expect(oracleChatAllowedIn(DEFAULT_ORACLE_SETTINGS, "222222222")).toBe(true);
  });

  it("tell the model the chosen tone and length", () => {
    const style = oracleStyleInstruction(normalizeOracleSettings({ chat: { tone: "sobru", length: "scurt" } }));
    expect(style).toContain("sobru");
    expect(style).toContain("o singură propoziție");
  });

  it("count personal prophecies per member and per local day", () => {
    const settings = normalizeOracleSettings({ prophecy: { dailyLimit: 2, daily: { timeZone: "Europe/Bucharest" } } });
    const morning = new Date("2026-10-30T08:00:00Z");
    expect(prophecyUsesLeft("900000001", "1", settings, morning)).toBe(2);
    recordProphecyUse("900000001", "1", settings, morning);
    recordProphecyUse("900000001", "1", settings, morning);
    expect(prophecyUsesLeft("900000001", "1", settings, morning)).toBe(0);
    expect(prophecyUsesLeft("900000002", "1", settings, morning)).toBe(2);
    // 23:30 UTC is already the next day in Bucharest.
    expect(prophecyUsesLeft("900000001", "1", settings, new Date("2026-10-30T23:30:00Z"))).toBe(2);
  });

  it("read the local day and hour in a time zone", () => {
    expect(localDayAndHour(new Date("2026-10-30T22:30:00Z"), "Europe/Bucharest")).toEqual({ day: "2026-10-31", hour: 0 });
    expect(localDayAndHour(new Date("2026-10-30T22:30:00Z"), "UTC")).toEqual({ day: "2026-10-30", hour: 22 });
  });
});
