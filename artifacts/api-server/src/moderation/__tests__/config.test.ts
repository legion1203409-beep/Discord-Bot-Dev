import { describe, expect, it } from "vitest";
import { defaultModerationConfig, ModerationConfigSchema } from "../config";

describe("moderation configuration defaults", () => {
  it("ships with every enforcement module disabled", () => {
    expect(defaultModerationConfig.protection.enabled).toBe(true);
    expect(defaultModerationConfig.autoMod.enabled).toBe(false);
    expect(defaultModerationConfig.autoMod.scamFilter).toEqual({ enabled: false, action: "delete" });
    expect(defaultModerationConfig.autoMod.scamPhrases).toEqual([]);
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

  it("keeps legacy AI settings and adds opt-in categories and empty exception lists", () => {
    const config = ModerationConfigSchema.parse({
      ai: { enabled: true, action: "warn", sensitivity: "low", categories: { attacks: true } },
    });
    expect(config.ai.action).toBe("warn");
    expect(config.ai.sensitivity).toBe("low");
    expect(config.ai.categories).toMatchObject({
      attacks: true, scams: false, threats: false, deceptiveLinks: false,
    });
    expect(config.ai.categorySettings).toEqual({});
    expect(config.ai.excludedChannelIds).toEqual([]);
    expect(config.ai.excludedRoleIds).toEqual([]);
  });

  it("validates AI category overrides and channel/role exceptions", () => {
    const config = ModerationConfigSchema.parse({
      ai: {
        categories: { scams: true, threats: true, deceptiveLinks: true },
        categorySettings: { scams: { action: "ban", sensitivity: "high" }, threats: { action: "none" } },
        excludedChannelIds: ["123456789012345678"],
        excludedRoleIds: ["987654321098765432"],
      },
    });
    expect(config.ai.categorySettings.scams).toEqual({ action: "ban", sensitivity: "high" });
    expect(config.ai.categorySettings.threats?.action).toBe("none");
    expect(config.ai.excludedChannelIds).toEqual(["123456789012345678"]);
    expect(config.ai.excludedRoleIds).toEqual(["987654321098765432"]);
    expect(() => ModerationConfigSchema.parse({ ai: { categorySettings: { invented: { action: "ban" } } } })).toThrow();
    expect(() => ModerationConfigSchema.parse({ ai: { categorySettings: { scams: { sensitivity: "extreme" } } } })).toThrow();
    expect(() => ModerationConfigSchema.parse({ ai: { excludedChannelIds: ["bad-id"] } })).toThrow();
  });

  it("round-trips two selected actions for AI categories, including an explicit deletion opt-out", () => {
    const config = ModerationConfigSchema.parse({
      ai: {
        action: "warn", deleteMessage: true,
        categorySettings: {
          toxicity: { action: "mute", deleteMessage: true },
          bullying: { action: "warn", deleteMessage: true },
          threats: { action: "warn", deleteMessage: false },
        },
      },
    });
    const loaded = ModerationConfigSchema.parse(JSON.parse(JSON.stringify(config)));
    expect(loaded.ai.categorySettings).toEqual(config.ai.categorySettings);
    expect(loaded.ai.categorySettings.threats?.deleteMessage).toBe(false);
    expect(loaded.ai.categorySettings.attacks).toBeUndefined();
    expect(() => ModerationConfigSchema.parse({
      ai: { categorySettings: { toxicity: { action: "mute", deleteMessage: "yes" } } },
    })).toThrow();
  });

  it("keeps rules saved before the warning, staff-alert and mute-length ticks existed exactly as they were", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: { wordFilter: { enabled: true, action: "mute", deleteMessage: true } },
      antiRaid: { rule: { enabled: true, action: "ban" } },
      suspiciousBehavior: { enabled: true, action: "warn", massEdits: { enabled: true, action: "none" } },
    });
    for (const rule of [config.autoMod.wordFilter, config.antiRaid.rule, config.suspiciousBehavior.massEdits]) {
      expect(rule).not.toHaveProperty("warnMember");
      expect(rule).not.toHaveProperty("alertStaff");
      expect(rule).not.toHaveProperty("muteMinutes");
    }
    expect(config.suspiciousBehavior).not.toHaveProperty("warnMember");
    expect(config.autoMod.scamFilter).toEqual({ enabled: false, action: "delete" });
  });

  it("round-trips the extra ticks of a rule, the scam filter and the suspicious-behaviour module", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: {
        wordFilter: { enabled: true, action: "mute", deleteMessage: true, warnMember: true, alertStaff: true, muteMinutes: 90 },
        scamFilter: { enabled: true, action: "mute", warnMember: true, alertStaff: false, muteMinutes: 1_440 },
      },
      antiSpam: { edit: { enabled: true, action: "none", warnMember: true, alertStaff: true } },
      antiRaid: { rule: { enabled: true, action: "kick", warnMember: true, alertStaff: true } },
      suspiciousBehavior: { enabled: true, action: "mute", warnMember: true, alertStaff: true, muteMinutes: 30 },
    });
    const loaded = ModerationConfigSchema.parse(JSON.parse(JSON.stringify(config)));
    expect(loaded).toEqual(config);
    expect(loaded.autoMod.wordFilter).toMatchObject({ warnMember: true, alertStaff: true, muteMinutes: 90 });
    expect(loaded.autoMod.scamFilter).toMatchObject({ action: "mute", warnMember: true, alertStaff: false, muteMinutes: 1_440 });
    expect(loaded.suspiciousBehavior).toMatchObject({ warnMember: true, alertStaff: true, muteMinutes: 30 });
  });

  it("keeps a configured mute inside what Discord accepts and does not widen the scam filter", () => {
    const withMute = (muteMinutes: unknown) => ({ autoMod: { wordFilter: { enabled: true, action: "mute", muteMinutes } } });
    expect(ModerationConfigSchema.parse(withMute(1)).autoMod.wordFilter.muteMinutes).toBe(1);
    expect(ModerationConfigSchema.parse(withMute(40_320)).autoMod.wordFilter.muteMinutes).toBe(40_320);
    for (const invalid of [0, -1, 40_321, 1.5, "30", null]) {
      expect(() => ModerationConfigSchema.parse(withMute(invalid))).toThrow();
    }
    expect(() => ModerationConfigSchema.parse({ autoMod: { scamFilter: { action: "ban" } } })).toThrow();
    expect(() => ModerationConfigSchema.parse({ autoMod: { wordFilter: { warnMember: "yes" } } })).toThrow();
    expect(() => ModerationConfigSchema.parse({ autoMod: { wordFilter: { alertStaff: 1 } } })).toThrow();
  });

  it("round-trips the extra AI ticks for the general reaction and for a category, and keeps older AI settings unchanged", () => {
    const legacy = ModerationConfigSchema.parse({ ai: { action: "warn", deleteMessage: true, categorySettings: { scams: { action: "ban" } } } });
    expect(legacy.ai).not.toHaveProperty("warnMember");
    expect(legacy.ai).not.toHaveProperty("alertStaff");
    expect(legacy.ai).not.toHaveProperty("muteMinutes");
    expect(legacy.ai.categorySettings.scams).toEqual({ action: "ban" });

    const config = ModerationConfigSchema.parse({
      ai: {
        action: "mute", deleteMessage: true, warnMember: true, alertStaff: true, muteMinutes: 60,
        categorySettings: { threats: { action: "ban", deleteMessage: true, alertStaff: true }, toxicity: { sensitivity: "high", action: "mute", deleteMessage: false, muteMinutes: 1_440 } },
      },
    });
    const loaded = ModerationConfigSchema.parse(JSON.parse(JSON.stringify(config)));
    expect(loaded.ai).toEqual(config.ai);
    expect(loaded.ai).toMatchObject({ warnMember: true, alertStaff: true, muteMinutes: 60 });
    expect(loaded.ai.categorySettings.toxicity).toEqual({ sensitivity: "high", action: "mute", deleteMessage: false, muteMinutes: 1_440 });
    expect(() => ModerationConfigSchema.parse({ ai: { muteMinutes: 0 } })).toThrow();
    expect(() => ModerationConfigSchema.parse({ ai: { categorySettings: { threats: { muteMinutes: 40_321 } } } })).toThrow();
    expect(() => ModerationConfigSchema.parse({ ai: { categorySettings: { threats: { pingEveryone: true } } } })).toThrow();
  });

  it("keeps automatic activity logs disabled by default and allows Discord-managed channel access", () => {
    expect(defaultModerationConfig.activityLog.enabled).toBe(false);
    expect(defaultModerationConfig.activityLog.channelIds.messages).toBeNull();
    expect(defaultModerationConfig.activityLog.memberJoinTitleTemplate).toBe("");
    const customizedTemplates = ModerationConfigSchema.parse({
      activityLog: {
        memberJoinTitleTemplate: "Bun venit, {member_name}",
        memberLeaveDescriptionTemplate: "A stat {server_duration}.",
      },
    });
    const loadedTemplates = ModerationConfigSchema.parse(JSON.parse(JSON.stringify(customizedTemplates)));
    expect(loadedTemplates.activityLog.memberJoinTitleTemplate).toBe("Bun venit, {member_name}");
    expect(loadedTemplates.activityLog.memberLeaveDescriptionTemplate).toBe("A stat {server_duration}.");
    const enabled = ModerationConfigSchema.parse({
      activityLog: {
        enabled: true,
        roleIds: [],
        categories: { messages: true },
      },
    });
    expect(enabled.activityLog.enabled).toBe(true);
    expect(enabled.activityLog.roleIds).toEqual([]);
    expect(() => ModerationConfigSchema.parse({
      activityLog: { enabled: true, roleIds: ["123456789012345678"], categories: { messages: false, members: false, channels: false, roles: false, voice: false, moderation: false, security: false } },
    })).toThrow(/cel puțin o categorie/i);
  });

  it("retains a disabled rule unless an operator explicitly enables it", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: { wordFilter: { action: "mute", thresholds: { matches: 2 } } },
    });
    expect(config.autoMod.wordFilter.enabled).toBe(false);
    expect(config.autoMod.wordFilter.action).toBe("mute");
    expect(config.autoMod.wordFilter.thresholds.matches).toBe(2);
  });

  it("accepts only the requested anti-scam actions and persists custom phrases", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: {
        scamFilter: { enabled: true, action: "kick" },
        scamPhrases: ["claim bonus", "ai câștigat bani"],
      },
    });
    expect(config.autoMod.scamFilter).toEqual({ enabled: true, action: "kick" });
    expect(config.autoMod.scamPhrases).toEqual(["claim bonus", "ai câștigat bani"]);
    expect(() => ModerationConfigSchema.parse({
      autoMod: { scamFilter: { action: "ban" } },
    })).toThrow();
  });

  it("fills missing rule thresholds without replacing saved values or enabling rules", () => {
    const defaults = defaultModerationConfig;
    expect(defaults.autoMod.emojiLimit.thresholds.emoji).toBe(10);
    expect(defaults.autoMod.capsLimit.thresholds.capsPercent).toBe(75);
    expect(defaults.antiRaid.rule.thresholds.joins).toBe(10);
    expect(defaults.antiRaid.rule.thresholds.windowSeconds).toBe(60);
    expect(defaults.antiSpam.message.thresholds.messages).toBe(5);
    expect(defaults.antiSpam.message.thresholds.windowMs).toBe(5);
    expect(defaults.antiSpam.edit.thresholds.limit).toBe(5);
    expect(defaults.antiFlood.longMessage.thresholds.length).toBe(1_500);
    expect(defaults.suspiciousBehavior.joinLeaveFlood.thresholds.limit).toBe(10);
    expect(defaults.antiSpam.message.enabled).toBe(false);

    const config = ModerationConfigSchema.parse({
      antiSpam: {
        message: { thresholds: { limit: 12, window: 8 } },
      },
    });
    expect(config.antiSpam.message.thresholds.limit).toBe(12);
    expect(config.antiSpam.message.thresholds.window).toBe(8);
    expect(config.antiSpam.message.thresholds.messages).toBeUndefined();
    expect(config.antiSpam.message.thresholds.windowMs).toBeUndefined();
    expect(config.antiSpam.message.enabled).toBe(false);
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