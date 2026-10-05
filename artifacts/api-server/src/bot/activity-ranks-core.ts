import { normalizeMessageImageUrl } from "./message-media";
import { isSupportedActivityBannerSource } from "./activity-rank-banner-source";

export const ACTIVITY_CHAT_XP = 10;
export const ACTIVITY_VOICE_XP = 5;
export const ACTIVITY_ROLE_MILESTONES = [5, 10, 20] as const;
export const ACTIVITY_BAR_STYLES = ["discord", "dungi", "gradient", "oblic", "pixel", "pro", "sword"] as const;
export type ActivityBarStyle = typeof ACTIVITY_BAR_STYLES[number];

export interface ActivityRankConfig {
  enabled: boolean;
  notificationChannelId: string;
  rankUpMessage: string;
  bannerImageUrl: string;
  barStyle: ActivityBarStyle;
  color: string;
}

export const DEFAULT_ACTIVITY_RANK_CONFIG: ActivityRankConfig = {
  enabled: true,
  notificationChannelId: "",
  rankUpMessage: "✨ {user} a ajuns la rangul de activitate **{level}** pe serverul **{guild}**!",
  bannerImageUrl: "",
  barStyle: "discord",
  color: "#a34b2b",
};

export function normalizeActivityRankConfig(value: unknown): ActivityRankConfig {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const channel = typeof input.notificationChannelId === "string"
    ? input.notificationChannelId.trim()
    : "";
  const message = typeof input.rankUpMessage === "string"
    ? input.rankUpMessage.trim().slice(0, 1_800)
    : "";
  const color = typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color.trim())
    ? input.color.trim()
    : DEFAULT_ACTIVITY_RANK_CONFIG.color;

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_ACTIVITY_RANK_CONFIG.enabled,
    notificationChannelId: /^\d{5,25}$/.test(channel) ? channel : "",
    rankUpMessage: message || DEFAULT_ACTIVITY_RANK_CONFIG.rankUpMessage,
    bannerImageUrl: (() => {
      const url = normalizeMessageImageUrl(input.bannerImageUrl);
      return isSupportedActivityBannerSource(url) ? url : "";
    })(),
    barStyle: ACTIVITY_BAR_STYLES.includes(input.barStyle as ActivityBarStyle)
      ? input.barStyle as ActivityBarStyle
      : DEFAULT_ACTIVITY_RANK_CONFIG.barStyle,
    color,
  };
}

export function isEligibleActivityMessage(content: string): boolean {
  const text = content.trim();
  if (text.length < 8 || /^[!./?$]/.test(text)) return false;

  const meaningfulCharacters = text.match(/[\p{L}\p{N}]/gu) ?? [];
  if (meaningfulCharacters.length < 6) return false;
  if (new Set(meaningfulCharacters.map((character) => character.toLocaleLowerCase())).size < 3) return false;

  return true;
}

export function xpForActivityLevel(level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level));
  return 100 * (normalizedLevel - 1) * normalizedLevel / 2;
}

export function activityLevelForXp(xp: number): number {
  const normalizedXp = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  return Math.floor((Math.sqrt(1 + 8 * normalizedXp / 100) - 1) / 2) + 1;
}

export function getActivityLevelProgress(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressXp: number;
  requiredXp: number;
} {
  const level = activityLevelForXp(totalXp);
  const currentLevelXp = xpForActivityLevel(level);
  const nextLevelXp = xpForActivityLevel(level + 1);
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressXp: Math.max(0, totalXp - currentLevelXp),
    requiredXp: nextLevelXp - currentLevelXp,
  };
}

export function getUtcActivityPeriods(date: Date): { dayKey: string; monthKey: string } {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return {
    dayKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
  };
}
