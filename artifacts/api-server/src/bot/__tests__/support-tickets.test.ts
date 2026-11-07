import { describe, expect, it, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { pool } from "@workspace/db";

vi.mock("../db", async (importOriginal) => ({
  ...await importOriginal<typeof import("../db")>(),
  loadSupportTicketsSetting: vi.fn(async () => null),
  saveSupportTicketsSetting: vi.fn(async () => undefined),
}));

import {
  DEFAULT_SUPPORT_TICKETS_CONFIG, buildStaffReputationEmbed, buildTicketPanel, categorySlug, handleSupportTicketInteraction,
  isTicketStaff, normalizeSupportTicketsConfig, ratingRow, reputationScore, stars, ticketChannelName, transcriptLine,
} from "../support-tickets";
import * as db from "../db";

describe("setările tichetelor", () => {
  it("implicit: oprite, cu patru categorii, evaluare pornită, un tichet deschis de om", () => {
    const config = normalizeSupportTicketsConfig(undefined);
    expect(config).toMatchObject({ enabled: false, maxOpenPerUser: 1, deleteAfterClose: true, rating: { enabled: true } });
    expect(config.categories.map((category) => category.id)).toEqual(["ajutor", "raport", "tehnic", "intrebari"]);
  });
  it("categoriile primesc id-uri stabile și unice, iar cele fără nume se scot", () => {
    const config = normalizeSupportTicketsConfig({ categories: [
      { label: "Cerere de rol" }, { label: "Cerere de rol" }, { label: "" }, { id: "Raport!", label: "Raport", staffRoleIds: ["123456789", "x"] },
    ] });
    expect(config.categories.map((category) => category.id)).toEqual(["cerere-de-rol", "cerere-de-rol-2", "raport"]);
    expect(config.categories[2]!.staffRoleIds).toEqual(["123456789"]);
  });
  it("cel mult 25 de categorii (cât încape în meniul Discord) și valori curățate", () => {
    const config = normalizeSupportTicketsConfig({ maxOpenPerUser: 9, color: "rosu", categories: Array.from({ length: 30 }, (_, index) => ({ label: `Categoria ${index}` })) });
    expect(config.categories).toHaveLength(25);
    expect(config.maxOpenPerUser).toBe(1);
    expect(config.color).toBe("#d8a964");
  });
  it("nume de canal citibile", () => {
    expect(categorySlug("Întrebări despre server")).toBe("intrebari-despre-server");
    expect(ticketChannelName(DEFAULT_SUPPORT_TICKETS_CONFIG.categories[1]!, "Ion.Pop_99")).toBe("🚨・raporteaza-un-membru-ion-pop-99");
  });
});

describe("panoul și mesajele", () => {
  it("panoul are titlul, câte un rând pentru fiecare categorie și un meniu", () => {
    const panel = buildTicketPanel(DEFAULT_SUPPORT_TICKETS_CONFIG);
    const embed = panel.embeds[0]!.toJSON();
    expect(embed.title).toBe("🎫 Deschide un tichet");
    expect(embed.fields?.map((field) => field.name)).toEqual(["🙋 Ajutor general", "🚨 Raportează un membru", "🛠️ Problemă tehnică", "❓ Întrebări despre server"]);
    expect(panel.components).toHaveLength(1);
  });
  it("evaluarea are cinci butoane, de la 1 la 5 stele", () => {
    const buttons = ratingRow(42).toJSON().components as Array<{ custom_id: string; label: string }>;
    expect(buttons.map((button) => button.custom_id)).toEqual([1, 2, 3, 4, 5].map((value) => `tichet_rate_42_${value}`));
    expect(stars(4)).toBe("⭐⭐⭐⭐☆");
  });
  it("transcrierea are ora, autorul, textul, embed-urile și fișierele", () => {
    const line = transcriptLine({
      createdAt: new Date("2026-11-06T12:30:00Z"), author: { username: "ion" }, content: "salut",
      attachments: new Map([["1", { url: "https://cdn.discordapp.com/x.png" }]]), embeds: [{ title: "Titlu", description: "Text" }],
    });
    expect(line).toBe("[2026-11-06 12:30] ion: salut\n    [embed] Titlu — Text\n    [fișier] https://cdn.discordapp.com/x.png");
  });
});

describe("reputația staff-ului", () => {
  it("o singură evaluare de 5 nu bate douăzeci de 4", () => {
    expect(reputationScore(5, 1)).toBeLessThan(reputationScore(4, 20));
    expect(reputationScore(4.8, 30)).toBeGreaterThan(reputationScore(4, 20));
  });
  it("clasamentul arată media, evaluările și tichetele", () => {
    const embed = buildStaffReputationEmbed({ guildName: "Regatul", periodLabel: "ultimele 30 de zile", viewerId: "222222222", rows: [
      { staffId: "111111111", ratings: 12, average: 4.75, score: 4.5, handled: 15, distribution: [0, 0, 1, 1, 10] },
      { staffId: "222222222", ratings: 1, average: 4, score: 3.6, handled: 1, distribution: [0, 0, 0, 1, 0] },
    ] }).toJSON();
    expect(embed.description).toBe("🥇 <@111111111> · **4,8** ⭐ din 12 evaluări · 15 tichete\n🥈 <@222222222> · **4,0** ⭐ din 1 evaluare · 1 tichet");
    expect(embed.fields?.find((field) => field.name === "📍 Tu")?.value).toBe("Locul **2** · ⭐⭐⭐⭐☆");
  });
  it("staff: rolul ales sau Manage Server", () => {
    const member = (roles: string[], manage = false) => ({ roles: { cache: new Map(roles.map((id) => [id, {}])) }, permissions: { has: (flag: bigint) => manage && flag === PermissionFlagsBits.ManageGuild } });
    expect(isTicketStaff(member(["staff"]) as never, ["staff"])).toBe(true);
    expect(isTicketStaff(member([], true) as never, ["staff"])).toBe(true);
    expect(isTicketStaff(member(["altul"]) as never, ["staff"])).toBe(false);
  });
});

describe("butoanele din tichet", () => {
  const ON = { ...DEFAULT_SUPPORT_TICKETS_CONFIG, enabled: true, staffRoleIds: ["555555555"], logChannelId: "", panelChannelId: "" };
  function interaction(customId: string, extra: Record<string, unknown> = {}) {
    const replies: unknown[] = [];
    return {
      replies,
      value: {
        customId, guildId: "guild-1", guild: { id: "guild-1" }, user: { id: "999999999", username: "ion" },
        inGuild: () => true, isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false,
        member: { roles: { cache: new Map() }, permissions: { has: () => false } },
        reply: vi.fn(async (payload: unknown) => { replies.push(payload); }), update: vi.fn(), deferReply: vi.fn(), editReply: vi.fn(),
        deferred: false, replied: false, ...extra,
      },
    };
  }
  const ticketRow = { id: 7, guild_id: "guild-1", channel_id: "c1", opener_id: "111111111", category_id: "ajutor", category_label: "Ajutor general", status: "open", claimed_by: null, rating: null };

  it("doar staff-ul poate prelua", async () => {
    vi.mocked(db.loadSupportTicketsSetting).mockResolvedValue(ON);
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql) => (String(sql).includes("SELECT * FROM support_tickets") ? { rows: [ticketRow] } : { rows: [], rowCount: 0 }) as never);
    try {
      const { value, replies } = interaction("tichet_claim_7");
      expect(await handleSupportTicketInteraction(value as never)).toBe(true);
      expect(JSON.stringify(replies[0])).toContain("Doar staff-ul poate prelua");
      expect(query.mock.calls.some(([sql]) => String(sql).includes("SET claimed_by"))).toBe(false);
    } finally {
      query.mockRestore();
    }
  });

  it("cine nu e nici staff, nici autorul nu poate închide", async () => {
    vi.mocked(db.loadSupportTicketsSetting).mockResolvedValue(ON);
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql) => (String(sql).includes("SELECT * FROM support_tickets") ? { rows: [ticketRow] } : { rows: [] }) as never);
    try {
      const { value, replies } = interaction("tichet_close_7");
      await handleSupportTicketInteraction(value as never);
      expect(JSON.stringify(replies[0])).toContain("Doar cine a deschis tichetul sau staff-ul");
    } finally {
      query.mockRestore();
    }
  });

  it("evaluarea o poate da doar cine a deschis tichetul, o singură dată", async () => {
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (String(sql).includes("UPDATE support_tickets SET rating")) return { rows: [] } as never;
      if (String(sql).includes("SELECT * FROM support_tickets")) return { rows: [{ ...ticketRow, status: "closed", rating: 5 }] } as never;
      return { rows: [] } as never;
    });
    try {
      const stranger = interaction("tichet_rate_7_5");
      await handleSupportTicketInteraction(stranger.value as never);
      expect(JSON.stringify(stranger.replies[0])).toContain("Doar cine a deschis tichetul");
      const owner = interaction("tichet_rate_7_5", { user: { id: "111111111", username: "x" } });
      await handleSupportTicketInteraction(owner.value as never);
      expect(JSON.stringify(owner.replies[0])).toContain("Ai evaluat deja");
    } finally {
      query.mockRestore();
    }
  });

  it("deschiderea creează un canal privat: membrul, staff-ul și botul îl văd, restul nu", async () => {
    vi.mocked(db.loadSupportTicketsSetting).mockResolvedValue(ON);
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql) => {
      if (String(sql).includes("RETURNING id")) return { rows: [{ id: 11 }] } as never;
      return { rows: [] } as never;
    });
    const send = vi.fn(async () => ({}));
    const create = vi.fn(async (options: Record<string, unknown>) => ({ id: "new-channel", send, options }));
    const editReply = vi.fn();
    const guild = {
      id: "guild-1", roles: { everyone: { id: "guild-1" }, cache: new Map([["555555555", {}]]) },
      channels: { cache: new Map(), create },
    };
    try {
      await handleSupportTicketInteraction({
        customId: "tichet_open", values: ["ajutor"], guildId: "guild-1", guild, inGuild: () => true,
        isButton: () => false, isStringSelectMenu: () => true, isModalSubmit: () => false,
        user: { id: "999999999", username: "Ion", globalName: "Ion", displayAvatarURL: () => "https://cdn.discordapp.com/a.png" },
        client: { user: { id: "bot-1" } }, deferReply: vi.fn(), editReply, reply: vi.fn(), deferred: true, replied: false,
      } as never);
      const options = create.mock.calls[0]![0] as { name: string; permissionOverwrites: Array<{ id: string; allow?: bigint[]; deny?: bigint[] }> };
      expect(options.name).toBe("🙋・ajutor-general-ion");
      const byId = new Map(options.permissionOverwrites.map((item) => [item.id, item]));
      expect(byId.get("guild-1")!.deny).toContain(PermissionFlagsBits.ViewChannel);
      for (const id of ["999999999", "555555555", "bot-1"]) expect(byId.get(id)!.allow).toContain(PermissionFlagsBits.ViewChannel);
      const welcome = send.mock.calls[0]![0] as { content: string; components: Array<{ toJSON(): { components: Array<{ custom_id: string }> } }> };
      expect(welcome.content).toBe("<@999999999> <@&555555555>");
      expect(welcome.components[0]!.toJSON().components.map((button) => button.custom_id)).toEqual(["tichet_claim_11", "tichet_close_11"]);
      expect(editReply).toHaveBeenCalledWith("✅ Tichetul tău e gata: <#new-channel>");
    } finally {
      query.mockRestore();
    }
  });

  it("cu un tichet deja deschis nu se mai deschide altul", async () => {
    vi.mocked(db.loadSupportTicketsSetting).mockResolvedValue(ON);
    const query = vi.spyOn(pool, "query").mockImplementation(async (sql) => (String(sql).includes("status = 'open' AND category_id NOT LIKE 'ext:%' ORDER BY") ? { rows: [{ channel_id: "old" }] } : { rows: [] }) as never);
    const create = vi.fn();
    const editReply = vi.fn();
    try {
      await handleSupportTicketInteraction({
        customId: "tichet_open", values: ["ajutor"], guildId: "guild-1", inGuild: () => true,
        guild: { id: "guild-1", channels: { cache: new Map([["old", {}]]), create }, roles: { everyone: { id: "guild-1" }, cache: new Map() } },
        isButton: () => false, isStringSelectMenu: () => true, isModalSubmit: () => false,
        user: { id: "999999999", username: "Ion" }, deferReply: vi.fn(), editReply, reply: vi.fn(), deferred: true,
      } as never);
      expect(create).not.toHaveBeenCalled();
      expect(String(editReply.mock.calls[0]![0])).toContain("Ai deja un tichet deschis: <#old>");
    } finally {
      query.mockRestore();
    }
  });
});
