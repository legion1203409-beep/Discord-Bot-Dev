import { describe, expect, it } from "vitest";
import {
  SlidingRateLimiter,
  capsPercent,
  containsBlockedWord,
  countEmoji,
  detectContent,
  findBlockedLink,
  longestRepeatedRun,
} from "../detectors";
import { escalationActionForCount, repeatedMessageCount, reserveAutomaticAction } from "../engine";

describe("moderation detectors", () => {
  it("matches blocked words at boundaries and ignores innocent substrings", () => {
    expect(containsBlockedWord("Acesta este un prost.", ["prost"])).toBe("prost");
    expect(containsBlockedWord("prostește nu este atacul configurat", ["prost"])).toBeNull();
  });

  it("matches exact and subdomain blocked link hosts", () => {
    expect(findBlockedLink("vezi https://cdn.evil.example/path", ["evil.example"])).toBe("evil.example");
    expect(findBlockedLink("https://not-evil.example", ["evil.example"])).toBeNull();
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

  it("keeps rates isolated by caller key and expires old samples", () => {
    const limiter = new SlidingRateLimiter();
    expect(limiter.hit("guild-a:user", { limit: 1, windowMs: 1_000 }, 10).exceeded).toBe(false);
    expect(limiter.hit("guild-b:user", { limit: 1, windowMs: 1_000 }, 11).exceeded).toBe(false);
    expect(limiter.hit("guild-a:user", { limit: 1, windowMs: 1_000 }, 12).exceeded).toBe(true);
    expect(limiter.hit("guild-a:user", { limit: 1, windowMs: 1_000 }, 1_020).exceeded).toBe(false);
  });

  it("counts repeated message bodies separately from repeated characters", () => {
    expect(repeatedMessageCount("guild:user:channel", "același mesaj", 10_000, 100)).toBe(1);
    expect(repeatedMessageCount("guild:user:channel", "același mesaj", 10_000, 200)).toBe(2);
    expect(repeatedMessageCount("guild:user:channel", "mesaj diferit", 10_000, 300)).toBe(1);
  });

  it("reserves an automatic action once per message/rule key", () => {
    expect(reserveAutomaticAction("guild:message:word:mute", 1_000, 1_000)).toBe(true);
    expect(reserveAutomaticAction("guild:message:word:mute", 1_001, 1_000)).toBe(false);
    expect(reserveAutomaticAction("guild:message:word:mute", 2_001, 1_000)).toBe(true);
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