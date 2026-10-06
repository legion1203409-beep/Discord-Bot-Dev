import { normalizeMessageImageUrl } from "./message-media";
import { isSupportedActivityBannerSource } from "./activity-rank-banner-source";

export const ACTIVITY_CHAT_XP = 10;
export const ACTIVITY_VOICE_XP = 5;
export const ACTIVITY_MAX_LEVEL = 100;
export const ACTIVITY_MAX_LEVEL_ROLE = "Legenda Cenușii";
export const ACTIVITY_ROLE_MILESTONES = [5, 10, 20, ACTIVITY_MAX_LEVEL] as const;
export const ACTIVITY_BAR_STYLES = ["discord", "dungi", "gradient", "oblic", "pixel", "pro", "sword"] as const;
export type ActivityBarStyle = typeof ACTIVITY_BAR_STYLES[number];

export interface ActivityRoleReward {
  level: number;
  roleId: string;
}

export interface ActivityRankLayout {
  bar: { x: number; y: number; width: number };
  member: { x: number; y: number; width: number };
}

export interface ActivityRankConfig {
  enabled: boolean;
  notificationChannelId: string;
  rankUpMessage: string;
  bannerImageUrl: string;
  barStyle: ActivityBarStyle;
  color: string;
  /** null preserves the legacy automatic roles; [] explicitly disables role rewards. */
  roleRewards: ActivityRoleReward[] | null;
  /** Null preserves banner-specific automatic placement. */
  layout: ActivityRankLayout | null;
}

export const DEFAULT_ACTIVITY_RANK_CONFIG: ActivityRankConfig = {
  enabled: true,
  notificationChannelId: "",
  rankUpMessage: "✨ {user} a ajuns la rangul de activitate **{level}** pe serverul **{guild}**!",
  bannerImageUrl: "",
  barStyle: "discord",
  color: "#a34b2b",
  roleRewards: null,
  layout: null,
};

function normalizeLayout(value: unknown, hasCustomBanner: boolean): ActivityRankLayout | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!input.bar || typeof input.bar !== "object" || !input.member || typeof input.member !== "object") return null;
  const bar = input.bar as Record<string, unknown>;
  const member = input.member as Record<string, unknown>;
  const values = [bar.x, bar.y, bar.width, member.x, member.y, member.width];
  if (!values.every((item) => typeof item === "number" && Number.isFinite(item))) return null;

  const layout = {
    bar: { x: bar.x as number, y: bar.y as number, width: bar.width as number },
    member: { x: member.x as number, y: member.y as number, width: member.width as number },
  };
  const barHeight = layout.bar.width * (800 * 64 / (560 * 534));
  const defaultMemberWidth = hasCustomBanner ? 73 : 67.5;
  const memberHeight = 15.36 * (layout.member.width / defaultMemberWidth);
  if (
    layout.bar.width < 30 || layout.bar.width > 100 ||
    layout.bar.x < 0 || layout.bar.y < 0 ||
    layout.bar.x + layout.bar.width > 100 ||
    layout.bar.y + barHeight > 100 ||
    layout.member.width < 40 || layout.member.width > 100 ||
    layout.member.x < 0 || layout.member.y < 0 ||
    layout.member.x + layout.member.width > 100 ||
    layout.member.y + memberHeight > 100
  ) return null;

  return layout;
}

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
  const bannerImageUrl = (() => {
    const url = normalizeMessageImageUrl(input.bannerImageUrl);
    return isSupportedActivityBannerSource(url) ? url : "";
  })();

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_ACTIVITY_RANK_CONFIG.enabled,
    notificationChannelId: /^\d{5,25}$/.test(channel) ? channel : "",
    rankUpMessage: message || DEFAULT_ACTIVITY_RANK_CONFIG.rankUpMessage,
    bannerImageUrl,
    barStyle: ACTIVITY_BAR_STYLES.includes(input.barStyle as ActivityBarStyle)
      ? input.barStyle as ActivityBarStyle
      : DEFAULT_ACTIVITY_RANK_CONFIG.barStyle,
    color,
    roleRewards: Array.isArray(input.roleRewards)
      ? input.roleRewards.filter((item): item is ActivityRoleReward => {
        if (!item || typeof item !== "object") return false;
        const reward = item as Record<string, unknown>;
        return Number.isInteger(reward.level) && Number(reward.level) >= 1 && Number(reward.level) <= 100 &&
          typeof reward.roleId === "string" && /^\d{5,25}$/.test(reward.roleId);
      }).map(({ level, roleId }) => ({ level, roleId })).sort((a, b) => a.level - b.level)
      : null,
    layout: normalizeLayout(input.layout, Boolean(bannerImageUrl)),
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
  const level = Math.floor((Math.sqrt(1 + 8 * normalizedXp / 100) - 1) / 2) + 1;
  return Math.min(level, ACTIVITY_MAX_LEVEL);
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
  const nextLevelXp = level === ACTIVITY_MAX_LEVEL
    ? currentLevelXp
    : xpForActivityLevel(level + 1);
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressXp: level === ACTIVITY_MAX_LEVEL ? 0 : Math.max(0, totalXp - currentLevelXp),
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
