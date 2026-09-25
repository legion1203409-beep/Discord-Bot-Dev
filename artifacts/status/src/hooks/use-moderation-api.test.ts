import { describe, expect, it } from "vitest";
import { isPartialBotControlApplyResponse } from "./use-moderation-api";

describe("isPartialBotControlApplyResponse", () => {
  it("recognizes partial Bot Control writes before they can enter config state", () => {
    expect(isPartialBotControlApplyResponse({
      partialApply: true,
      verificationPanelPublished: true,
      verification: { channelId: "123" },
      message: "Some writes failed.",
    })).toBe(true);
  });

  it("rejects canonical configs and non-object responses", () => {
    expect(isPartialBotControlApplyResponse({ verification: { enabled: true } })).toBe(false);
    expect(isPartialBotControlApplyResponse(null)).toBe(false);
    expect(isPartialBotControlApplyResponse("partial")).toBe(false);
  });
});