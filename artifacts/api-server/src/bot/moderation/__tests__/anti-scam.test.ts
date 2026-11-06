import { describe, expect, it } from "vitest";
import {
  CrossChannelFloodTracker, dangerousAttachmentReason, detectDangerousAttachment, detectPhishingLink, floodDetection,
} from "../anti-scam";

describe("linkuri false", () => {
  const fake = [
    "https://discord-nitro.com/claim", "https://dlscord.gift/abc", "http://discorcl.com/login", "https://disc0rd.xyz",
    "https://discord.xyz/free", "https://discord.com.verifica-cont.xyz/login", "https://steamcommunlty.com/gift/12", "https://steam-gift.ru",
    "https://robloxfree.xyz", "discord-nitro.xyz/claim", "Ia nitro gratis aici: https://dIscord-gifts.com/x",
  ];
  for (const text of fake) {
    it(`prinde: ${text}`, () => expect(detectPhishingLink(text)?.kind).toBe("scam"));
  }

  const fine = [
    "https://discord.com/channels/1/2", "https://discord.gg/abc", "https://cdn.discordapp.com/attachments/1/2/x.png", "https://discord.gift/xyz",
    "https://store.steampowered.com/app/10", "https://steamcommunity.com/id/ion", "https://www.roblox.com/games/1", "https://discord.js.org/docs",
    "https://top.gg/bot/1", "https://youtube.com/watch?v=1", "https://example.com/discord", "https://github.com/steam-tools/readme",
    "salut, ne vedem la ora 5", "versiunea 1.2.3 e gata",
  ];
  for (const text of fine) {
    it(`lasă în pace: ${text}`, () => expect(detectPhishingLink(text)).toBeNull());
  }

  it("un domeniu de încredere ales de server nu se mai blochează", () => {
    expect(detectPhishingLink("https://discord-nitro.com/x")).not.toBeNull();
    expect(detectPhishingLink("https://discord-nitro.com/x", ["discord-nitro.com"])).toBeNull();
  });
});

describe("fișiere periculoase", () => {
  it("prinde executabilele și dubla extensie", () => {
    expect(dangerousAttachmentReason("setup.exe")).toContain("executabil");
    expect(dangerousAttachmentReason("poza.png.exe")).toContain("dublă extensie");
    expect(dangerousAttachmentReason("Factura.PDF.scr")).toContain("dublă extensie");
    expect(detectDangerousAttachment(["ok.png", "x.bat"])?.detail).toContain("x.bat");
  });
  it("nu atinge fișierele obișnuite", () => {
    for (const name of ["poza.png", "film.mp4", "arhiva.zip", "notite.txt", "fara-extensie", "script.js.txt"]) expect(dangerousAttachmentReason(name)).toBeNull();
  });
});

describe("același mesaj în mai multe canale", () => {
  const settings = { channels: 3, windowSeconds: 60 };
  const msg = (channelId: string, id: string, content = "Nitro gratis https://exemplu.xyz/abc") => ({ channelId, messageId: id, content });

  it("se declanșează la al treilea canal și întoarce mesajele de ștears", () => {
    const tracker = new CrossChannelFloodTracker();
    expect(tracker.record("g:u", msg("1", "a"), settings, 1_000)).toBeNull();
    expect(tracker.record("g:u", msg("2", "b"), settings, 2_000)).toBeNull();
    expect(tracker.record("g:u", msg("3", "c"), settings, 3_000)).toEqual([{ channelId: "1", messageId: "a" }, { channelId: "2", messageId: "b" }]);
  });
  it("același canal de mai multe ori nu e un flood de canale", () => {
    const tracker = new CrossChannelFloodTracker();
    for (let i = 0; i < 5; i += 1) expect(tracker.record("g:u", msg("1", `m${i}`), settings, 1_000 + i)).toBeNull();
  });
  it("după fereastră, începe de la zero", () => {
    const tracker = new CrossChannelFloodTracker();
    tracker.record("g:u", msg("1", "a"), settings, 1_000);
    tracker.record("g:u", msg("2", "b"), settings, 2_000);
    expect(tracker.record("g:u", msg("3", "c"), settings, 90_000)).toBeNull();
  });
  it("mesaje obișnuite, fără link, și mesaje scurte sunt ignorate", () => {
    const tracker = new CrossChannelFloodTracker();
    for (const [i, channel] of ["1", "2", "3", "4"].entries()) expect(tracker.record("g:u", msg(channel, `m${i}`, "salut tuturor, ce mai faceți"), settings, 1_000 + i)).toBeNull();
    expect(CrossChannelFloodTracker.fingerprint("@here")).toBeNull();
  });
  it("membri diferiți nu se amestecă", () => {
    const tracker = new CrossChannelFloodTracker();
    tracker.record("g:u1", msg("1", "a"), settings, 1_000);
    tracker.record("g:u2", msg("2", "b"), settings, 1_100);
    expect(tracker.record("g:u3", msg("3", "c"), settings, 1_200)).toBeNull();
  });
  it("detecția are un text clar", () => expect(floodDetection(3, 60).detail).toContain("3 canale în 60 s"));
});
