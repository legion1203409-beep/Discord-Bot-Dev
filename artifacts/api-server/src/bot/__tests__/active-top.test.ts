import { describe, expect, it, vi } from "vitest";
import { TextChannel, type Client } from "discord.js";
import { pool } from "@workspace/db";

vi.mock("../db", async (importOriginal) => ({
  ...await importOriginal<typeof import("../db")>(),
  loadActiveTopSettings: vi.fn(async () => null),
  saveActiveTopSettings: vi.fn(async () => undefined),
}));

import {
  DEFAULT_ACTIVE_TOP_CONFIG, activeTopLines, buildActiveTopEmbed, normalizeActiveTopConfig, publishActiveTopReport, voiceTime, type ActiveTopData,
} from "../active-top";
import * as db from "../db";

const DATA: ActiveTopData = {
  chat: [{ userId: "111111111", messages: 523 }, { userId: "222222222", messages: 301 }, { userId: "333333333", messages: 1 }],
  voice: [{ userId: "222222222", minutes: 200 }, { userId: "444444444", minutes: 45 }],
  totals: { messages: 2_410, writers: 38, voiceMinutes: 900, talkers: 12 },
};

describe("setările topului activ", () => {
  it("oprit implicit, la 7 zile, top 10, cu voce, fără ping", () => {
    expect(normalizeActiveTopConfig(undefined)).toEqual(DEFAULT_ACTIVE_TOP_CONFIG);
    expect(DEFAULT_ACTIVE_TOP_CONFIG).toMatchObject({ enabled: false, intervalDays: 7, limit: 10, includeVoice: true, mention: false });
  });
  it("curăță valorile proaste", () => {
    expect(normalizeActiveTopConfig({ enabled: true, channelId: "x", intervalDays: 0, limit: 99, color: "rosu" }))
      .toMatchObject({ enabled: true, channelId: "", intervalDays: 7, limit: 10, color: "#d8a964" });
    expect(normalizeActiveTopConfig({ intervalDays: 3, limit: 5, includeVoice: false, mention: true })).toMatchObject({ intervalDays: 3, limit: 5, includeVoice: false, mention: true });
  });
});

describe("mesajul topului", () => {
  it("două liste, chat și voce, cu medalii, timp citibil și totaluri", () => {
    const embed = buildActiveTopEmbed({ guildName: "Regatul", periodLabel: "26 octombrie – 1 noiembrie 2026", data: DATA, config: DEFAULT_ACTIVE_TOP_CONFIG }).toJSON();
    expect(embed.title).toBe("🏆 Cei mai activi membri");
    const chat = embed.fields!.find((field) => field.name === "💬 În chat")!.value;
    expect(chat).toBe("🥇 <@111111111> · **523** mesaje\n🥈 <@222222222> · **301** mesaje\n🥉 <@333333333> · **1** mesaj");
    expect(embed.fields!.find((field) => field.name === "🎙️ Pe voce")!.value).toBe("🥇 <@222222222> · **3 h 20 min**\n🥈 <@444444444> · **45 min**");
    expect(embed.fields!.find((field) => field.name === "📊 Pe scurt")!.value).toBe("**2.410** mesaje de la **38** membri\n**15 h** pe voce, **12** membri");
  });
  it("fără voce, doar chat; liste goale spun asta", () => {
    const embed = buildActiveTopEmbed({
      guildName: "Regatul", periodLabel: "azi", config: { ...DEFAULT_ACTIVE_TOP_CONFIG, includeVoice: false },
      data: { chat: [], voice: [], totals: { messages: 0, writers: 0, voiceMinutes: 0, talkers: 0 } },
    }).toJSON();
    expect(embed.fields!.map((field) => field.name)).toEqual(["💬 În chat", "📊 Pe scurt"]);
    expect(embed.fields![0]!.value).toContain("nimeni n-a scris");
  });
  it("arată locul celui care întreabă și limita aleasă", () => {
    const embed = buildActiveTopEmbed({ guildName: "R", periodLabel: "azi", data: DATA, config: { ...DEFAULT_ACTIVE_TOP_CONFIG, limit: 3 }, viewerId: "222222222" }).toJSON();
    expect(embed.fields!.find((field) => field.name === "📍 Tu")!.value).toBe("Chat: locul **2** · Voce: locul **1**");
    expect(activeTopLines(DATA, 1).chat).toHaveLength(1);
  });
  it("timpul pe voce", () => {
    expect(voiceTime(5)).toBe("5 min");
    expect(voiceTime(60)).toBe("1 h");
    expect(voiceTime(125)).toBe("2 h 5 min");
  });
});

describe("raportul programat", () => {
  const LONG_AGO = Date.parse("2026-01-01T12:00:00Z");
  function setup(config: Record<string, unknown>, claimed = true) {
    vi.mocked(db.loadActiveTopSettings).mockResolvedValue(config);
    const seen: Array<[string, unknown[]]> = [];
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql, params) => {
      const text = String(sql);
      seen.push([text, params as unknown[]]);
      if (text.includes("INSERT INTO discord_active_top_reports")) return { rows: claimed ? [{ guild_id: "g" }] : [], rowCount: claimed ? 1 : 0 } as never;
      if (text.includes("SUM(message_count)::int AS messages FROM")) return { rows: DATA.chat.map((row) => ({ user_id: row.userId, messages: row.messages })) } as never;
      if (text.includes("SUM(minutes)::int AS minutes FROM")) return { rows: DATA.voice.map((row) => ({ user_id: row.userId, minutes: row.minutes })) } as never;
      if (text.includes("FROM discord_daily_users WHERE")) return { rows: [{ messages: 2_410, members: 38 }] } as never;
      if (text.includes("FROM discord_daily_voice WHERE")) return { rows: [{ minutes: 900, members: 12 }] } as never;
      return { rows: [] } as never;
    });
    const send = vi.fn().mockResolvedValue({ id: "top-1" });
    const channel = Object.create(TextChannel.prototype) as TextChannel;
    Object.defineProperties(channel, { guildId: { value: "guild-1" }, send: { value: send } });
    const client = {
      guilds: { cache: new Map([["guild-1", { id: "guild-1", name: "Regatul", joinedTimestamp: LONG_AGO, iconURL: () => null, members: { cache: new Map() }, client: { users: { cache: new Map() } } }]]) },
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    } as unknown as Client;
    return { seen, send, client, restore: () => query.mockRestore() };
  }

  it("la 7 zile, pleacă doar după duminică, cu cele 7 zile, o singură dată", async () => {
    const { seen, send, client, restore } = setup({ enabled: true, channelId: "123456789", intervalDays: 7 });
    try {
      expect(await publishActiveTopReport(client, "guild-1", "2026-10-31")).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expect(await publishActiveTopReport(client, "guild-1", "2026-11-01")).toBe(true);
      const range = seen.find(([text]) => text.includes("SUM(message_count)::int AS messages FROM"))![1];
      expect(range.slice(1, 3)).toEqual(["2026-10-26", "2026-11-01"]);
      const payload = send.mock.calls[0]![0];
      expect(payload.embeds[0].toJSON().description).toBe("Perioada: **26 octombrie – 1 noiembrie 2026**");
      expect(payload.allowedMentions).toEqual({ parse: [] });
      expect(seen.some(([text]) => text.includes("UPDATE discord_active_top_reports SET message_id"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("oprit sau deja trimis: nu trimite", async () => {
    const off = setup({ enabled: false, channelId: "123456789", intervalDays: 1 });
    try {
      expect(await publishActiveTopReport(off.client, "guild-1", "2026-11-01")).toBe(false);
    } finally {
      off.restore();
    }
    const taken = setup({ enabled: true, channelId: "123456789", intervalDays: 1 }, false);
    try {
      expect(await publishActiveTopReport(taken.client, "guild-1", "2026-11-01")).toBe(false);
      expect(taken.send).not.toHaveBeenCalled();
    } finally {
      taken.restore();
    }
  });

  it("cu ping ales, menționează doar membrii din top", async () => {
    const { send, client, restore } = setup({ enabled: true, channelId: "123456789", intervalDays: 1, mention: true });
    try {
      expect(await publishActiveTopReport(client, "guild-1", "2026-11-01")).toBe(true);
      expect(send.mock.calls[0]![0].allowedMentions).toEqual({ users: ["111111111", "222222222", "333333333", "444444444"] });
    } finally {
      restore();
    }
  });
});
