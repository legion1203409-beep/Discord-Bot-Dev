import { describe, expect, it, vi } from "vitest";
import { fetchDiscordGuildStats } from "../discord-stats";

describe("fetchDiscordGuildStats", () => {
  it("forces a fresh Discord guild fetch so cached guilds still expose member counts", async () => {
    const fetch = vi.fn().mockResolvedValue({
      approximatePresenceCount: 7,
      approximateMemberCount: 42,
    });

    const stats = await fetchDiscordGuildStats(
      { guilds: { fetch } },
      "guild-123",
    );

    expect(fetch).toHaveBeenCalledWith({
      guild: "guild-123",
      withCounts: true,
      force: true,
    });
    expect(stats).toEqual({ onlineCount: 7, totalMembers: 42 });
  });

  it("falls back to the regular member count when Discord omits the approximate count", async () => {
    const stats = await fetchDiscordGuildStats(
      {
        guilds: {
          fetch: vi.fn().mockResolvedValue({
            approximatePresenceCount: null,
            approximateMemberCount: null,
            memberCount: 42,
          }),
        },
      },
      "guild-123",
    );

    expect(stats).toEqual({ onlineCount: null, totalMembers: 42 });
  });
});