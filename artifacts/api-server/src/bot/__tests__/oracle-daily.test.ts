import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDate: vi.fn(),
  saveDate: vi.fn(),
  generate: vi.fn(),
  enabled: vi.fn(() => true),
}));

vi.mock("../db", () => ({
  loadDailyProphecyDate: mocks.loadDate,
  saveDailyProphecyDate: mocks.saveDate,
  loadOracleSettings: vi.fn(async () => null),
  saveOracleSettings: vi.fn(async () => undefined),
}));
vi.mock("../oracle", () => ({ getCurrentMood: () => "calm", isOracleEnabled: mocks.enabled }));
vi.mock("../oracle-chat", () => ({ generateDailyProphecy: mocks.generate }));

import { checkDailyProphecies, isDailyProphecyDue } from "../oracle-daily";
import { normalizeOracleSettings, setOracleSettings } from "../oracle-settings";

const daily = { enabled: true, channelId: "777777777", hour: 9, timeZone: "Europe/Bucharest" };

describe("the prophecy of the day", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
  });

  it("is due once, at the chosen local hour", () => {
    const settings = normalizeOracleSettings({ prophecy: { daily } });
    const nine = new Date("2026-10-30T07:10:00Z"); // 09:10 in Bucharest
    expect(isDailyProphecyDue(settings, null, nine)).toEqual({ due: true, day: "2026-10-30" });
    expect(isDailyProphecyDue(settings, "2026-10-30", nine).due).toBe(false);
    expect(isDailyProphecyDue(settings, null, new Date("2026-10-30T08:10:00Z")).due).toBe(false);
    expect(isDailyProphecyDue(normalizeOracleSettings({ enabled: false, prophecy: { daily } }), null, nine).due).toBe(false);
    expect(isDailyProphecyDue(normalizeOracleSettings({ prophecy: { daily: { ...daily, enabled: false } } }), null, nine).due).toBe(false);
  });

  it("posts in the chosen channel and remembers the day", async () => {
    await setOracleSettings("555555555", { prophecy: { daily } });
    mocks.loadDate.mockResolvedValue("2026-10-29");
    mocks.generate.mockResolvedValue("Cenușa se va ridica la apus.");
    const send = vi.fn(async () => ({}));
    const client = {
      guilds: { cache: new Map([["555555555", {}]]) },
      channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send, guildId: "555555555" })) },
    };
    const nine = new Date("2026-10-30T07:10:00Z");
    await checkDailyProphecies(client as never, nine);
    await checkDailyProphecies(client as never, nine);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls[0])).toContain("Cenușa se va ridica la apus.");
    expect(mocks.saveDate).toHaveBeenCalledWith("555555555", "2026-10-30");
  });

  it("stays quiet while the Oracle is stopped", async () => {
    await setOracleSettings("666666666", { prophecy: { daily } });
    mocks.enabled.mockReturnValue(false);
    const client = { guilds: { cache: new Map([["666666666", {}]]) }, channels: { fetch: vi.fn() } };
    await checkDailyProphecies(client as never, new Date("2026-10-30T07:10:00Z"));
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });
});
