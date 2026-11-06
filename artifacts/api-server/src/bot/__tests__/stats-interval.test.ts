import { describe, expect, it, vi } from "vitest";
import { TextChannel, type Client } from "discord.js";
import { pool } from "@workspace/db";

vi.mock("../channel-config", () => ({ getChannel: vi.fn(() => "chest-channel") }));
vi.mock("../daily-report-chart", async (importOriginal) => ({
  ...await importOriginal<typeof import("../daily-report-chart")>(),
  renderDailyReportChart: vi.fn(async () => null),
}));
vi.mock("../db", async (importOriginal) => ({
  ...await importOriginal<typeof import("../db")>(),
  loadDailyStatsEmbedConfig: vi.fn(),
}));

import {
  buildDailyStatsEmbed, dailyChartInput, formatStatsPeriod, isReportEndDay, nextReportEndDay, publishDailyStatsReport, type DailyStatsReport,
} from "../daily-stats";
import { DEFAULT_DAILY_STATS_EMBED_CONFIG, normalizeDailyStatsEmbedConfig } from "../db";
import * as statsConfig from "../db";
import { buildInviteTopEmbed, getTopInviters, inviteTopLines } from "../invite-top";

const LONG_AGO = Date.parse("2026-01-01T12:00:00Z");
const PERIOD: DailyStatsReport = {
  guildId: "guild-1", day: "2026-11-01", startDay: "2026-10-26", days: 7,
  metrics: { messages: 1_200, uniqueUsers: 40, boosts: 1, joins: 12, leaves: 3, peakVoice: 9 },
  previous: { messages: 1_000, uniqueUsers: 38, boosts: 0, joins: 8, leaves: 4, peakVoice: 7 },
  activity: ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"].map((day, index) => ({ day, messages: 100 + index * 20 })),
  topChannels: [{ channelId: "123456789012345678", channelName: "general", messages: 600 }],
  invites: { rows: [{ inviterId: "222222222", inviterName: "adina", joins: 7 }, { inviterId: null, inviterName: "vechi", joins: 2 }], attributed: 9, unknown: 3 },
};

describe("intervalul raportului", () => {
  it("raportul zilnic pleacă în fiecare zi", () => {
    expect(["2026-11-01", "2026-11-02", "2026-11-03"].every((day) => isReportEndDay(day, 1))).toBe(true);
  });
  it("la 7 zile, perioada se termină duminica (luni–duminică)", () => {
    const ends = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-08"].filter((day) => isReportEndDay(day, 7));
    expect(ends).toEqual(["2026-11-01", "2026-11-08"]);
    expect(new Date("2026-11-01T12:00:00Z").getUTCDay()).toBe(0);
  });
  it("pentru orice interval, raportul pleacă exact o dată la N zile", () => {
    for (let interval = 2; interval <= 7; interval += 1) {
      const days = Array.from({ length: 28 }, (_, index) => new Date(Date.UTC(2026, 9, 1 + index, 12)).toISOString().slice(0, 10));
      const ends = days.filter((day) => isReportEndDay(day, interval));
      expect(ends.length).toBeGreaterThanOrEqual(Math.floor(28 / interval));
      for (let index = 1; index < ends.length; index += 1) {
        expect((Date.parse(ends[index]!) - Date.parse(ends[index - 1]!)) / 86_400_000).toBe(interval);
      }
    }
  });
  it("știe următoarea zi de raport", () => {
    expect(nextReportEndDay("2026-10-29", 7)).toBe("2026-11-01");
    expect(nextReportEndDay("2026-11-01", 7)).toBe("2026-11-01");
    expect(nextReportEndDay("2026-10-29", 1)).toBe("2026-10-29");
  });
  it("intervalul se citește între 1 și 7, iar 1 e implicit", () => {
    expect(normalizeDailyStatsEmbedConfig({}).intervalDays).toBe(1);
    expect(normalizeDailyStatsEmbedConfig({ intervalDays: 3 }).intervalDays).toBe(3);
    expect(normalizeDailyStatsEmbedConfig({ intervalDays: 9 }).intervalDays).toBe(1);
    expect(normalizeDailyStatsEmbedConfig({ intervalDays: 2.5 }).intervalDays).toBe(1);
    expect(normalizeDailyStatsEmbedConfig({}).inviteTop).toBe(true);
    expect(normalizeDailyStatsEmbedConfig({ inviteTop: false }).inviteTop).toBe(false);
  });
  it("perioada se scrie scurt", () => {
    expect(formatStatsPeriod("2026-10-26", "2026-11-01")).toBe("26 octombrie – 1 noiembrie 2026");
    expect(formatStatsPeriod("2026-11-02", "2026-11-04")).toBe("2 – 4 noiembrie 2026");
    expect(formatStatsPeriod("2026-12-29", "2027-01-02")).toBe("29 decembrie 2026 – 2 ianuarie 2027");
  });
});

describe("raportul pe mai multe zile", () => {
  it("are titlul, perioada, comparația cu perioada dinainte și topul invitațiilor", () => {
    const embed = buildDailyStatsEmbed("Regatul", PERIOD, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO).toJSON();
    expect(embed.title).toBe("📊 Statistici · ultimele 7 zile · Regatul");
    expect(embed.description).toContain("26 octombrie – 1 noiembrie 2026");
    expect(JSON.stringify(embed)).toContain("față de cele 7 zile dinainte");
    const invites = embed.fields?.find((field) => field.name === "🎟️ Top invitații · 7 zile");
    expect(invites?.value).toBe("🥇 <@222222222> · **7** membri noi\n🥈 **vechi** · **2** membri noi\n*+3 fără invitație știută*");
  });
  it("un titlu ales de server rămâne cum e", () => {
    const embed = buildDailyStatsEmbed("Regatul", PERIOD, { ...DEFAULT_DAILY_STATS_EMBED_CONFIG, title: "Raportul nostru · {guild}" }, LONG_AGO).toJSON();
    expect(embed.title).toBe("Raportul nostru · Regatul");
  });
  it("topul invitațiilor se poate opri și lipsește când urmărirea invitațiilor nu merge", () => {
    const off = buildDailyStatsEmbed("Regatul", PERIOD, { ...DEFAULT_DAILY_STATS_EMBED_CONFIG, inviteTop: false }, LONG_AGO).toJSON();
    expect(off.fields?.some((field) => field.name.startsWith("🎟️"))).toBe(false);
    const none = buildDailyStatsEmbed("Regatul", { ...PERIOD, invites: null }, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO).toJSON();
    expect(none.fields?.some((field) => field.name.startsWith("🎟️"))).toBe(false);
    const empty = buildDailyStatsEmbed("Regatul", { ...PERIOD, invites: { rows: [], attributed: 0, unknown: 0 } }, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO).toJSON();
    expect(empty.fields?.find((field) => field.name.startsWith("🎟️"))?.value).toBe("Nimeni n-a adus membri noi prin invitații în perioada asta.");
  });
  it("raportul de o zi rămâne ca înainte, cu topul invitațiilor în plus", () => {
    const day = { ...PERIOD, day: "2026-11-01", startDay: "2026-11-01", days: 1 };
    const embed = buildDailyStatsEmbed("Regatul", day, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO).toJSON();
    expect(embed.title).toBe("📊 Statistici Zilnice · Regatul");
    expect(JSON.stringify(embed)).toContain("față de ziua dinainte");
    expect(embed.fields?.some((field) => field.name === "🎟️ Top invitații")).toBe(true);
  });
  it("graficul arată perioada, toate zilele ei luminate și compară cu perioada dinainte", () => {
    const input = dailyChartInput("Regatul", PERIOD, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO);
    expect(input.date).toBe("26 octombrie – 1 noiembrie 2026");
    expect(input.kicker).toBe("RAPORT PE 7 ZILE");
    expect(input.compare).toBe("perioada dinainte");
    expect(input.activity.every((day) => day.current)).toBe(true);
    const daily = dailyChartInput("Regatul", { ...PERIOD, startDay: "2026-11-01", days: 1 }, DEFAULT_DAILY_STATS_EMBED_CONFIG, LONG_AGO);
    expect(daily.kicker).toBeUndefined();
    expect(daily.activity.filter((day) => day.current)).toHaveLength(1);
  });
});

describe("trimiterea la N zile", () => {
  it("în afara zilei de raport nu trimite nimic și nici nu citește statisticile", async () => {
    vi.mocked(statsConfig.loadDailyStatsEmbedConfig).mockResolvedValue({ ...DEFAULT_DAILY_STATS_EMBED_CONFIG, channelId: "stats-channel", intervalDays: 7 });
    const query = vi.spyOn(pool, "query").mockResolvedValue({ rows: [] } as never);
    const fetchChannel = vi.fn();
    const client = { guilds: { cache: new Map([["guild-1", { joinedTimestamp: LONG_AGO }]]) }, channels: { fetch: fetchChannel } } as unknown as Client;
    try {
      expect(await publishDailyStatsReport(client, "guild-1", "2026-10-29")).toBe(false);
      expect(fetchChannel).not.toHaveBeenCalled();
      expect(query.mock.calls.some(([sql]) => String(sql).includes("discord_daily_stats WHERE"))).toBe(false);
    } finally {
      query.mockRestore();
    }
  });
  it("în ziua de raport adună cele 7 zile și pune topul invitațiilor", async () => {
    vi.mocked(statsConfig.loadDailyStatsEmbedConfig).mockResolvedValue({ ...DEFAULT_DAILY_STATS_EMBED_CONFIG, channelId: "stats-channel", intervalDays: 7, chart: false });
    const seen: unknown[][] = [];
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql, params) => {
      const text = String(sql);
      seen.push([text, params]);
      if (text.includes("SELECT report_message_id")) return { rows: [] } as never;
      if (text.includes("SUM(d.join_count)")) return { rows: [{ inviter_id: "222222222", inviter_name: "adina", joins: 4 }] } as never;
      if (text.includes("FILTER (WHERE invite_code")) return { rows: [{ attributed: 4, unknown: 1 }] } as never;
      if (text.includes("COUNT(DISTINCT user_id)")) return { rows: [{ count: "20" }] } as never;
      if (text.includes("SUM(message_count)")) return { rows: [{ message_count: 700, joins: 6, leaves: 1, boosts: 0, peak_voice: 5, rows: 7 }] } as never;
      return { rows: [] } as never;
    });
    const send = vi.fn().mockResolvedValue({ id: "report-7" });
    const channel = Object.create(TextChannel.prototype) as TextChannel;
    Object.defineProperties(channel, { guildId: { value: "guild-1" }, send: { value: send } });
    const client = {
      user: { id: "bot-1" },
      guilds: { cache: new Map([["guild-1", { name: "Regatul", joinedTimestamp: LONG_AGO, memberCount: 100, channels: { cache: new Map() } }]]) },
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    } as unknown as Client;
    try {
      expect(await publishDailyStatsReport(client, "guild-1", "2026-11-01")).toBe(true);
      const totals = seen.find(([text]) => String(text).includes("SUM(message_count)"));
      expect((totals![1] as unknown[])[1]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
      const embed = send.mock.calls[0][0].embeds[0].toJSON();
      expect(embed.title).toBe("📊 Statistici · ultimele 7 zile · Regatul");
      expect(embed.fields.find((field: { name: string }) => field.name === "🎟️ Top invitații · 7 zile").value).toContain("<@222222222> · **4** membri noi");
      const marked = seen.find(([text]) => String(text).includes("INSERT INTO discord_daily_stats"));
      expect((marked![1] as unknown[])[1]).toBe("2026-11-01");
    } finally {
      query.mockRestore();
    }
  });
});

describe("topul invitațiilor", () => {
  it("rânduri cu medalii, mențiuni și nume pentru cine nu mai are cont știut", () => {
    expect(inviteTopLines([
      { inviterId: "111111111", inviterName: "a", joins: 5 }, { inviterId: "222222222", inviterName: "b", joins: 1 },
      { inviterId: null, inviterName: "@everyone`x", joins: 1 }, { inviterId: "444444444", inviterName: "d", joins: 1 },
    ])).toEqual([
      "🥇 <@111111111> · **5** membri noi", "🥈 <@222222222> · **1** membru nou", "🥉 **@​everyonex** · **1** membru nou", "**4.** <@444444444> · **1** membru nou",
    ]);
  });
  it("mesajul comenzii arată perioada, totalurile și locul celui care întreabă", () => {
    const data = { rows: [{ inviterId: "111111111", inviterName: "a", joins: 5 }, { inviterId: "222222222", inviterName: "b", joins: 2 }], attributed: 7, unknown: 2 };
    const embed = buildInviteTopEmbed({ guildName: "Regatul", periodLabel: "ultimele 7 zile", data, viewerId: "222222222" }).toJSON();
    expect(embed.title).toBe("🎟️ Topul invitațiilor");
    expect(embed.fields?.find((field) => field.name === "📍 Tu")?.value).toBe("Locul **2** · **2** membri noi");
    expect(embed.fields?.find((field) => field.name === "🟢 Prin invitații")?.value).toBe("7");
    const absent = buildInviteTopEmbed({ guildName: "Regatul", periodLabel: "azi", data: { rows: [], attributed: 0, unknown: 0 }, viewerId: "999" }).toJSON();
    expect(absent.description).toContain("Nimeni n-a adus");
    expect(absent.fields?.find((field) => field.name === "📍 Tu")?.value).toBe("Nu ești în top în perioada asta.");
  });
  it("fără tabelele urmăririi invitațiilor întoarce null, fără eroare", async () => {
    const query = vi.spyOn(pool, "query").mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    try {
      expect(await getTopInviters("guild-1", null, "2026-11-01")).toBeNull();
    } finally {
      query.mockRestore();
    }
  });
});
