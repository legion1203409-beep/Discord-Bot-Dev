/**
 * Calculele paginii Niveluri și XP: aceleași formule ca botul
 * (api-server/src/bot/activity-ranks-core.ts), ca ce vede staff-ul pe site
 * să fie exact ce se întâmplă pe server.
 */
import { activityRoleRewardsError, type ActivityRoleReward } from "../../../lib/activity-role-rewards";
import type { ActivityRankLayout } from "../../../lib/activity-rank-layout";

export const XP_CHAT = 10;
export const XP_CHAT_COOLDOWN_SECONDS = 30;
export const XP_VOICE_PER_MINUTE = 5;
export const XP_MAX_LEVEL = 100;
export const XP_AUTO_LEVELS = [5, 10, 20, 100] as const;
export const XP_MAX_LEVEL_ROLE = "Legenda Cenușii";

export const XP_BAR_STYLES = [
  ["discord", "Clasică", "Simplă, ca în Discord"],
  ["dungi", "Dungi", "Benzi care curg"],
  ["gradient", "Gradient", "Culori care se topesc"],
  ["oblic", "Oblică", "Tăieturi diagonale"],
  ["pixel", "Pixel", "Retro, pe pătrățele"],
  ["pro", "Pro", "Glow și scântei"],
  ["sword", "Sabie", "Rune și forjă"],
] as const;
export type XpBarStyle = typeof XP_BAR_STYLES[number][0];

export interface XpConfig {
  enabled: boolean;
  notificationChannelId: string;
  rankUpMessage: string;
  bannerImageUrl: string;
  barStyle: XpBarStyle;
  color: string;
  /** null = rolurile automate ale botului; [] = fără roluri. */
  roleRewards: ActivityRoleReward[] | null;
  layout: ActivityRankLayout | null;
}

export const DEFAULT_XP_CONFIG: XpConfig = {
  enabled: true,
  notificationChannelId: "",
  rankUpMessage: "✨ {user} a ajuns la rangul de activitate **{level}** pe serverul **{guild}**!",
  bannerImageUrl: "",
  barStyle: "discord",
  color: "#a34b2b",
  roleRewards: null,
  layout: null,
};

export function normalizeXpConfig(config: Partial<XpConfig> | null | undefined): XpConfig {
  return { ...DEFAULT_XP_CONFIG, ...(config ?? {}), roleRewards: config?.roleRewards ?? null, layout: config?.layout ?? null };
}

/** XP-ul total de la care începe un nivel (nivelul 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const value = Math.max(1, Math.min(XP_MAX_LEVEL, Math.floor(level)));
  return (100 * (value - 1) * value) / 2;
}

export function levelForXp(xp: number): number {
  const value = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  return Math.min(Math.floor((Math.sqrt(1 + (8 * value) / 100) - 1) / 2) + 1, XP_MAX_LEVEL);
}

/** Cât XP cere doar urcarea de la nivelul anterior la acesta. */
export function xpForStep(level: number): number {
  return Math.max(0, xpForLevel(level) - xpForLevel(level - 1));
}

const ro = new Intl.NumberFormat("ro-RO");
export const formatXp = (value: number) => ro.format(Math.round(value));

export function formatHours(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = minutes / 60;
  return hours < 10 ? `${ro.format(Math.round(hours * 10) / 10)} ore` : `${ro.format(Math.round(hours))} de ore`;
}

/** Ce înseamnă un prag în viața reală: câte mesaje sau câte ore pe voce. */
export function effortFor(level: number): { xp: number; messages: number; voice: string; chatTime: string } {
  const xp = xpForLevel(level);
  const messages = Math.ceil(xp / XP_CHAT);
  return {
    xp,
    messages,
    voice: formatHours(xp / XP_VOICE_PER_MINUTE),
    // a message counts at most once every 30 seconds
    chatTime: formatHours((messages * XP_CHAT_COOLDOWN_SECONDS) / 60),
  };
}

export const XP_LADDER = [5, 10, 20, 35, 50, 75, 100] as const;

export function renderRankUpMessage(template: string, guildName: string, user = "Membru", level = 5): string {
  return template.replaceAll("{user}", user).replaceAll("{level}", String(level)).replaceAll("{guild}", guildName);
}

/** Bucăți de text și **îngroșat**, pentru previzualizare. */
export function boldParts(text: string): Array<{ text: string; bold: boolean }> {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false });
}

export type XpRole = { id: string; name: string; managed?: boolean; activityRewardAssignable?: boolean };

export function rewardRoleUsable(role: XpRole | undefined, guildId: string): boolean {
  return Boolean(role) && role!.id !== guildId && !role!.managed && role!.activityRewardAssignable !== false;
}

/** Ce oprește salvarea, sau "" când totul e în regulă. */
export function xpDraftError(draft: XpConfig, roles: XpRole[] | undefined, guildId: string): string {
  if (!draft.rankUpMessage.trim()) return "Scrie mesajul de nivel nou.";
  if (draft.rankUpMessage.length > 1_800) return "Mesajul de nivel nou are cel mult 1.800 de caractere.";
  if (!/^#[0-9a-f]{6}$/i.test(draft.color)) return "Alege o culoare validă.";
  const rewards = activityRoleRewardsError(draft.roleRewards);
  if (rewards) return rewards;
  if (roles && draft.roleRewards?.some((reward) => !rewardRoleUsable(roles.find((role) => role.id === reward.roleId), guildId))) {
    return "Înlocuiește sau șterge rolurile care nu mai pot fi date.";
  }
  return "";
}

/** Primul nivel liber pentru o recompensă nouă. */
export function nextRewardLevel(rewards: ActivityRoleReward[]): number | null {
  const used = new Set(rewards.map((reward) => reward.level));
  const preferred = XP_AUTO_LEVELS.find((level) => !used.has(level));
  if (preferred !== undefined) return preferred;
  for (let level = 1; level <= XP_MAX_LEVEL; level += 1) if (!used.has(level)) return level;
  return null;
}

/** Ce s-a schimbat, pe părți, pentru bara de salvare. */
export function changedXpParts(saved: XpConfig, draft: XpConfig): string[] {
  const parts: Array<[string, Array<keyof XpConfig>]> = [
    ["Pornire", ["enabled"]],
    ["Anunțul", ["notificationChannelId", "rankUpMessage"]],
    ["Cardul /rank", ["bannerImageUrl", "barStyle", "color", "layout"]],
    ["Roluri", ["roleRewards"]],
  ];
  return parts.filter(([, keys]) => keys.some((key) => JSON.stringify(saved[key]) !== JSON.stringify(draft[key]))).map(([label]) => label);
}
