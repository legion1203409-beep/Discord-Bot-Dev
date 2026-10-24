import { describe, expect, it } from "vitest";
import { shouldTranslateMessage, splitTranslationText } from "./message-translation-core";

const eligibleMessage = {
  guildId: "guild-1",
  channelId: "channel-1",
  configuredChannelId: "channel-1",
  content: "Hello, welcome to the community!",
  authorIsBot: false,
  isWebhook: false,
  hasMessageContentIntent: true,
};

describe("automatic message translation eligibility", () => {
  it("allows human messages only in the configured guild channel with message content access", () => {
    expect(shouldTranslateMessage(eligibleMessage)).toBe(true);
  });

  it.each([
    ["DMs", { guildId: null }],
    ["other channels", { channelId: "channel-2" }],
    ["unconfigured servers", { configuredChannelId: null }],
    ["empty content", { content: "   " }],
    ["bot messages", { authorIsBot: true }],
    ["webhook messages", { isWebhook: true }],
    ["missing message-content intent", { hasMessageContentIntent: false }],
  ])("skips %s", (_name, override) => {
    expect(shouldTranslateMessage({ ...eligibleMessage, ...override })).toBe(false);
  });
});

describe("translation message chunking", () => {
  it("returns short text unchanged", () => {
    expect(splitTranslationText("  Bun venit.  ")).toEqual(["Bun venit."]);
  });

  it("splits long translations without dropping characters", () => {
    const text = `${"primul paragraf ".repeat(120)}\n${"al doilea paragraf ".repeat(120)}`;
    const chunks = splitTranslationText(text, 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 300)).toBe(true);
    expect(chunks.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });
});
