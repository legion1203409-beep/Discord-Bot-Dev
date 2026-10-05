import { beforeEach, describe, expect, it, vi } from "vitest";
import { TextChannel, type Client } from "discord.js";
import { pool } from "@workspace/db";

vi.mock("../channel-config", () => ({
  getChannel: vi.fn(),
}));
vi.mock("../db", async (importOriginal) => ({
  ...await importOriginal<typeof import("../db")>(),
  loadDailyStatsEmbedConfig: vi.fn(),
}));

import { getChannel } from "../channel-config";
import { buildDailyStatsEmbed, hasRecordedStats, isReportDayBeforeBotJoined, publishDailyStatsReport, repairRecentUnavailableReports, resolveDailyStatsChannelId, type DailyStatsReport } from "../daily-stats";
import { DEFAULT_DAILY_STATS_EMBED_CONFIG } from "../db";
import * as statsConfig from "../db";

describe("daily statistics report destination", () => {
  beforeEach(() => {
    vi.mocked(getChannel).mockReset();
  });

  it("uses the explicitly configured report channel", () => {
    vi.mocked(getChannel).mockReturnValue("chest-channel");

    expect(resolveDailyStatsChannelId("stats-channel", "guild-1")).toBe("stats-channel");
    expect(getChannel).toHaveBeenCalledWith("main", "guild-1");
  });

  it("does not fall back to the chest channel when no report channel is configured", () => {
    vi.mocked(getChannel).mockReturnValue("main-channel");

    expect(resolveDailyStatsChannelId("", "guild-1")).toBeNull();
    expect(getChannel).not.toHaveBeenCalled();
  });

  it("refuses to publish a report explicitly configured for the chest channel", () => {
    vi.mocked(getChannel).mockReturnValue("chest-channel");

    expect(resolveDailyStatsChannelId("chest-channel", "guild-1")).toBeNull();
    expect(getChannel).toHaveBeenCalledWith("main", "guild-1");
  });

  it("returns no destination when no report channel is configured", () => {
    vi.mocked(getChannel).mockReturnValue(null);

    expect(resolveDailyStatsChannelId("", "guild-2")).toBeNull();
    expect(getChannel).not.toHaveBeenCalled();
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
    expect(embed.fields).toHaveLength(3);
    expect(embed.fields?.[0]).toMatchObject({ name: "📊 Rezumat", inline: false });
    expect(embed.fields?.[0]?.value).toContain("Mesaje totale: **307**");
    expect(embed.fields?.[0]?.value).toContain("👥 Utilizatori unici: **13**");
    expect(embed.fields?.[1]?.name).toBe("Activitate recentă");
    expect(embed.fields?.[1]?.value).toContain("18/09: 307");
    expect(embed.fields?.[1]?.value).not.toContain("```");
    expect(embed.fields?.[1]?.value).not.toContain("█");
    expect(embed.fields?.[2]?.name).toBe("Canale active");
    expect(embed.fields?.[2]?.value).toContain("#general");
    expect(embed.fields?.[2]?.value).toContain("124 mesaje");
    expect(embed.fields?.[2]?.value).not.toContain("░");
  });

  it("renders date and metric variables in every configurable text field", () => {
    const report: DailyStatsReport = {
      guildId: "guild-1",
      day: "2026-09-18",
      metrics: { messages: 307, uniqueUsers: 13, boosts: 0, joins: 5, leaves: 5, peakVoice: 4 },
      activity: [],
      topChannels: [],
    };
    const config = {
      ...DEFAULT_DAILY_STATS_EMBED_CONFIG,
      title: "Raport {year}-{month}-{day}",
      description: "Data {date} · {timestamp} · {timestamp_relative}",
      footer: "Arhivă {guild} · {messages}",
      activityTitle: "Activitate {year}",
      channelsTitle: "Canale în luna {month}",
      emptyChannelsText: "Fără canale în {date} ({day})",
      metricLabels: {
        ...DEFAULT_DAILY_STATS_EMBED_CONFIG.metricLabels,
        messages: "Mesaje din {year}",
      },
    };

    const embed = buildDailyStatsEmbed("Regatul Cenușii", report, config).toJSON();
    const expectedTimestamp = Math.floor(Date.parse("2026-09-18T12:00:00.000Z") / 1_000);

    expect(embed.title).toBe("Raport 2026-09-18");
    expect(embed.description).toContain(`<t:${expectedTimestamp}:F>`);
    expect(embed.description).toContain(`<t:${expectedTimestamp}:R>`);
    expect(embed.footer?.text).toBe("Arhivă Regatul Cenușii · 307");
    expect(embed.fields?.[0]?.value).toContain("Mesaje din 2026: **307**");
    expect(embed.fields?.find((field) => field.name === "Activitate 2026")).toBeDefined();
    expect(embed.fields?.find((field) => field.name === "Canale în luna 09")?.value).toBe("Fără canale în 18 septembrie 2026 (18)");
  });

  it("splits unusually long custom metric labels without exceeding Discord field limits", () => {
    const report: DailyStatsReport = {
      guildId: "guild-1",
      day: "2026-09-18",
      metrics: { messages: 307, uniqueUsers: 13, boosts: 0, joins: 5, leaves: 5, peakVoice: 4 },
      activity: [],
      topChannels: [],
    };
    const longLabel = "x".repeat(256);
    const config = {
      ...DEFAULT_DAILY_STATS_EMBED_CONFIG,
      metricLabels: {
        messages: longLabel,
        uniqueUsers: longLabel,
        boosts: longLabel,
        joins: longLabel,
        leaves: longLabel,
        peakVoice: longLabel,
      },
    };

    const embed = buildDailyStatsEmbed("Regatul Cenușii", report, config).toJSON();
    const metricFields = embed.fields?.filter((field) => field.name.startsWith("📊 Rezumat")) ?? [];

    expect(metricFields.length).toBeGreaterThan(1);
    expect(metricFields.every((field) => field.value.length <= 1024)).toBe(true);
  });

  it("marks pre-installation dates as unavailable instead of zero and explains partial coverage", () => {
    const report: DailyStatsReport = {
      guildId: "guild-1",
      day: "2026-09-25",
      metrics: { messages: 37, uniqueUsers: 1, boosts: 0, joins: 0, leaves: 0, peakVoice: 0 },
      activity: [
        { day: "2026-09-23", messages: 0 },
        { day: "2026-09-24", messages: 0 },
        { day: "2026-09-25", messages: 37 },
      ],
      topChannels: [{ channelId: "channel-1", channelName: "general", messages: 37 }],
    };
    const joinedTimestamp = Date.parse("2026-09-25T17:00:00Z");
    const embed = buildDailyStatsEmbed("Server nou", report, DEFAULT_DAILY_STATS_EMBED_CONFIG, joinedTimestamp).toJSON();
    const activity = embed.fields?.find((field) => field.name === DEFAULT_DAILY_STATS_EMBED_CONFIG.activityTitle);
    expect(activity?.value).toContain("23/09: —");
    expect(activity?.value).toContain("24/09: —");
    expect(activity?.value).toContain("25/09: 37");
    expect(embed.fields?.find((field) => field.name === "Acoperirea datelor")?.value).toContain("Prima zi");
  });
});

describe("daily report collection window", () => {
  const joinedTimestamp = Date.parse("2026-09-25T17:00:00Z");

  it("rejects a report from before the bot joined", () => {
    expect(isReportDayBeforeBotJoined("2026-09-24", joinedTimestamp)).toBe(true);
  });

  it("allows the partial installation day and later full days", () => {
    expect(isReportDayBeforeBotJoined("2026-09-25", joinedTimestamp)).toBe(false);
    expect(isReportDayBeforeBotJoined("2026-09-26", joinedTimestamp)).toBe(false);
  });

  it("does not mistake a published but otherwise empty row for observed activity", () => {
    const report: DailyStatsReport = {
      guildId: "guild-1",
      day: "2026-09-24",
      metrics: { messages: 0, uniqueUsers: 0, boosts: 0, joins: 0, leaves: 0, peakVoice: 0 },
      activity: [{ day: "2026-09-24", messages: 0 }],
      topChannels: [],
    };
    expect(hasRecordedStats(report)).toBe(false);
    expect(hasRecordedStats({ ...report, metrics: { ...report.metrics, messages: 37 } })).toBe(true);
  });

  it("does not send a fabricated zero report for a day before installation", async () => {
    const query = vi.spyOn(pool, "query").mockResolvedValue({ rows: [] } as never);
    const fetchChannel = vi.fn();
    const client = {
      guilds: { cache: new Map([["guild-1", { joinedTimestamp }]]) },
      channels: { fetch: fetchChannel },
    } as unknown as Client;
    try {
      expect(await publishDailyStatsReport(client, "guild-1", "2026-09-24")).toBe(false);
      expect(fetchChannel).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO discord_daily_stats"),
        expect.anything(),
      );
    } finally {
      query.mockRestore();
    }
  });

  it("corrects its already-posted zero report instead of leaving a misleading message", async () => {
    vi.mocked(getChannel).mockReturnValue("main-channel");
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql) => ({
      rows: String(sql).includes("SELECT report_message_id")
        ? [{ report_message_id: "old-report" }]
        : [],
    }) as never);
    const config = vi.mocked(statsConfig.loadDailyStatsEmbedConfig);
    config.mockResolvedValue({ ...DEFAULT_DAILY_STATS_EMBED_CONFIG, channelId: "stats-channel" });
    const edit = vi.fn().mockResolvedValue(undefined);
    const fetchMessage = vi.fn().mockResolvedValue({
      author: { id: "bot-1" },
      embeds: [{ author: { name: "ORACOLUL CENUȘII · COMMUNITY INSIGHTS" }, description: "0 mesaje" }],
      edit,
    });
    const channel = Object.create(TextChannel.prototype) as TextChannel;
    Object.defineProperties(channel, {
      guildId: { value: "guild-1" },
      messages: { value: { fetch: fetchMessage } },
    });
    const client = {
      user: { id: "bot-1" },
      guilds: { cache: new Map([["guild-1", { name: "Server nou", joinedTimestamp }]]) },
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    } as unknown as Client;
    try {
      expect(await publishDailyStatsReport(client, "guild-1", "2026-09-24")).toBe(false);
      expect(fetchMessage).toHaveBeenCalledWith("old-report");
      expect(edit).toHaveBeenCalledOnce();
      expect(edit.mock.calls[0][0].embeds[0].toJSON().description).toContain("Date indisponibile");
      await publishDailyStatsReport(client, "guild-1", "2026-09-24");
      expect(edit).toHaveBeenCalledOnce();
    } finally {
      config.mockReset();
      query.mockRestore();
    }
  });

  it("finds and corrects a recent report even after its scheduled day has passed", async () => {
    vi.mocked(getChannel).mockReturnValue("main-channel");
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql) => ({
      rows: String(sql).includes("ORDER BY day DESC LIMIT 7")
        ? [{ day: "2026-09-24", report_message_id: "older-report" }]
        : [],
    }) as never);
    const config = vi.mocked(statsConfig.loadDailyStatsEmbedConfig);
    config.mockResolvedValue({ ...DEFAULT_DAILY_STATS_EMBED_CONFIG, channelId: "stats-channel" });
    const edit = vi.fn().mockResolvedValue(undefined);
    const channel = Object.create(TextChannel.prototype) as TextChannel;
    Object.defineProperties(channel, {
      guildId: { value: "guild-2" },
      messages: { value: { fetch: vi.fn().mockResolvedValue({
        author: { id: "bot-1" },
        embeds: [{ author: { name: "ORACOLUL CENUȘII · COMMUNITY INSIGHTS" }, description: "0 mesaje" }],
        edit,
      }) } },
    });
    const client = {
      user: { id: "bot-1" },
      guilds: { cache: new Map([["guild-2", { name: "Server nou", joinedTimestamp }]]) },
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    } as unknown as Client;
    try {
      await repairRecentUnavailableReports(client, "guild-2");
      expect(edit).toHaveBeenCalledOnce();
      expect(edit.mock.calls[0][0].embeds[0].toJSON().description).toContain("Date indisponibile");
    } finally {
      config.mockReset();
      query.mockRestore();
    }
  });
});