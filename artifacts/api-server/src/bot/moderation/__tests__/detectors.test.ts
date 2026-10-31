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
import { activeSeverity, aiActionForCategory, aiDeleteMessageForCategory, aiModerationPrompt, aiRuleForCategory, contentThresholdsForConfig, escalationActionForCount, escalationLevelForCount, isAiExcluded, parseAiModerationFinding, repeatedMessageCount, reserveAutomaticAction, ruleAtEscalationLevel } from "../engine";
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
    )).toEqual({ kind: "ai", category: "attacks", detail: "Moderare AI: attacks", count: 82 });
    expect(parseAiModerationFinding(
      '{"violation":true,"category":"attacks","confidence":0.65}',
      "stop", ["attacks"], "high",
    )).toMatchObject({ kind: "ai" });
  });

  it("understands all scripts in its instructions and only offers enabled categories", () => {
    const prompt = aiModerationPrompt("calm", ["scams", "deceptiveLinks"]);
    expect(prompt).toContain("ANY language or script");
    expect(prompt).toContain("mixed languages");
    expect(prompt).toContain("scams:");
    expect(prompt).toContain("deceptiveLinks:");
    expect(prompt).not.toContain("threats:");
    expect(prompt).toContain("bare or unfamiliar URL alone is not proof");
  });

  it("uses category-specific sensitivity and action, falling back to global defaults", () => {
    const ai = ModerationConfigSchema.parse({
      ai: {
        sensitivity: "low", action: "warn",
        categorySettings: {
          scams: { sensitivity: "high", action: "ban" },
          threats: { action: "none" },
        },
      },
    }).ai;
    const finding = '{"violation":true,"category":"scams","confidence":0.7}';
    expect(parseAiModerationFinding(finding, "stop", ["scams"], ai.sensitivity, ai.categorySettings)?.category).toBe("scams");
    expect(parseAiModerationFinding('{"violation":true,"category":"threats","confidence":0.7}', "stop", ["threats"], ai.sensitivity, ai.categorySettings)).toBeNull();
    expect(parseAiModerationFinding(finding, "stop", ["scams"], "low")).toBeNull();
    expect(aiActionForCategory(ai, "scams")).toBe("ban");
    expect(aiActionForCategory(ai, "threats")).toBe("none");
    expect(aiActionForCategory(ai, "attacks")).toBe("warn");
  });

  it("gives each AI category the general ticks until it chooses its own actions", () => {
    const ai = ModerationConfigSchema.parse({
      ai: {
        action: "mute", deleteMessage: true, warnMember: true, alertStaff: true, muteMinutes: 120,
        categorySettings: {
          threats: { action: "ban", deleteMessage: true },
          scams: { sensitivity: "high" },
          toxicity: { action: "mute", deleteMessage: false, muteMinutes: 15, alertStaff: true },
        },
      },
    }).ai;
    // Only a sensitivity of its own: the category still follows every general tick.
    expect(aiRuleForCategory(ai, "scams")).toEqual({ action: "mute", deleteMessage: true, warnMember: true, alertStaff: true, muteMinutes: 120 });
    expect(aiRuleForCategory(ai, "bullying")).toEqual(aiRuleForCategory(ai, "scams"));
    // Its own actions: what the category ticked is the whole story.
    expect(aiRuleForCategory(ai, "threats")).toEqual({ action: "ban", deleteMessage: true, warnMember: false, alertStaff: false });
    expect(aiRuleForCategory(ai, "toxicity")).toEqual({ action: "mute", deleteMessage: false, warnMember: false, alertStaff: true, muteMinutes: 15 });
  });

  it("reads AI settings saved before the extra ticks existed exactly as before", () => {
    const ai = ModerationConfigSchema.parse({ ai: { action: "warn", deleteMessage: true, categorySettings: { attacks: { action: "kick" } } } }).ai;
    expect(aiRuleForCategory(ai, "attacks")).toEqual({ action: "kick", deleteMessage: true, warnMember: false, alertStaff: false });
    expect(aiRuleForCategory(ai, "toxicity")).toEqual({ action: "warn", deleteMessage: true, warnMember: false, alertStaff: false });
  });

  it("excludes only configured AI channels or member roles", () => {
    const ai = ModerationConfigSchema.parse({
      ai: {
        excludedChannelIds: ["123456789012345678"],
        excludedRoleIds: ["987654321098765432"],
      },
    }).ai;
    expect(isAiExcluded(ai, "123456789012345678", [])).toBe(true);
    expect(isAiExcluded(ai, "222222222222222222", ["987654321098765432"])).toBe(true);
    expect(isAiExcluded(ai, "222222222222222222", ["333333333333333333"])).toBe(false);
  });

  it("applies per-category deletion choices alongside sanctions and preserves inheritance", () => {
    const ai = ModerationConfigSchema.parse({
      ai: {
        action: "warn", deleteMessage: true,
        categorySettings: {
          toxicity: { action: "mute", deleteMessage: true },
          threats: { action: "warn", deleteMessage: false },
          scams: { action: "none", deleteMessage: true },
          attacks: { action: "kick" },
        },
      },
    }).ai;
    expect(aiActionForCategory(ai, "toxicity")).toBe("mute");
    expect(aiDeleteMessageForCategory(ai, "toxicity")).toBe(true);
    expect(aiDeleteMessageForCategory(ai, "threats")).toBe(false);
    expect(aiActionForCategory(ai, "scams")).toBe("none");
    expect(aiDeleteMessageForCategory(ai, "scams")).toBe(true);
    expect(aiActionForCategory(ai, "attacks")).toBe("kick");
    expect(aiDeleteMessageForCategory(ai, "attacks")).toBe(true);
    expect(aiDeleteMessageForCategory(ai, "bullying")).toBe(true);
    ai.deleteMessage = false;
    expect(aiDeleteMessageForCategory(ai, "attacks")).toBe(false);
    expect(aiDeleteMessageForCategory(ai, "toxicity")).toBe(true);
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

  it("finds the escalation step reached, whatever order the steps were saved in", () => {
    const config = ModerationConfigSchema.parse({ escalation: { enabled: true, levels: [
      { level: 1, violations: 5, action: "ban" },
      { level: 2, violations: 2, action: "mute", muteMinutes: 60 },
      { level: 3, violations: 3, action: "kick" },
    ] } });
    expect(escalationLevelForCount(config, 1)).toBeNull();
    expect(escalationLevelForCount(config, 2)).toMatchObject({ action: "mute", muteMinutes: 60 });
    expect(escalationLevelForCount(config, 4)).toMatchObject({ action: "kick" });
    expect(escalationLevelForCount(config, 50)).toMatchObject({ action: "ban" });
    expect(escalationLevelForCount({ ...config, escalation: { ...config.escalation, enabled: false } }, 50)).toBeNull();
  });

  it("applies a step's sanction and mute length and keeps the rest of the rule", () => {
    const rule = { action: "warn" as const, deleteMessage: true, alertStaff: true, muteMinutes: 15 };
    expect(ruleAtEscalationLevel(rule, null)).toEqual({ rule, selectedAction: "warn" });
    const muted = ruleAtEscalationLevel(rule, { level: 2, violations: 2, action: "mute", muteMinutes: 1_440 });
    expect(muted).toEqual({ rule: { ...rule, muteMinutes: 1_440 }, selectedAction: "mute" });
    // A step without its own length keeps the rule's, and the rule object itself is never changed.
    expect(ruleAtEscalationLevel(rule, { level: 2, violations: 2, action: "mute" })).toEqual({ rule, selectedAction: "mute" });
    expect(ruleAtEscalationLevel(rule, { level: 3, violations: 3, action: "kick", muteMinutes: 60 })).toEqual({ rule, selectedAction: "kick" });
    expect(rule.muteMinutes).toBe(15);
  });

  it("chooses the severity of a channel, then a major event, the strict night, the weekend and the soft day", () => {
    const config = ModerationConfigSchema.parse({
      channels: { strictChannelIds: ["100000000000000001"], softChannelIds: ["100000000000000002"] },
      timeProfiles: {
        timezone: "Europe/Bucharest",
        strictNight: { enabled: true, startHour: 22, endHour: 7 },
        softDay: { enabled: true, startHour: 8, endHour: 21 },
        weekend: { enabled: true, severity: "hard" },
      },
    });
    // Wednesday 2026-10-28, 23:30 in Bucharest (UTC+2).
    const wednesdayNight = new Date("2026-10-28T21:30:00Z");
    // Wednesday, 07:59 and 08:00 in Bucharest: the night covers its last hour whole.
    const endOfNight = new Date("2026-10-28T05:59:00Z");
    const morning = new Date("2026-10-28T06:00:00Z");
    // Saturday 2026-10-31, 12:00 and 23:30 in Bucharest.
    const saturdayNoon = new Date("2026-10-31T10:00:00Z");
    const saturdayNight = new Date("2026-10-31T21:30:00Z");
    const other = "100000000000000003";
    expect(activeSeverity(config, other, "normal", wednesdayNight)).toBe("hard");
    expect(activeSeverity(config, other, "normal", endOfNight)).toBe("hard");
    expect(activeSeverity(config, other, "normal", morning)).toBe("soft");
    // On Saturdays and Sundays the weekend replaces the soft day, but not the strict night.
    expect(activeSeverity(config, other, "normal", saturdayNoon)).toBe("hard");
    const softWeekend = { ...config, timeProfiles: { ...config.timeProfiles, weekend: { enabled: true, severity: "normal" as const } } };
    expect(activeSeverity(softWeekend, other, "soft", saturdayNoon)).toBe("normal");
    expect(activeSeverity(softWeekend, other, "normal", saturdayNight)).toBe("hard");
    expect(activeSeverity(config, "100000000000000001", "soft", morning)).toBe("hard");
    expect(activeSeverity(config, "100000000000000002", "hard", wednesdayNight)).toBe("soft");

    const event = { ...config, timeProfiles: { ...config.timeProfiles, majorEvent: { enabled: true, severity: "hard" as const } } };
    expect(activeSeverity(event, other, "normal", morning)).toBe("hard");
    expect(activeSeverity(event, "100000000000000002", "normal", morning)).toBe("soft");

    const nothing = ModerationConfigSchema.parse({});
    expect(activeSeverity(nothing, other, "soft", morning)).toBe("soft");
    const weekendOnly = ModerationConfigSchema.parse({ timeProfiles: { weekend: { enabled: true, severity: "hard" } } });
    expect(activeSeverity(weekendOnly, other, "normal", saturdayNoon)).toBe("hard");
    expect(activeSeverity(weekendOnly, other, "normal", morning)).toBe("normal");
  });
});