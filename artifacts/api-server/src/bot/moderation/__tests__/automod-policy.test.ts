import { describe, expect, it } from "vitest";
import { shouldDeleteAutoModMessage } from "../automod-policy";

describe("AutoMod message deletion policy", () => {
  it("deletes when deletion is the selected action", () => {
    expect(shouldDeleteAutoModMessage("delete", false)).toBe(true);
  });

  it("deletes in addition to another selected action when enabled", () => {
    expect(shouldDeleteAutoModMessage("mute", true)).toBe(true);
    expect(shouldDeleteAutoModMessage("warn", true)).toBe(true);
  });

  it("keeps messages for other actions when the extra deletion option is off", () => {
    expect(shouldDeleteAutoModMessage("warn", false)).toBe(false);
    expect(shouldDeleteAutoModMessage("none", undefined)).toBe(false);
  });

  it("preserves the anti-scam always-delete behavior", () => {
    expect(shouldDeleteAutoModMessage("warn", false, true)).toBe(true);
  });
});