/**
 * Logica paginii Control bot, fără React: modulele grupului (Invitații,
 * Recrutare, Raport zilnic, Canale și acces, Botul pe server), valorile
 * implicite, rezumatele din meniu, accesul rolurilor la canalele create de bot
 * și verificările de dinainte de salvare.
 *
 * Ce scrie pagina este ce citește botul: inviteTracking (bot/invite-stats.ts,
 * bot/invite-recruitment.ts), dailyStats (bot/daily-stats.ts) și
 * provisioningPermissions (bot/channel-provisioning.ts).
 */
import type { ChannelPermissionConfig } from "../../../hooks/use-moderation-api";
import { CONTROL_MODULE_ROUTES, cleanPath, countLabel, deepEqual, getAt, isDiscordId, isValidInteger } from "./model";
import { isMessageImageUrl } from "./verification-model";

export { CONTROL_ROUTE, isControlRoute } from "./model";

/* ------------------------------------------------------------------ */
/* Modulele grupului                                                   */
/* ------------------------------------------------------------------ */

export type ControlModuleId = keyof typeof CONTROL_MODULE_ROUTES;

export type ControlModuleDef = {
  id: ControlModuleId; route: string; short: string; title: string; description: string;
  /** What the module edits; a change marks it unsaved in the menu. */
  paths: readonly string[];
};

const INVITE_PATHS = ["enabled", "joinLogChannelId", "reportEnabled", "reportChannelId", "reportFrequency", "reportTime", "reportWeekday", "reportTimeZone", "reportTopLimit"]
  .map((key) => `inviteTracking.${key}`);

export const CONTROL_MODULES: readonly ControlModuleDef[] = [
  {
    id: "invites", route: CONTROL_MODULE_ROUTES.invites, short: "Invitații", title: "Invitații", paths: INVITE_PATHS,
    description: "Cine a adus fiecare membru nou: jurnalul intrărilor, raportul automat și statisticile linkurilor de invitație.",
  },
  {
    id: "recruitment", route: CONTROL_MODULE_ROUTES.recruitment, short: "Recrutare", title: "Programul de recrutare", paths: ["inviteTracking.recruitment"],
    description: "Membrii își fac invitații personale cu /invita și primesc puncte și roluri pentru cei aduși care se verifică.",
  },
  {
    id: "daily", route: CONTROL_MODULE_ROUTES.daily, short: "Raport zilnic", title: "Raportul zilnic", paths: ["dailyStats"],
    description: "Statisticile zilei trecute (mesaje, membri activi, intrări, ieșiri, voce), postate după miezul nopții în canalul ales.",
  },
  {
    id: "channels", route: CONTROL_MODULE_ROUTES.channels, short: "Canale și acces", title: "Canale și acces", paths: ["provisioningPermissions"],
    description: "Botul creează categoriile și canalele de care are nevoie și le dă acces doar rolurilor alese.",
  },
  {
    id: "server", route: CONTROL_MODULE_ROUTES.server, short: "Botul pe server", title: "Botul pe server", paths: [],
    description: "Dacă botul e conectat, ce permisiuni are pe server și ieșirea lui de pe server.",
  },
];

export function controlModuleForRoute(path: string): ControlModuleDef {
  const clean = cleanPath(path);
  return CONTROL_MODULES.find((module) => module.route === clean) ?? CONTROL_MODULES[0]!;
}

const changedPath = (saved: any, draft: any) => (path: string) => !deepEqual(getAt(saved, path.split(".")), getAt(draft, path.split(".")));

export function isControlModuleChanged(module: ControlModuleDef, saved: any, draft: any): boolean {
  return Boolean(saved && draft) && module.paths.some(changedPath(saved, draft));
}

export function changedControlParts(saved: any, draft: any): Array<{ key: string; label: string }> {
  if (!saved || !draft) return [];
  return CONTROL_MODULES.filter((module) => isControlModuleChanged(module, saved, draft)).map((module) => ({ key: module.id, label: module.short }));
}

/* ------------------------------------------------------------------ */
/* Invitații                                                           */
/* ------------------------------------------------------------------ */

export const REPORT_TIME_ZONES: ReadonlyArray<readonly [string, string]> = [
  ["Europe/Bucharest", "Ora României"], ["Europe/Paris", "Ora Parisului"], ["UTC", "UTC"],
];
export const WEEKDAYS: ReadonlyArray<readonly [number, string, string]> = [
  [1, "L", "luni"], [2, "Ma", "marți"], [3, "Mi", "miercuri"], [4, "J", "joi"], [5, "V", "vineri"], [6, "S", "sâmbătă"], [7, "D", "duminică"],
];

export const isClockTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function inviteReportSummary(tracking: any): string {
  if (!tracking?.reportEnabled) return "fără raport";
  const day = WEEKDAYS.find(([value]) => value === tracking.reportWeekday)?.[2] ?? "luni";
  return tracking.reportFrequency === "weekly" ? `în fiecare ${day} la ${tracking.reportTime}` : `zilnic la ${tracking.reportTime}`;
}

/* ------------------------------------------------------------------ */
/* Recrutare                                                           */
/* ------------------------------------------------------------------ */

export const RECRUITMENT_FIELDS = [
  { key: "maxUses", label: "Utilizări pe invitație", unit: "membri", min: 1, max: 100, hint: "Câți membri pot intra cu aceeași invitație personală." },
  { key: "maxAgeDays", label: "Valabilitatea invitației", unit: "zile", min: 1, max: 30, hint: "După atâtea zile, invitația expiră." },
  { key: "dailyInviteLimit", label: "Invitații pe zi", unit: "de membru", min: 1, max: 20, hint: "Câte invitații personale își poate face un membru în 24 de ore." },
  { key: "verificationHours", label: "Timp de verificare", unit: "ore", min: 1, max: 72, hint: "În cât timp trebuie să se verifice cel adus, ca recomandarea să conteze." },
  { key: "rewardPoints", label: "Puncte pe recomandare", unit: "puncte", min: 1, max: 100_000, hint: "Puncte de recrutare, separate de aurul, XP-ul și progresul din joc." },
] as const;

/** First problem in the recruitment program, or null (the old page's checks, kept). */
export function recruitmentProblem(recruitment: any): string | null {
  if (!recruitment) return null;
  if (recruitment.enabled && !recruitment.inviteChannelId) return "Alege canalul în care se fac invitațiile personale.";
  if (recruitment.inviteChannelId && !isDiscordId(recruitment.inviteChannelId)) return `„${recruitment.inviteChannelId}” nu este un ID de canal Discord.`;
  for (const field of RECRUITMENT_FIELDS) {
    if (!isValidInteger(recruitment[field.key], field.min, field.max)) return `${field.label}: un număr întreg între ${field.min} și ${field.max}.`;
  }
  const milestones: Array<{ requiredInvites: number; roleId: string }> = recruitment.milestones ?? [];
  for (const [index, milestone] of milestones.entries()) {
    if (!isValidInteger(milestone.requiredInvites, 1, 100_000)) return `Pragul ${index + 1}: un număr întreg între 1 și 100000.`;
    if (index > 0 && milestone.requiredInvites <= milestones[index - 1]!.requiredInvites) return "Pragurile trebuie să crească: fiecare cere mai multe recomandări decât cel dinainte.";
    if (milestone.roleId && !isDiscordId(milestone.roleId)) return `Pragul ${index + 1}: „${milestone.roleId}” nu este un ID de rol.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Raport zilnic                                                       */
/* ------------------------------------------------------------------ */

export const DAILY_TEXTS = [
  { key: "title", label: "Titlul", max: 256 },
  { key: "description", label: "Textul de sus", max: 4_000, multiline: true },
  { key: "activityTitle", label: "Titlul activității pe 7 zile", max: 256 },
  { key: "channelsTitle", label: "Titlul canalelor active", max: 256 },
  { key: "emptyChannelsText", label: "Când nu există canale active", max: 1_024 },
  { key: "footer", label: "Subsolul", max: 2_048 },
] as const;

/** Each number of the report: its key, its name here, and the example value with its change since the day before. */
export const DAILY_METRICS = [
  ["messages", "Mesaje", 307, 131], ["uniqueUsers", "Utilizatori unici", 13, -2], ["boosts", "Boost-uri", 0, 0],
  ["joins", "Intrări", 5, 3], ["leaves", "Ieșiri", 2, 1], ["peakVoice", "Vârf în voce", 4, 1],
] as const;

export const DAILY_TOKENS = ["guild", "date", "day", "month", "year", "messages", "uniqueUsers", "joins", "leaves", "boosts", "peakVoice"] as const;

const DAILY_SAMPLE: Record<string, string> = {
  guild: "Regatul Cenușii", date: "29 octombrie 2026", year: "2026", month: "10", day: "29", timestamp: "29 octombrie 2026 · 00:01",
  timestamp_relative: "acum un minut", messages: "307", uniqueUsers: "13", boosts: "0", joins: "5", leaves: "2", peakVoice: "4",
};

export function renderDailyText(template: string): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => DAILY_SAMPLE[key] ?? match);
}

export const DAILY_PREVIEW_ACTIVITY = [48, 83, 61, 119, 94, 176, 307] as const;
export const DAILY_PREVIEW_DAYS = ["Vi 23", "Sâ 24", "Du 25", "Lu 26", "Ma 27", "Mi 28", "Jo 29"] as const;
export const DAILY_PREVIEW_CHANNELS = [["general", 124], ["strategii", 83], ["raiduri", 61], ["ajutor", 22], ["off-topic", 17]] as const;
export const DAILY_PREVIEW_MEMBERS = 1234;

/** The day's card is on unless it was turned off. */
export function dailyChartOn(daily: any): boolean {
  return daily?.chart !== false;
}

/** The change since the day before, as the report writes it after a number. */
export function dailyDeltaText(delta: number): string {
  if (delta > 0) return `▲ +${delta.toLocaleString("ro-RO")}`;
  if (delta < 0) return `▼ −${(-delta).toLocaleString("ro-RO")}`;
  return "la fel";
}

/** The example week as the report writes it: the days (listed only without the card; the last one is the report's) and their average. */
export function dailyPreviewWeek(chart: boolean): { days: string[] | null; average: number } {
  const values: readonly number[] = DAILY_PREVIEW_ACTIVITY;
  return {
    days: chart ? null : DAILY_PREVIEW_DAYS.map((day, index) => `${day}: ${values[index]}`),
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

/** Text as the day's card draws it: its font has no emoji, so they go, with Discord's emoji and markdown marks. */
export function dailyCardText(value: string): string {
  return value
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D\u20E3]/g, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The change under a number on the card. */
export function dailyCardDelta(delta: number): string {
  return delta === 0 ? "= la fel ca ieri" : `${dailyDeltaText(delta)} față de ieri`;
}

/** The example channels with their share of the day's messages. */
export function dailyPreviewChannels(): Array<{ place: string; name: string; messages: number; share: number }> {
  const total = DAILY_METRICS[0][2];
  return DAILY_PREVIEW_CHANNELS.map(([name, messages], index) => ({
    place: ["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`,
    name,
    messages,
    share: Math.round((messages / total) * 100),
  }));
}

/** First problem in the daily report, or null. */
export function dailyProblem(daily: any): string | null {
  if (!daily) return null;
  if (daily.channelId && !isDiscordId(daily.channelId)) return `„${daily.channelId}” nu este un ID de canal Discord.`;
  if (!/^#[0-9a-f]{6}$/i.test(daily.color ?? "")) return "Culoarea are forma #RRGGBB.";
  for (const text of DAILY_TEXTS) {
    const value = String(daily[text.key] ?? "").trim();
    if (!value) return `${text.label} nu poate fi gol.`;
    if (value.length > text.max) return `${text.label} are cel mult ${text.max} de caractere.`;
  }
  for (const [key, label] of DAILY_METRICS) {
    if (!String(daily.metricLabels?.[key] ?? "").trim()) return `Eticheta „${label}” nu poate fi goală.`;
  }
  for (const key of ["imageUrl", "thumbnailUrl"]) {
    if (!isMessageImageUrl(String(daily[key] ?? "").trim())) return "O imagine a raportului nu e un link HTTPS sau o imagine încărcată.";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Canale și acces                                                     */
/* ------------------------------------------------------------------ */

export type ProvisionKey = "gameplay" | "admin" | "filtered" | "links" | "security" | "verification" | "reports";

/** What the bot creates or reuses for each category (bot/channel-provisioning.ts). */
export const PROVISION_CATEGORIES: ReadonlyArray<{ key: ProvisionKey; label: string; text: string; items: readonly string[] }> = [
  { key: "gameplay", label: "Joc și evenimente", text: "Canalele jocului.", items: ["#cufere", "#ora-umbrelor", "#dragonul-stins", "#negustorul", "#top-ora-umbrelor", "#top-dragonul-stins"] },
  { key: "admin", label: "Administrație", text: "Consiliul, Frăția, auditul și categoriile tichetelor.", items: ["#consiliul-umbrelor", "#chivotul-fratiei", "#mod-audit", "4 categorii de tichete"] },
  { key: "filtered", label: "Mesaje filtrate", text: "Jurnalele protecției și ale Judecătorului AI.", items: ["#mod-automod", "#mod-anti-spam", "#mod-anti-flood", "#mod-ai"] },
  { key: "links", label: "Linkuri", text: "O categorie pentru canalele de linkuri.", items: ["categoria Linkuri"] },
  { key: "security", label: "Securitate", text: "Alertele anti-raid și de comportament suspect.", items: ["#mod-anti-raid", "#mod-comportament-suspect"] },
  { key: "verification", label: "Verificare", text: "Canalul panoului de verificare.", items: ["canalul de verificare"] },
  { key: "reports", label: "Rapoarte", text: "Canalul raportului zilnic: îl citesc toți, scrie doar botul.", items: ["#statistici-zilnice"] },
];

export type RoleAccess = { viewChannel: boolean; readMessageHistory: boolean; sendMessages: boolean };

/** The access a category starts with: only the bot; the reports are readable by everyone. */
export function defaultPermission(key: string, everyoneId?: string): ChannelPermissionConfig {
  if (key === "reports" && everyoneId) {
    return { roleIds: [everyoneId], readMessageHistory: true, sendMessages: false, rolePermissions: { [everyoneId]: { viewChannel: true, readMessageHistory: true, sendMessages: false } } };
  }
  return { roleIds: [], readMessageHistory: true, sendMessages: true };
}

export function permissionOf(config: any, key: string, everyoneId?: string): ChannelPermissionConfig {
  return config?.provisioningPermissions?.[key] ?? defaultPermission(key, everyoneId);
}

export function roleAccessOf(permission: ChannelPermissionConfig, roleId: string): RoleAccess {
  return permission.rolePermissions?.[roleId] ?? {
    viewChannel: permission.roleIds.includes(roleId), readMessageHistory: permission.readMessageHistory, sendMessages: permission.sendMessages,
  };
}

/** Gives a role access (with the category's defaults, or the given ones) or takes it away. */
export function withRole(permission: ChannelPermissionConfig, roleId: string, on: boolean, access?: RoleAccess): ChannelPermissionConfig {
  const rolePermissions = { ...(permission.rolePermissions ?? {}) };
  if (on) {
    rolePermissions[roleId] = access ?? rolePermissions[roleId] ?? { viewChannel: true, readMessageHistory: permission.readMessageHistory, sendMessages: permission.sendMessages };
  } else {
    delete rolePermissions[roleId];
  }
  const roleIds = on ? [...new Set([...permission.roleIds, roleId])] : permission.roleIds.filter((id) => id !== roleId);
  return { ...permission, roleIds, rolePermissions };
}

export function withRoleAccess(permission: ChannelPermissionConfig, roleId: string, change: Partial<RoleAccess>): ChannelPermissionConfig {
  return { ...permission, rolePermissions: { ...(permission.rolePermissions ?? {}), [roleId]: { ...roleAccessOf(permission, roleId), ...change } } };
}

/** Ready-made access: which role (by name, or @everyone) and what it may do. */
export const ROLE_PRESETS = [
  { key: "visitor", label: "Vizitator", match: null, access: { viewChannel: true, readMessageHistory: true, sendMessages: false } },
  { key: "member", label: "Membru", match: /membru|member/i, access: { viewChannel: true, readMessageHistory: true, sendMessages: true } },
  { key: "moderator", label: "Moderator", match: /moderator/i, access: { viewChannel: true, readMessageHistory: true, sendMessages: true } },
  { key: "administrator", label: "Administrator", match: /administrator|admin/i, access: { viewChannel: true, readMessageHistory: true, sendMessages: true } },
] as const;

/** The role a preset stands for on this server, or undefined. */
export function presetRole<R extends { id: string; name: string }>(preset: (typeof ROLE_PRESETS)[number], roles: readonly R[] | undefined, everyoneId?: string): R | undefined {
  if (!roles) return undefined;
  return preset.match === null ? roles.find((role) => role.id === everyoneId) : roles.find((role) => preset.match!.test(role.name));
}

export function accessSummary(permission: ChannelPermissionConfig, everyoneId?: string): string {
  const count = permission.roleIds.length;
  if (!count) return "doar botul și administratorii";
  if (everyoneId && permission.roleIds.includes(everyoneId) && roleAccessOf(permission, everyoneId).viewChannel) return "toată lumea";
  return countLabel(count, "rol", "roluri");
}

/** First problem in the access settings, or null. */
export function channelsProblem(config: any): string | null {
  for (const [key, permission] of Object.entries<ChannelPermissionConfig>(config?.provisioningPermissions ?? {})) {
    const bad = permission.roleIds.find((id) => !isDiscordId(id));
    if (bad) return `${PROVISION_CATEGORIES.find((category) => category.key === key)?.label ?? key}: „${bad}” nu este un ID de rol.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Meniul și salvarea                                                   */
/* ------------------------------------------------------------------ */

export function controlModuleSummary(id: ControlModuleId, config: any): string {
  const tracking = config?.inviteTracking ?? {};
  switch (id) {
    case "invites": return tracking.enabled ? `urmărite · ${inviteReportSummary(tracking)}` : "oprite";
    case "recruitment": return tracking.recruitment?.enabled ? `/invita · ${tracking.recruitment.rewardPoints} puncte` : "oprit";
    case "daily": return config?.dailyStats?.channelId
      ? `zilnic, după miezul nopții${dailyChartOn(config.dailyStats) ? ", cu grafic" : ""}`
      : "nu se postează";
    case "channels": {
      const set = Object.keys(config?.provisioningPermissions ?? {}).length;
      return set ? `${countLabel(set, "categorie", "categorii")} cu acces ales` : "acces implicit";
    }
    case "server": return config?.discordLive === false ? "offline" : "conectat";
  }
}

export function isControlModuleOn(id: ControlModuleId, config: any): boolean {
  switch (id) {
    case "invites": return Boolean(config?.inviteTracking?.enabled);
    case "recruitment": return Boolean(config?.inviteTracking?.recruitment?.enabled);
    case "daily": return Boolean(config?.dailyStats?.channelId);
    case "channels": return true;
    case "server": return config?.discordLive !== false;
  }
}

/** First problem that would make the server refuse the draft, or null. */
export function controlDraftError(config: any): string | null {
  const tracking = config?.inviteTracking;
  if (tracking) {
    if (tracking.joinLogChannelId && !isDiscordId(tracking.joinLogChannelId)) return `Invitații — „${tracking.joinLogChannelId}” nu este un ID de canal.`;
    if (tracking.reportEnabled && !tracking.enabled) return "Invitații — Pornește urmărirea invitațiilor ca să trimiți raportul.";
    if (tracking.reportEnabled && !tracking.reportChannelId) return "Invitații — Alege canalul raportului.";
    if (tracking.reportChannelId && !isDiscordId(tracking.reportChannelId)) return `Invitații — „${tracking.reportChannelId}” nu este un ID de canal.`;
    if (!isClockTime(String(tracking.reportTime ?? ""))) return "Invitații — Ora raportului are forma HH:MM.";
    if (!isValidInteger(tracking.reportTopLimit, 3, 10)) return "Invitații — Raportul arată între 3 și 10 linkuri.";
    const recruitment = recruitmentProblem(tracking.recruitment);
    if (recruitment) return `Recrutare — ${recruitment}`;
  }
  const daily = dailyProblem(config?.dailyStats);
  if (daily) return `Raport zilnic — ${daily}`;
  const channels = channelsProblem(config);
  return channels ? `Canale și acces — ${channels}` : null;
}

/* ------------------------------------------------------------------ */
/* Botul pe server                                                     */
/* ------------------------------------------------------------------ */

/** What the bot needs on the server, with what each permission is for. */
export const BOT_CHECKS: ReadonlyArray<{ key: string; label: string; needed: string; kind: "intent" | "permission" }> = [
  { key: "messageContent", label: "Message Content", needed: "Citește mesajele: filtre, Judecătorul AI, Oracolul.", kind: "intent" },
  { key: "guildMembers", label: "Server Members", needed: "Vede intrările: anti-raid, invitații, verificare.", kind: "intent" },
  { key: "canManageGuild", label: "Manage Server", needed: "Citește invitațiile pentru statistici.", kind: "permission" },
  { key: "canManageRoles", label: "Manage Roles", needed: "Dă roluri la verificare, recrutare și ranguri.", kind: "permission" },
  { key: "canManageChannels", label: "Manage Channels", needed: "Creează canale și setează slowmode și blocări.", kind: "permission" },
  { key: "canManageMessages", label: "Manage Messages", needed: "Șterge mesajele prinse de filtre.", kind: "permission" },
  { key: "canModerateMembers", label: "Timeout Members", needed: "Dă timeout.", kind: "permission" },
  { key: "canKickMembers", label: "Kick Members", needed: "Scoate membri de pe server.", kind: "permission" },
  { key: "canBanMembers", label: "Ban Members", needed: "Banează membri.", kind: "permission" },
];
