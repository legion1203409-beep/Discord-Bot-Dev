import { describe, expect, it } from "vitest";
import { shouldDeleteAutoModMessage } from "../automod-policy";
import { ModerationConfigSchema } from "../../../moderation/config";

describe("AutoMod message deletion policy", () => {
  it("deletes when deletion is the selected action", () => {
    expect(shouldDeleteAutoModMessage("delete", false)).toBe(true);
  });

  it("deletes in addition to another selected action when enabled", () => {
    expect(shouldDeleteAutoModMessage("mute", true)).toBe(true);
    expect(shouldDeleteAutoModMessage("warn", true)).toBe(true);
    expect(shouldDeleteAutoModMessage("kick", true)).toBe(true);
    expect(shouldDeleteAutoModMessage("ban", true)).toBe(true);
  });

  it("keeps messages for other actions when the extra deletion option is off", () => {
    expect(shouldDeleteAutoModMessage("warn", false)).toBe(false);
    expect(shouldDeleteAutoModMessage("none", undefined)).toBe(false);
  });

  it("preserves the anti-scam always-delete behavior", () => {
    expect(shouldDeleteAutoModMessage("warn", false, true)).toBe(true);
  });

  it.each(["wordFilter", "linkBlock", "emojiLimit", "capsLimit", "repeatBlock"] as const)(
    "keeps the combined action when parsing saved %s settings",
    (key) => {
      const config = ModerationConfigSchema.parse({
        autoMod: { [key]: { enabled: true, action: "kick", deleteMessage: true } },
      });
      expect(config.autoMod[key]).toMatchObject({ enabled: true, action: "kick", deleteMessage: true });
      expect(shouldDeleteAutoModMessage(config.autoMod[key].action, config.autoMod[key].deleteMessage)).toBe(true);
    },
  );
});