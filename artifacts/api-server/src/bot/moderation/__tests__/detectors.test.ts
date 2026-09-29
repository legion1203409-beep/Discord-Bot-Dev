import { describe, expect, it } from "vitest";
import {
  SlidingRateLimiter,
  SlidingUniqueMessageRateLimiter,
  capsPercent,
  containsBlockedWord,
  countEmoji,
  detectContent,
  detectScamContent,
  detectScamImageText,
  findBlockedLink,
  longestRepeatedRun,
} from "../detectors";
import { contentThresholdsForConfig, escalationActionForCount, parseAiModerationFinding, repeatedMessageCount, reserveAutomaticAction } from "../engine";
import { ModerationConfigSchema } from "../../../moderation/config";

describe("moderation detectors", () => {
  it("matches blocked words at boundaries and ignores innocent substrings", () => {
    expect(containsBlockedWord("Acesta este un prost.", ["prost"])).toBe("prost");
    expect(containsBlockedWord("prostește nu este atacul configurat", ["prost"])).toBeNull();
  });

  it("detects money-winning claims, high-risk reward prompts, and configured phrases", () => {
    expect(detectScamContent("Ai câștigat 500 USD! Intră pe link.")).toMatchObject({ kind: "scam" });
    expect(detectScamContent("You just won $250, claim your reward now.")).toMatchObject({ kind: "scam" });
    expect(detectScamContent("Verify your wallet to receive the free crypto")).toMatchObject({ kind: "scam" });
    expect(detectScamContent("Ai câștigat campionatul anul trecut.")).toBeNull();
    expect(detectScamContent("un mesaj cu zero-width cl\u200Baim bonus", ["claim bonus"])).toMatchObject({ kind: "scam" });
  });

  it("requires multiple payout-promotion signals for noisy scam-image OCR", () => {
    expect(detectScamImageText("@everyone MrBeast BONUSES Activate Withdrawial Success 5600")).toMatchObject({ kind: "scam" });
    expect(detectScamImageText("You just won $200!")).toMatchObject({ kind: "scam" });
    expect(detectScamImageText("MrBeast BONUSES and games for fans")).toBeNull();
    expect(detectScamImageText("Withdrawal Success! Paid $5600")).toBeNull();
    expect(detectScamImageText("BONUSES Withdrawal Success! MrBeast")).toBeNull();
    expect(detectScamImageText("BONUSES\nWithdrawal Success! MrBeast\nActivate")).toMatchObject({ kind: "scam" });
    expect(detectScamImageText("You won\nMrBeast bonus\n$200")).toBeNull();
  });

  it("matches exact and subdomain blocked link hosts", () => {
    expect(findBlockedLink("vezi https://cdn.evil.example/path", ["evil.example"])).toBe("evil.example");
    expect(findBlockedLink("https://not-evil.example", ["evil.example"])).toBeNull();
  });

  it("blocks only selected link categories, including bare Discord invites", () => {
    expect(findBlockedLink("discord.gg/abc", [], { discordInvite: true })).toContain("Discord");
    expect(findBlockedLink("https://discord.com/invite/abc", [], { discordInvite: true })).toContain("Discord");
    expect(findBlockedLink("https://discord.com/channels/123", [], { discordInvite: true })).toBeNull();
    expect(findBlockedLink("https://notdiscord.gg/invite", [], { discordInvite: true })).toBeNull();
    expect(findBlockedLink("evil-discord.gg/abc", [], { discordInvite: true })).toBeNull();
    expect(findBlockedLink("https://evil.example/discord.gg/abc", [], { discordInvite: true })).toBeNull();
    expect(findBlockedLink("https://www.instagram.com/reel/1", [], { social: true })).toContain("sociale");
    expect(findBlockedLink("https://youtube.com/watch?v=x", [], { video: true })).toContain("video");
    expect(findBlockedLink("https://bit.ly/abc", [], { shortener: true })).toContain("scurtate");
    expect(findBlockedLink("https://example.com", [], { social: true })).toBeNull();
    expect(findBlockedLink("https://example.com", [], { all: true })).toContain("toate");
    expect(findBlockedLink("https://example.com", [])).toBeNull();
    expect(detectContent("discord.gg/abc", { blockedLinkCategories: { discordInvite: true } })).toEqual([
      expect.objectContaining({ kind: "link" }),
    ]);
  });

  it("keeps link categories off for existing servers and parses saved selections", () => {
    const oldConfig = ModerationConfigSchema.parse({});
    expect(Object.values(oldConfig.autoMod.forbiddenLinkCategories).every((enabled) => !enabled)).toBe(true);
    const selected = ModerationConfigSchema.parse({
      autoMod: { forbiddenLinks: ["example.org"], forbiddenLinkCategories: { discordInvite: true } },
    });
    expect(selected.autoMod.forbiddenLinks).toEqual(["example.org"]);
    expect(selected.autoMod.forbiddenLinkCategories.discordInvite).toBe(true);
    expect(selected.autoMod.forbiddenLinkCategories.social).toBe(false);
  });

  it("detects caps, emoji, repeats, length, symbols and mentions", () => {
    const content = "AAAAA 😀😀😀 <@12345> !!!!!";
    expect(capsPercent(content)).toBe(100);
    expect(countEmoji(content)).toBe(3);
    expect(longestRepeatedRun("nooooo")).toBe(5);
    expect(detectContent(content, {
      thresholds: { capsPercent: 80, emoji: 2, repeat: 4, maxLength: 5, maxSymbolRun: 4, mentions: 0 },
    }).map((found) => found.kind)).toEqual(expect.arrayContaining(["caps", "emoji", "repeat", "length", "symbols", "mentions"]));
  });

  it("uses the selected anti-spam emoji and anti-flood caps limits when AutoMod is disabled", () => {
    const config = ModerationConfigSchema.parse({
      antiSpam: { enabled: true, emoji: { enabled: true, action: "warn", thresholds: { emoji: 2 } } },
      antiFlood: { enabled: true, caps: { enabled: true, action: "warn", thresholds: { capsPercent: 50 } } },
    });
    const thresholds = contentThresholdsForConfig(config, "channel-1");
    expect(thresholds.emoji).toBe(2);
    expect(thresholds.capsPercent).toBe(50);
    expect(detectContent("😀😀😀", { thresholds }).map((finding) => finding.kind)).toContain("emoji");
    expect(detectContent("HELLO world", { thresholds }).map((finding) => finding.kind)).toContain("caps");
  });

  it("prefers enabled AutoMod limits and falls back to the other active section when a rule is off", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: {
        enabled: true,
        emojiLimit: { enabled: true, action: "warn", thresholds: { emoji: 10 } },
        capsLimit: { enabled: false, thresholds: { capsPercent: 90 } },
      },
      antiSpam: { enabled: true, emoji: { enabled: true, thresholds: { emoji: 2 } } },
      antiFlood: { enabled: true, caps: { enabled: true, thresholds: { capsPercent: 40 } } },
    });
    const thresholds = contentThresholdsForConfig(config, "channel-1");
    expect(thresholds.emoji).toBe(10);
    expect(thresholds.capsPercent).toBe(40);
    expect(detectContent("😀😀😀", { thresholds }).some((finding) => finding.kind === "emoji")).toBe(false);
    config.autoMod.enabled = false;
    config.antiSpam.enabled = false;
    config.antiFlood.enabled = false;
    expect(contentThresholdsForConfig(config, "channel-1")).toMatchObject({ emoji: undefined, capsPercent: undefined });
  });

  it("keeps rates isolated by caller key and expires old samples", () => {
    const limiter = new SlidingRateLimiter();
    expect(limiter.hit("guild-a:user", { limit: 1, windowMs: 1_000 }, 10).exceeded).toBe(false);
    expect(limiter.hit("guild-b:user", { limit: 1, windowMs: 1_000 }, 11).exceeded).toBe(false);
    expect(limiter.hit("guild-a:user", { limit: 1, windowMs: 1_000 }, 12).exceeded).toBe(true);
    expect(limiter.hit("guild-a:user", { limit: 1, windowMs: 1_000 }, 1_020).exceeded).toBe(false);
  });

  it("triggers message spam at the configured count without counting edits or replays twice", () => {
    const limiter = new SlidingUniqueMessageRateLimiter();
    expect(limiter.hit("guild-a:user", "message-1", 2, 1_000, 10)).toEqual({ count: 1, reached: false });
    expect(limiter.hit("guild-a:user", "message-1", 2, 1_000, 11)).toEqual({ count: 1, reached: false });
    expect(limiter.hit("guild-b:user", "message-2", 2, 1_000, 12).reached).toBe(false);
    expect(limiter.hit("guild-a:user", "message-2", 2, 1_000, 13)).toEqual({ count: 2, reached: true });
    expect(limiter.hit("guild-a:user", "message-3", 2, 1_000, 1_014)).toEqual({ count: 1, reached: false });
  });

  it("counts repeated message bodies separately from repeated characters", () => {
    expect(repeatedMessageCount("guild:user:channel", "același mesaj", 10_000, 100)).toBe(1);
    expect(repeatedMessageCount("guild:user:channel", "același mesaj", 10_000, 200)).toBe(2);
    expect(repeatedMessageCount("guild:user:channel", "mesaj diferit", 10_000, 300)).toBe(1);
  });

  it("does not count an edited or replayed message twice and resets after the window", () => {
    const key = "guild:user:repeated-message-id";
    expect(repeatedMessageCount(key, "același mesaj", 1_000, 100, "message-1")).toBe(1);
    expect(repeatedMessageCount(key, "ACELAȘI MESAJ", 1_000, 150, "message-1")).toBe(1);
    expect(repeatedMessageCount(key, "același mesaj", 1_000, 200, "message-2")).toBe(2);
    expect(repeatedMessageCount(key, "același mesaj", 1_000, 1_300, "message-3")).toBe(1);
  });

  it("never lowers the repeated-character threshold to one on hard severity", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: { enabled: true, repeatBlock: { enabled: true, action: "warn", severity: "hard",
        thresholds: { repeat: 2, messages: 2, windowMs: 10 } } },
    });
    expect(config.autoMod.repeatBlock.thresholds).toMatchObject({ repeat: 2, messages: 2, windowMs: 10 });
    const thresholds = contentThresholdsForConfig(config, "channel");
    expect(thresholds.repeat).toBe(2);
    expect(detectContent("abcde", { thresholds }).some((finding) => finding.kind === "repeat")).toBe(false);
    expect(detectContent("aabc", { thresholds }).some((finding) => finding.kind === "repeat")).toBe(true);
  });

  it("reserves an automatic action once per message/rule key", () => {
    expect(reserveAutomaticAction("guild:message:word:mute", 1_000, 1_000)).toBe(true);
    expect(reserveAutomaticAction("guild:message:word:mute", 1_001, 1_000)).toBe(false);
    expect(reserveAutomaticAction("guild:message:word:mute", 2_001, 1_000)).toBe(true);
  });

  it("accepts a complete, enabled AI category with enough confidence under its own incident kind", () => {
    expect(parseAiModerationFinding(
      '{"violation":true,"category":"attacks","confidence":0.82}',
      "stop", ["attacks"], "medium",
    )).toEqual({ kind: "ai", detail: "Moderare AI: attacks", count: 82 });
    expect(parseAiModerationFinding(
      '{"violation":true,"category":"attacks","confidence":0.65}',
      "stop", ["attacks"], "high",
    )).toMatchObject({ kind: "ai" });
  });

  it("fails closed on truncated, malformed, disabled, and low-confidence AI responses", () => {
    const result = '{"violation":true,"category":"attacks","confidence":0.7}';
    expect(parseAiModerationFinding("", "length", ["attacks"], "high")).toBeNull();
    expect(parseAiModerationFinding(result, "length", ["attacks"], "high")).toBeNull();
    expect(parseAiModerationFinding("{not JSON", "stop", ["attacks"], "high")).toBeNull();
    expect(parseAiModerationFinding(result, "stop", ["toxicity"], "high")).toBeNull();
    expect(parseAiModerationFinding(result, "stop", ["attacks"], "low")).toBeNull();
    expect(parseAiModerationFinding('{"violation":"true","category":"attacks","confidence":1}', "stop", ["attacks"], "high")).toBeNull();
  });

  it("uses configured escalation only after its persisted upcoming offense threshold", () => {
    const config = {
      escalation: {
        enabled: true,
        levels: [{ violations: 2, action: "mute" }],
      },
    } as any;
    expect(escalationActionForCount(config, "warn", 1)).toBe("warn");
    expect(escalationActionForCount(config, "warn", 2)).toBe("mute");
    config.escalation.enabled = false;
    expect(escalationActionForCount(config, "warn", 99)).toBe("warn");
  });
});