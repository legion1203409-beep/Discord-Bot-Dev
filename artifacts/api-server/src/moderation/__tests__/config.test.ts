import { describe, expect, it } from "vitest";
import { defaultModerationConfig, ModerationConfigSchema } from "../config";

describe("moderation configuration defaults", () => {
  it("ships with every enforcement module disabled", () => {
    expect(defaultModerationConfig.protection.enabled).toBe(true);
    expect(defaultModerationConfig.autoMod.enabled).toBe(false);
    expect(defaultModerationConfig.antiRaid.enabled).toBe(false);
    expect(defaultModerationConfig.antiSpam.enabled).toBe(false);
    expect(defaultModerationConfig.antiFlood.enabled).toBe(false);
    expect(defaultModerationConfig.manualTools.enabled).toBe(false);
    expect(defaultModerationConfig.suspiciousBehavior.enabled).toBe(false);
    expect(defaultModerationConfig.ai.enabled).toBe(false);
    expect(defaultModerationConfig.escalation.enabled).toBe(false);
    expect(defaultModerationConfig.embeds.enabled).toBe(false);
  });

  it("preserves an explicitly disabled protection category", () => {
    const config = ModerationConfigSchema.parse({ protection: { enabled: false } });
    expect(config.protection.enabled).toBe(false);
  });

  it("retains a disabled rule unless an operator explicitly enables it", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: { wordFilter: { action: "mute", thresholds: { matches: 2 } } },
    });
    expect(config.autoMod.wordFilter.enabled).toBe(false);
    expect(config.autoMod.wordFilter.action).toBe("mute");
    expect(config.autoMod.wordFilter.thresholds.matches).toBe(2);
  });

  it("rejects values outside Discord and moderation bounds", () => {
    expect(() => ModerationConfigSchema.parse({
      antiRaid: { alertChannelId: "not-a-snowflake" },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      embeds: { color: "red" },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      antiSpam: { message: { thresholds: { windowMs: 0 } } },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      multiServer: { isolatedData: false },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      timeProfiles: { timezone: "not/a-timezone" },
    })).toThrow();
  });
});