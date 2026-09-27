import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadChannelConfig: vi.fn(),
  saveChannelConfig: vi.fn(),
}));

vi.mock("../db", () => ({
  loadChannelConfig: mocks.loadChannelConfig,
  saveChannelConfig: mocks.saveChannelConfig,
}));

import { getChannel, hasAnyChannelConfigured, initChannelConfig } from "../channel-config";

const ORIGINAL_GUILD_ID = "1382035307607883816";

describe("saved channel destinations", () => {
  beforeEach(() => {
    mocks.loadChannelConfig.mockReset();
    mocks.saveChannelConfig.mockReset();
  });

  it("treats explicitly empty destinations as disabled even on the original guild", async () => {
    mocks.loadChannelConfig.mockResolvedValue({
      main: "",
      event: "",
      boss: "",
      trader: "",
      eventTop: "",
      bossTop: "",
      council: "",
      fratia: "",
    });
    await initChannelConfig(ORIGINAL_GUILD_ID);

    for (const type of ["main", "event", "boss", "trader", "eventTop", "bossTop", "council", "fratia"] as const) {
      expect(getChannel(type, ORIGINAL_GUILD_ID)).toBe("");
    }
    expect(hasAnyChannelConfigured(ORIGINAL_GUILD_ID)).toBe(false);
  });

  it("does not inherit main for council or fratia after either destination is explicitly cleared", async () => {
    mocks.loadChannelConfig.mockResolvedValue({
      main: "123456789",
      council: "",
      fratia: "",
    });
    await initChannelConfig("234567891");

    expect(getChannel("council", "234567891")).toBe("");
    expect(getChannel("fratia", "234567891")).toBe("");
  });

  it("keeps legacy defaults when no explicit channel configuration exists", async () => {
    mocks.loadChannelConfig.mockResolvedValue(null);
    await initChannelConfig(ORIGINAL_GUILD_ID);

    expect(getChannel("main", ORIGINAL_GUILD_ID)).toBeTruthy();
    expect(hasAnyChannelConfigured(ORIGINAL_GUILD_ID)).toBe(true);
  });
});