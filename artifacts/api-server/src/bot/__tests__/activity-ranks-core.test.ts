import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MAX_LEVEL,
  ACTIVITY_MAX_LEVEL_ROLE,
  ACTIVITY_ROLE_MILESTONES,
  activityLevelForXp,
  getActivityLevelProgress,
  getUtcActivityPeriods,
  isEligibleActivityMessage,
  normalizeActivityRankConfig,
  xpForActivityLevel,
} from "../activity-ranks-core";

describe("activity rank progression", () => {
  it("keeps XP and levels independent with a deterministic 100 XP triangular curve", () => {
    expect(activityLevelForXp(0)).toBe(1);
    expect(xpForActivityLevel(2)).toBe(100);
    expect(activityLevelForXp(99)).toBe(1);
    expect(activityLevelForXp(100)).toBe(2);
    expect(activityLevelForXp(300)).toBe(3);
    expect(getActivityLevelProgress(125)).toEqual({
      level: 2,
      currentLevelXp: 100,
      nextLevelXp: 300,
      progressXp: 25,
      requiredXp: 200,
    });
  });

  it("stops at level 100 while retaining accumulated XP and reports a complete max-level bar", () => {
    expect(ACTIVITY_MAX_LEVEL).toBe(100);
    expect(ACTIVITY_MAX_LEVEL_ROLE).toBe("Legenda Cenușii");
    expect(ACTIVITY_ROLE_MILESTONES).toEqual([5, 10, 20, 100]);
    const maximumLevelXp = xpForActivityLevel(ACTIVITY_MAX_LEVEL);
    expect(maximumLevelXp).toBe(495_000);
    expect(activityLevelForXp(maximumLevelXp - 1)).toBe(99);
    expect(activityLevelForXp(maximumLevelXp)).toBe(100);
    expect(activityLevelForXp(2_000_000)).toBe(100);
    expect(getActivityLevelProgress(2_000_000)).toEqual({
      level: 100,
      currentLevelXp: maximumLevelXp,
      nextLevelXp: maximumLevelXp,
      progressXp: 0,
      requiredXp: 0,
    });
  });

  it("uses UTC calendar boundaries for daily and monthly counters", () => {
    expect(getUtcActivityPeriods(new Date("2026-02-01T00:30:00+02:00"))).toEqual({
      dayKey: "2026-01-31",
      monthKey: "2026-01",
    });
  });
});

describe("activity chat qualification and config normalization", () => {
  it("rejects short messages, commands, and repetitive spam", () => {
    expect(isEligibleActivityMessage("hi")).toBe(false);
    expect(isEligibleActivityMessage("/profil")).toBe(false);
    expect(isEligibleActivityMessage("aaaaaaaaaaaaa")).toBe(false);
    expect(isEligibleActivityMessage("This is a useful sentence.")).toBe(true);
  });

  it("keeps safe defaults and validates the shared settings", () => {
    expect(normalizeActivityRankConfig({
      enabled: false,
      notificationChannelId: "bad-id",
      rankUpMessage: "  New rank {level}  ",
      bannerImageUrl: "javascript:alert(1)",
      color: "red",
    })).toEqual({
      enabled: false,
      notificationChannelId: "",
      rankUpMessage: "New rank {level}",
      bannerImageUrl: "",
      barStyle: "discord",
      color: "#a34b2b",
    });
  });

  it("accepts all supplied bar styles and defaults unknown styles safely", () => {
    for (const style of ["discord", "dungi", "gradient", "oblic", "pixel", "pro", "sword"]) {
      expect(normalizeActivityRankConfig({ barStyle: style }).barStyle).toBe(style);
    }
    expect(normalizeActivityRankConfig({ barStyle: "unknown" }).barStyle).toBe("discord");
  });

  it("allows uploaded and trusted-host banners, not arbitrary external hosts", () => {
    expect(normalizeActivityRankConfig({ bannerImageUrl: "/api/storage/objects/uploads/banner-id" }).bannerImageUrl)
      .toBe("/api/storage/objects/uploads/banner-id");
    expect(normalizeActivityRankConfig({ bannerImageUrl: "https://i.imgur.com/banner.png" }).bannerImageUrl)
      .toBe("https://i.imgur.com/banner.png");
    expect(normalizeActivityRankConfig({ bannerImageUrl: "https://127.0.0.1.sslip.io/banner.png" }).bannerImageUrl)
      .toBe("");
  });
});
