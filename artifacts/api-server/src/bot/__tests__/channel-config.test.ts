import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadChannelConfig: vi.fn(),
  saveChannelConfig: vi.fn(),
}));

vi.mock("../db", () => ({
  loadChannelConfig: mocks.loadChannelConfig,
  saveChannelConfig: mocks.saveChannelConfig,
}));

import { getAllChannels, getChannel, hasAnyChannelConfigured, initChannelConfig } from "../channel-config";

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

  it("never implicitly routes community votes to the chest channel", async () => {
    mocks.loadChannelConfig.mockResolvedValue({ main: "123456789" });
    for (const guild of [ORIGINAL_GUILD_ID, "new-vote-guild"]) {
      await initChannelConfig(guild);
      expect(getChannel("council", guild)).toBeFalsy();
      expect(getChannel("fratia", guild)).toBeFalsy();
    }
  });

  it("does not expose the original guild's channel IDs to a new server", async () => {
    mocks.loadChannelConfig.mockResolvedValue(null);
    await initChannelConfig("new-empty-guild");
    expect(Object.values(getAllChannels("new-empty-guild"))).toEqual(Array(8).fill(""));
  });

  it("keeps explicitly chosen community destinations, even when shared intentionally", async () => {
    mocks.loadChannelConfig.mockResolvedValue({ main: "123456789", council: "123456789", fratia: "987654321" });
    await initChannelConfig("explicit-votes-guild");
    expect(getAllChannels("explicit-votes-guild")).toMatchObject({ council: "123456789", fratia: "987654321" });
  });
});