import { describe, expect, it } from "vitest";
import { isWidePanelRoute, panelGroupRoute } from "./model";
import {
  DEFAULT_ORACLE, DEFAULT_PAUSED_MESSAGE, ORACLE_MODULES, changedOracleParts, cooldownText, dayWord, isDailyHourNow, isOracleModuleChanged,
  isOracleModuleOn, isOracleRoute, nextDailyProphecy, oracleChannelOptions, oracleDraftError, oracleModuleForRoute, oracleModuleSummary,
  oracleOf, sampleAnswer, withOracle,
} from "./oracle-model";

const config = (oracle?: unknown) => ({
  ...(oracle === undefined ? {} : { oracle }),
  gameplayConfig: { messages: { gamePaused: "Joc oprit", oraclePaused: DEFAULT_PAUSED_MESSAGE, gamePausedImageUrl: "", gamePausedThumbnailUrl: "", oraclePausedImageUrl: "", oraclePausedThumbnailUrl: "" } },
});

describe("the Oracle group", () => {
  it("is its own page, with four modules", () => {
    expect(ORACLE_MODULES.map((module) => module.route)).toEqual(["/oracol/pornire", "/oracol/conversatie", "/oracol/ton", "/oracol/profetii"]);
    expect(oracleModuleForRoute("/oracol").id).toBe("status");
    expect(oracleModuleForRoute("/oracol/profetii/").id).toBe("prophecy");
    expect(isOracleRoute("/oracol/ton")).toBe(true);
    expect(isOracleRoute("/bot")).toBe(false);
    expect(panelGroupRoute("/oracol/conversatie")).toBe("/oracol");
    expect(isWidePanelRoute("/oracol")).toBe(true);
  });

  it("reads a server without saved settings with the bot's defaults, and does not call it changed", () => {
    expect(oracleOf(config())).toEqual(DEFAULT_ORACLE);
    expect(changedOracleParts(config(), config(structuredClone(DEFAULT_ORACLE)))).toEqual([]);
    const partial = oracleOf(config({ chat: { tone: "sobru" }, prophecy: { daily: { hour: 20 } } }));
    expect(partial.chat).toMatchObject({ tone: "sobru", length: "mediu", channelIds: [] });
    expect(partial.prophecy.daily).toMatchObject({ hour: 20, timeZone: "Europe/Bucharest", enabled: false });
  });

  it("changes one value and marks only its module", () => {
    const saved = config(structuredClone(DEFAULT_ORACLE));
    const draft = { ...saved, oracle: withOracle(saved, ["chat", "tone"], "jucaus") };
    expect(oracleOf(saved).chat.tone).toBe("implicit");
    expect(changedOracleParts(saved, draft)).toEqual([{ key: "style", label: "Ton și lungime" }]);
    const paused = structuredClone(saved);
    paused.gameplayConfig.messages.oraclePaused = "Doarme.";
    expect(isOracleModuleChanged(ORACLE_MODULES[0]!, saved, paused)).toBe(true);
    expect(changedOracleParts(saved, paused).map((part) => part.key)).toEqual(["status"]);
  });

  it("sums up each module in the menu", () => {
    const value = config({
      ...DEFAULT_ORACLE,
      chat: { ...DEFAULT_ORACLE.chat, channelIds: ["100000001", "100000002"], cooldownSeconds: 90, tone: "prietenos", length: "scurt" },
      prophecy: { ...DEFAULT_ORACLE.prophecy, dailyLimit: 3, daily: { ...DEFAULT_ORACLE.prophecy.daily, enabled: true, channelId: "100000003", hour: 8 } },
    });
    expect(oracleModuleSummary(value, "status")).toBe("pornit pe server");
    expect(oracleModuleSummary(value, "chat")).toBe("în 2 locuri alese · 1 min 30 s");
    expect(oracleModuleSummary(value, "style")).toBe("Prietenos · scurt");
    expect(oracleModuleSummary(value, "prophecy")).toBe("/profetie · 3 pe zi · zilnic la 08:00");
    expect(oracleModuleSummary(config(), "chat")).toBe("în toate canalele · 12 s");
    expect(cooldownText(0)).toBe("fără pauză");
    expect(cooldownText(120)).toBe("2 min");
    const off = config({ ...DEFAULT_ORACLE, enabled: false });
    expect(isOracleModuleOn(off, "chat")).toBe(false);
    const noProphecy = config({ ...DEFAULT_ORACLE, prophecy: { ...DEFAULT_ORACLE.prophecy, commandEnabled: false } });
    expect(isOracleModuleOn(noProphecy, "prophecy")).toBe(false);
    expect(oracleModuleSummary(noProphecy, "prophecy")).toBe("oprite");
  });

  it("offers categories first, then the channels that hold messages", () => {
    const options = oracleChannelOptions([
      { id: "1", name: "zgomot", type: 0 },
      { id: "2", name: "Comunitate", type: 4 },
      { id: "3", name: "anunturi", type: 5 },
      { id: "4", name: "Taverna", type: 2 },
      { id: "5", name: "fir", type: 11 },
      { id: "6", name: "Arhivă", type: 4 },
    ]);
    expect(options?.map((option) => [option.name, option.note])).toEqual([
      ["Arhivă", "categorie"], ["Comunitate", "categorie"], ["anunturi", "anunțuri"], ["Taverna", "voce"], ["zgomot", undefined],
    ]);
    expect(oracleChannelOptions(undefined)).toBeUndefined();
  });

  it("cuts the example answer to the chosen length", () => {
    expect(sampleAnswer("sobru", "scurt").split(". ")).toHaveLength(1);
    expect(sampleAnswer("sobru", "lung").length).toBeGreaterThan(sampleAnswer("sobru", "mediu").length);
    expect(sampleAnswer("jucaus", "mediu")).not.toBe(sampleAnswer("mistic", "mediu"));
  });

  it("finds the next prophecy of the day in the chosen time zone", () => {
    const daily = { enabled: true, channelId: "100000003", hour: 9, timeZone: "Europe/Bucharest" };
    // 05:30 UTC is 08:30 in Bucharest (summer time on 2026-07-01): 09:00 the same day.
    const morning = new Date("2026-07-01T05:30:00Z");
    expect(nextDailyProphecy(daily, morning)?.toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(dayWord(nextDailyProphecy(daily, morning)!, morning, daily.timeZone)).toBe("azi");
    // 06:20 UTC is 09:20 there: the next one is tomorrow, and this hour is the chosen one.
    const late = new Date("2026-07-01T06:20:00Z");
    expect(nextDailyProphecy(daily, late)?.toISOString()).toBe("2026-07-02T06:00:00.000Z");
    expect(dayWord(nextDailyProphecy(daily, late)!, late, daily.timeZone)).toBe("mâine");
    expect(isDailyHourNow(daily, late)).toBe(true);
    expect(isDailyHourNow(daily, morning)).toBe(false);
    expect(nextDailyProphecy({ ...daily, timeZone: "Mars/Olympus" }, morning)).toBeNull();
  });

  it("stops a save the server would refuse", () => {
    const ok = config(structuredClone(DEFAULT_ORACLE));
    expect(oracleDraftError(ok)).toBeNull();
    const noChannel = { ...ok, oracle: withOracle(ok, ["prophecy", "daily", "enabled"], true) };
    expect(oracleDraftError(noChannel)).toBe("Profeții — Alege canalul profeției zilei.");
    expect(oracleDraftError({ ...ok, oracle: withOracle(ok, ["chat", "cooldownSeconds"], 4_000) })).toContain("Conversație");
    expect(oracleDraftError({ ...ok, oracle: withOracle(ok, ["chat", "channelIds"], ["abc"]) })).toContain("„abc”");
    expect(oracleDraftError({ ...ok, oracle: withOracle(ok, ["prophecy", "dailyLimit"], 0) })).toContain("Profeții");
    expect(oracleDraftError({ ...ok, oracle: withOracle(ok, ["prophecy", "daily", "timeZone"], "Mars/Olympus") })).toBe("Profeții — Fusul orar nu e cunoscut.");
    const empty = structuredClone(ok);
    empty.gameplayConfig.messages.oraclePaused = "  ";
    expect(oracleDraftError(empty)).toBe("Pornire — Scrie mesajul pentru când Oracolul e oprit.");
    const image = structuredClone(ok);
    image.gameplayConfig.messages.oraclePausedImageUrl = "http://nesigur.ro/a.png";
    expect(oracleDraftError(image)).toContain("imagine");
  });
});
