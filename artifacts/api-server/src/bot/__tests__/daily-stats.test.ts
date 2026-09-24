import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../channel-config", () => ({
  getChannel: vi.fn(),
}));

import { getChannel } from "../channel-config";
import { buildDailyStatsEmbed, resolveDailyStatsChannelId, type DailyStatsReport } from "../daily-stats";
import { DEFAULT_DAILY_STATS_EMBED_CONFIG } from "../db";

describe("daily statistics report destination", () => {
  beforeEach(() => {
    vi.mocked(getChannel).mockReset();
  });

  it("uses the explicitly configured report channel", () => {
    vi.mocked(getChannel).mockReturnValue("main-channel");

    expect(resolveDailyStatsChannelId("stats-channel", "guild-1")).toBe("stats-channel");
    expect(getChannel).not.toHaveBeenCalled();
  });

  it("falls back to the guild's main channel when no report channel is configured", () => {
    vi.mocked(getChannel).mockReturnValue("main-channel");

    expect(resolveDailyStatsChannelId("", "guild-1")).toBe("main-channel");
    expect(getChannel).toHaveBeenCalledWith("main", "guild-1");
  });

  it("returns no destination when neither a report nor main channel is configured", () => {
    vi.mocked(getChannel).mockReturnValue(null);

    expect(resolveDailyStatsChannelId("", "guild-2")).toBeNull();
    expect(getChannel).toHaveBeenCalledWith("main", "guild-2");
  });
});

describe("buildDailyStatsEmbed", () => {
  it("includes every section and applies the same configured text as the preview", () => {
    const report: DailyStatsReport = {
      guildId: "guild-1",
      day: "2026-09-18",
      metrics: { messages: 307, uniqueUsers: 13, boosts: 0, joins: 5, leaves: 5, peakVoice: 4 },
      activity: [
        { day: "2026-09-17", messages: 176 },
        { day: "2026-09-18", messages: 307 },
      ],
      topChannels: [{ channelId: "channel-1", channelName: "general", messages: 124 }],
    };
    const config = {
      ...DEFAULT_DAILY_STATS_EMBED_CONFIG,
      title: "Statistici {guild} · {messages}",
      description: "Raport {date} · {uniqueUsers} utilizatori",
      activityTitle: "Activitate recentă",
      channelsTitle: "Canale active",
      metricLabels: {
        ...DEFAULT_DAILY_STATS_EMBED_CONFIG.metricLabels,
        messages: "Mesaje totale",
      },
    };

    const embed = buildDailyStatsEmbed("Regatul Cenușii", report, config).toJSON();

    expect(embed.title).toBe("Statistici Regatul Cenușii · 307");
    expect(embed.description).toContain("13 utilizatori");
    expect(embed.fields).toHaveLength(8);
    expect(embed.fields?.[0]).toMatchObject({ name: "Mesaje totale", value: "307", inline: true });
    expect(embed.fields?.[6]?.name).toBe("Activitate recentă");
    expect(embed.fields?.[6]?.value).toContain("09-18");
    expect(embed.fields?.[7]?.name).toBe("Canale active");
    expect(embed.fields?.[7]?.value).toContain("#general");
  });
});