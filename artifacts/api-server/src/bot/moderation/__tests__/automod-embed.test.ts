import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { defaultModerationConfig } from "../../../moderation/config";
import { buildAutomodEmbed, quoteBlock } from "../automod-embed";
import { describeAttachment, formatBytes, isDiscordCdnUrl } from "../log-media";
import { deliverActivityLog } from "../events";

const guild = {
  id: "999", name: "Regatul",
  members: { cache: new Map([["555", { displayName: "Ion", user: { username: "ion" }, displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/1.png" }]]) },
} as unknown as Guild;
const base = {
  guild, kind: "scam" as const, detail: "Link fals: Imită discord", userId: "555", channelId: "123", actionSummary: "Mesaj șters", source: "AutoMod",
  messageContent: "Ia nitro gratis https://dlscord-nitro.com/x @everyone", attachments: [],
};

describe("mesajul de jurnal pentru Anti-Scam și AutoMod", () => {
  it("arată cine, unde, ce s-a făcut și mesajul postat", async () => {
    const { embed } = await buildAutomodEmbed(base);
    const json = embed.toJSON();
    expect(json.title).toBe("🚨 Scam oprit");
    expect(json.color).toBe(0xd94a2b);
    expect(json.author?.name).toBe("Ion");
    expect(json.fields?.map((f) => f.name)).toEqual(["Membru", "Canal", "Acțiune", "💬 Mesajul postat"]);
    expect(json.fields?.[3]?.value).toContain("> Ia nitro gratis https://dlscord-nitro.com/x");
  });
  it("mesajul lung nu se mai pierde și nu poate face ping", async () => {
    const long = `@everyone ${"scam ".repeat(400)}`;
    const json = (await buildAutomodEmbed({ ...base, messageContent: long })).embed.toJSON();
    const value = json.fields!.find((f) => f.name === "💬 Mesajul postat")!.value;
    expect(value.length).toBeLessThanOrEqual(1_024);
    expect(value).toContain("text trunchiat");
    expect(value).not.toContain("@everyone");
  });
  it("fără text spune asta, iar atașamentele se listează cu tip și mărime", async () => {
    const json = (await buildAutomodEmbed({
      ...base, messageContent: "",
      attachments: [{ name: "poza.png", url: "https://cdn.discordapp.com/attachments/111111/222222/poza.png", size: 245_000, contentType: "image/png" }, { name: "setup.exe", url: "https://cdn.discordapp.com/attachments/111111/222222/setup.exe", size: 2_000_000, contentType: "application/x-msdownload" }],
    })).embed.toJSON();
    expect(json.fields!.find((f) => f.name === "💬 Mesajul postat")!.value).toBe("_(fără text)_");
    const files = json.fields!.find((f) => f.name.startsWith("📎"))!.value;
    expect(files).toContain("🖼️ [poza.png]");
    expect(files).toContain("imagine · 239 KB");
    expect(files).toContain("setup.exe");
    expect(json.image?.url).toBe("https://cdn.discordapp.com/attachments/111111/222222/poza.png");
  });
  it("textul găsit în imagine și eșecul de ștergere apar", async () => {
    const json = (await buildAutomodEmbed({ ...base, extractedText: "WITHDRAWAL SUCCESS $500", deletionFailed: true })).embed.toJSON();
    expect(json.fields!.some((f) => f.name === "🔎 Text găsit în imagine")).toBe(true);
    expect(json.fields!.find((f) => f.name.includes("Acțiune"))!.value).toContain("nu a putut fi șters");
  });
  it("semnalarea AI are stilul ei", async () => {
    expect((await buildAutomodEmbed({ ...base, kind: "ai", category: "Scam · încredere 91%" })).embed.toJSON().footer?.text).toContain("Scam · încredere 91%");
  });
});

describe("ajutoare pentru poze și fișiere", () => {
  it("citește doar de pe CDN-ul Discord", () => {
    expect(isDiscordCdnUrl("https://cdn.discordapp.com/attachments/111111/222222/a.png")).toBe(true);
    expect(isDiscordCdnUrl("https://media.discordapp.net/attachments/111111/222222/a.png")).toBe(true);
    expect(isDiscordCdnUrl("https://evil.example/a.png")).toBe(false);
    expect(isDiscordCdnUrl("http://cdn.discordapp.com/a.png")).toBe(false);
    expect(isDiscordCdnUrl("https://cdn.discordapp.com.evil.xyz/a.png")).toBe(false);
  });
  it("mărimi și tipuri", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(3_500_000)).toBe("3.3 MB");
    expect(describeAttachment({ name: "film.mp4", contentType: "video/mp4", size: 1_048_576 * 5 })).toBe("🎞️ `film.mp4` · video · 5.0 MB");
    expect(describeAttachment({ name: "x.zip" })).toContain("🗜️");
  });
  it("citatul păstrează liniile", () => expect(quoteBlock("a\nb")).toBe("> a\n> b"));
});

describe("mesaj șters: poze și alte atașamente", () => {
  it("arată autorul, atașamentele cu tip, stickerele, linkurile și poza", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "123456";
    const send = vi.fn(async (_payload: unknown) => undefined);
    const author = { displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/3.png" };
    const g = { id: "999999", name: "Regatul", client: { users: { cache: new Map([["555", author]]) } }, channels: { cache: new Map([["123456", { guildId: "999999", isTextBased: () => true, send }]]) } } as unknown as Guild;
    await deliverActivityLog(g, config, "discord.message_delete", "message", "1", {
      actorVerified: true, actorId: "777", channelId: "888", displayMessageAuthorId: "555",
      displayDeletedMessages: [{
        authorId: "555", content: "", attachmentCount: 2,
        attachments: [{ name: "poza.png", url: "https://cdn.discordapp.com/attachments/111111/222222/poza.png", size: 120_000, contentType: "image/png" }, { name: "cv.pdf", url: "https://cdn.discordapp.com/attachments/111111/222222/cv.pdf", size: 3_000, contentType: "application/pdf" }],
        stickers: ["Salut"], embedLinks: ["https://exemplu.ro/pagina"],
        imageAttachments: [{ url: "https://cdn.discordapp.com/attachments/111111/222222/poza.png", contentType: "image/png" }],
      }],
    });
    const embed = (send.mock.calls[0]![0] as any).embeds[0].toJSON();
    expect(embed.thumbnail.url).toBe("https://cdn.discordapp.com/embed/avatars/3.png");
    expect(embed.image.url).toBe("https://cdn.discordapp.com/attachments/111111/222222/poza.png");
    const names = embed.fields.map((f: any) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Conținut șters", "Atașamente (2)", "Stickere", "Linkuri"]));
    expect(embed.fields.find((f: any) => f.name === "Atașamente (2)").value).toContain("📄 [cv.pdf]");
    expect(embed.fields.find((f: any) => f.name === "Linkuri").value).toContain("exemplu.ro/pagina");
  });
});
