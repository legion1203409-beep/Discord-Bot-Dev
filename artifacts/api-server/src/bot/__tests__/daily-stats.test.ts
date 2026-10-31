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
vi.mock("../daily-report-chart", async (importOriginal) => ({
  ...await importOriginal<typeof import("../daily-report-chart")>(),
  renderDailyReportChart: vi.fn().mockResolvedValue(null),
}));

import { getChannel } from "../channel-config";
import {
  buildDailyStatsEmbed, dailyChartInput, hasRecordedStats, isReportDayBeforeBotJoined, publishDailyStatsReport, repairRecentUnavailableReports,
  resolveDailyStatsChannelId, shortStatsDay, type DailyStatsReport,
} from "../daily-stats";
import { chartText, renderDailyReportChart } from "../daily-report-chart";
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
    expect(embed.fields?.[1]?.value).toContain("Jo 17: 176 · **Vi 18: 307**");
    expect(embed.fields?.[1]?.value).toContain("Media: **242** mesaje/zi · ziua raportului a fost cea mai activă");
    expect(embed.fields?.[1]?.value).not.toContain("```");
    expect(embed.fields?.[1]?.value).not.toContain("█");
    expect(embed.fields?.[2]?.name).toBe("Canale active");
    expect(embed.fields?.[2]?.value).toBe("🥇 **#general** · **124** mesaje · 40%");
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
    expect(activity?.value).toContain("Mi 23: —");
    expect(activity?.value).toContain("Jo 24: —");
    expect(activity?.value).toContain("**Vi 25: 37**");
    expect(embed.fields?.find((field) => field.name === "Acoperirea datelor")?.value).toContain("Prima zi");
  });
});

const WEEK: DailyStatsReport = {
  guildId: "guild-1",
  day: "2026-10-29",
  metrics: { messages: 307, uniqueUsers: 13, boosts: 0, joins: 5, leaves: 2, peakVoice: 4 },
  previous: { messages: 176, uniqueUsers: 15, boosts: 0, joins: 2, leaves: 1, peakVoice: 3 },
  activity: [
    { day: "2026-10-23", messages: 48 },
    { day: "2026-10-24", messages: 83 },
    { day: "2026-10-25", messages: 61 },
    { day: "2026-10-26", messages: 119 },
    { day: "2026-10-27", messages: 94 },
    { day: "2026-10-28", messages: 176 },
    { day: "2026-10-29", messages: 307 },
  ],
  topChannels: [
    { channelId: "123456789012345678", channelName: "general", messages: 124 },
    { channelId: "123456789012345679", channelName: "raiduri", messages: 83 },
    { channelId: "123456789012345680", channelName: "ajutor", messages: 61 },
    { channelId: "123456789012345681", channelName: "vechi", messages: 22 },
    { channelId: "123456789012345682", channelName: "off-topic", messages: 1 },
  ],
};
const LONG_AGO = Date.parse("2026-01-01T12:00:00Z");

describe("the upgraded daily report", () => {
  it("compares every number with the day before and sums up the members", () => {
    const embed = buildDailyStatsEmbed("Regatul Cenușii", WEEK, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO, { memberCount: 1234 }).toJSON();
    expect(embed.fields?.[0]?.value).toBe([
      "💬 Mesaje: **307** · ▲ +131",
      "👥 Utilizatori unici: **13** · ▼ −2",
      "🚀 Boost-uri: **0** · la fel",
      "🟢 Intrări: **5** · ▲ +3",
      "🔴 Ieșiri: **2** · ▲ +1",
      "🔊 Vârf vocal: **4** · ▲ +1",
      "Bilanț: **+3** membri · **1.234** pe server acum",
      "*▲ ▼ arată schimbarea față de ziua dinainte.*",
    ].join("\n"));
  });

  it("does not compare with a day the bot did not watch whole", () => {
    const joinedTheDayBefore = Date.parse("2026-10-28T17:00:00Z");
    const embed = buildDailyStatsEmbed("Regatul Cenușii", WEEK, DEFAULT_DAILY_STATS_EMBED_CONFIG, joinedTheDayBefore).toJSON();
    expect(embed.fields?.[0]?.value).toContain("💬 Mesaje: **307**\n");
    expect(embed.fields?.[0]?.value).not.toContain("▲");
    expect(embed.fields?.[0]?.value).not.toContain("ziua dinainte");
    const noPrevious = buildDailyStatsEmbed("Regatul Cenușii", { ...WEEK, previous: null }, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO).toJSON();
    expect(noPrevious.fields?.[0]?.value).not.toContain("▲");
  });

  it("lists the week with the report's day in bold, its average and its busiest day", () => {
    const quieter = { ...WEEK, day: "2026-10-28", activity: WEEK.activity.slice(0, 6), topChannels: [] };
    const embed = buildDailyStatsEmbed("Regatul Cenușii", quieter, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO).toJSON();
    const activity = embed.fields?.find((field) => field.name === DEFAULT_DAILY_STATS_EMBED_CONFIG.activityTitle)?.value;
    expect(activity).toBe("Vi 23: 48 · Sâ 24: 83 · Du 25: 61 · Lu 26: 119 · Ma 27: 94 · **Mi 28: 176**\nMedia: **97** mesaje/zi · ziua raportului a fost cea mai activă");
    const busier = { ...quieter, activity: [...quieter.activity.slice(0, 5), { day: "2026-10-27", messages: 300 }, { day: "2026-10-28", messages: 10 }] };
    const second = buildDailyStatsEmbed("Regatul Cenușii", busier, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO).toJSON();
    expect(second.fields?.find((field) => field.name === DEFAULT_DAILY_STATS_EMBED_CONFIG.activityTitle)?.value).toContain("cea mai activă: **Ma 27** (300)");
  });

  it("names the channels with mentions, medals and their share of the day", () => {
    const embed = buildDailyStatsEmbed("Regatul Cenușii", WEEK, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO, {
      channelExists: (id) => id !== "123456789012345681",
    }).toJSON();
    expect(embed.fields?.find((field) => field.name === DEFAULT_DAILY_STATS_EMBED_CONFIG.channelsTitle)?.value).toBe([
      "🥇 <#123456789012345678> · **124** mesaje · 40%",
      "🥈 <#123456789012345679> · **83** mesaje · 27%",
      "🥉 <#123456789012345680> · **61** mesaje · 20%",
      "4. **#vechi** · **22** mesaje · 7%",
      "5. <#123456789012345682> · **1** mesaje · sub 1%",
    ].join("\n"));
  });

  it("shows the day's card instead of the custom image and keeps only the week's summary in the text", () => {
    const config = { ...DEFAULT_DAILY_STATS_EMBED_CONFIG, imageUrl: "https://example.com/banner.png" };
    const withCard = buildDailyStatsEmbed("Regatul Cenușii", WEEK, config, LONG_AGO, { chartAttached: true }).toJSON();
    expect(withCard.image?.url).toBe("attachment://raport-zilnic.png");
    expect(withCard.fields?.find((field) => field.name === config.activityTitle)?.value)
      .toBe("Media: **127** mesaje/zi · ziua raportului a fost cea mai activă");
    const withoutCard = buildDailyStatsEmbed("Regatul Cenușii", WEEK, config, LONG_AGO).toJSON();
    expect(withoutCard.image?.url).toBe("https://example.com/banner.png");
  });

  it("gives the card plain text, the change since yesterday and the days before installation as gaps", () => {
    const joined = Date.parse("2026-10-25T09:00:00Z");
    const input = dailyChartInput("🔥 Regatul Cenușii", WEEK, DEFAULT_DAILY_STATS_EMBED_CONFIG, joined, 1234);
    expect(input.guild).toBe("Regatul Cenușii");
    expect(input.date).toBe("joi, 29 octombrie 2026");
    expect(input.color).toBe(DEFAULT_DAILY_STATS_EMBED_CONFIG.color);
    expect(input.metrics.map((metric) => metric.label)).toEqual(["Mesaje", "Utilizatori unici", "Boost-uri", "Intrări", "Ieșiri", "Vârf vocal"]);
    expect(input.metrics[0]).toEqual({ label: "Mesaje", value: 307, delta: 131 });
    expect(input.metrics[4]).toEqual({ label: "Ieșiri", value: 2, delta: 1, invert: true });
    expect(input.activityTitle).toBe("Activitate · ultimele 7 zile");
    expect(input.activity.slice(0, 2)).toEqual([{ label: "Vi 23", value: null, current: false }, { label: "Sâ 24", value: null, current: false }]);
    expect(input.activity.at(-1)).toEqual({ label: "Jo 29", value: 307, current: true });
    expect(input.average).toBeCloseTo((61 + 119 + 94 + 176 + 307) / 5);
    expect(input.summary).toBe("Bilanț: +3 membri · 1.234 pe server acum");
  });

  it("strips what the card's font cannot draw", () => {
    expect(chartText("📊 **Statistici** <:cenusa:123456789012345678> · {x}")).toBe("Statistici · {x}");
    expect(chartText("👩‍👩‍👧 Familie ❤️")).toBe("Familie");
    expect(shortStatsDay("2026-11-01")).toBe("Du 01");
  });
});

describe("posting the upgraded report", () => {
  const joinedTimestamp = LONG_AGO;

  function setup(chart: boolean) {
    vi.mocked(getChannel).mockReturnValue("main-channel");
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql, params) => {
      const text = String(sql);
      const day = Array.isArray(params) ? params[1] : undefined;
      if (text.includes("SELECT report_message_id")) return { rows: [] } as never;
      if (text.includes("COUNT(*)")) return { rows: [{ count: day === "2026-10-29" ? "13" : "15" }] } as never;
      if (text.includes("FROM discord_daily_channels")) {
        return { rows: WEEK.topChannels.map((item) => ({ channel_id: item.channelId, channel_name: item.channelName, message_count: item.messages })) } as never;
      }
      if (text.includes("day = ANY")) return { rows: WEEK.activity.map((item) => ({ day: item.day, message_count: item.messages })) } as never;
      if (text.includes("SELECT message_count")) {
        const metrics = day === "2026-10-29" ? WEEK.metrics : WEEK.previous!;
        return { rows: [{ message_count: metrics.messages, joins: metrics.joins, leaves: metrics.leaves, boosts: metrics.boosts, peak_voice: metrics.peakVoice }] } as never;
      }
      return { rows: [] } as never;
    });
    const config = vi.mocked(statsConfig.loadDailyStatsEmbedConfig);
    config.mockResolvedValue({ ...DEFAULT_DAILY_STATS_EMBED_CONFIG, channelId: "stats-channel", chart });
    const send = vi.fn().mockResolvedValue({ id: "report-1" });
    const channel = Object.create(TextChannel.prototype) as TextChannel;
    Object.defineProperties(channel, { guildId: { value: "guild-1" }, send: { value: send } });
    const client = {
      user: { id: "bot-1" },
      guilds: { cache: new Map([["guild-1", {
        name: "Regatul Cenușii", joinedTimestamp, memberCount: 1234,
        channels: { cache: new Map(WEEK.topChannels.map((item) => [item.channelId, {}])) },
      }]]) },
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    } as unknown as Client;
    return {
      send, client,
      restore: () => {
        config.mockReset();
        query.mockRestore();
        vi.mocked(renderDailyReportChart).mockReset();
        vi.mocked(renderDailyReportChart).mockResolvedValue(null);
      },
    };
  }

  it("attaches the day's card and points the embed at it", async () => {
    const { send, client, restore } = setup(true);
    vi.mocked(renderDailyReportChart).mockResolvedValue(Buffer.from("png"));
    try {
      expect(await publishDailyStatsReport(client, "guild-1", "2026-10-29")).toBe(true);
      expect(vi.mocked(renderDailyReportChart).mock.calls[0][0].metrics[0]).toEqual({ label: "Mesaje", value: 307, delta: 131 });
      expect(vi.mocked(renderDailyReportChart).mock.calls[0][0].summary).toBe("Bilanț: +3 membri · 1.234 pe server acum");
      const payload = send.mock.calls[0][0];
      expect(payload.files).toHaveLength(1);
      expect(payload.files[0].name).toBe("raport-zilnic.png");
      const embed = payload.embeds[0].toJSON();
      expect(embed.image?.url).toBe("attachment://raport-zilnic.png");
      expect(embed.fields?.[0]?.value).toContain("**1.234** pe server acum");
      expect(embed.fields?.find((field: { name: string }) => field.name === DEFAULT_DAILY_STATS_EMBED_CONFIG.channelsTitle)?.value)
        .toContain("🥇 <#123456789012345678>");
    } finally {
      restore();
    }
  });

  it("posts without the card when it is turned off or cannot be drawn", async () => {
    const off = setup(false);
    try {
      expect(await publishDailyStatsReport(off.client, "guild-1", "2026-10-29")).toBe(true);
      expect(renderDailyReportChart).not.toHaveBeenCalled();
      expect(off.send.mock.calls[0][0].files).toBeUndefined();
    } finally {
      off.restore();
    }
    const failed = setup(true);
    try {
      expect(await publishDailyStatsReport(failed.client, "guild-1", "2026-10-29")).toBe(true);
      expect(renderDailyReportChart).toHaveBeenCalledOnce();
      expect(failed.send.mock.calls[0][0].files).toBeUndefined();
      expect(failed.send.mock.calls[0][0].embeds[0].toJSON().image).toBeUndefined();
    } finally {
      failed.restore();
    }
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