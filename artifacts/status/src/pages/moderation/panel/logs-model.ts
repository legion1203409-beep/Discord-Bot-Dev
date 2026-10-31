/**
 * Logica paginii Cazuri și jurnale, fără React: modulele grupului (Cazuri,
 * Audit, Jurnale de activitate), păstrarea cazurilor, ce poate face staff-ul,
 * unde scrie fiecare modul, categoriile jurnalului de activitate, rezumatele din
 * meniu și verificările de dinainte de salvare.
 *
 * Ce scrie pagina este ce citește botul: api-server/src/moderation/config.ts
 * (cases, audit, activityLog), store.pruneCases (păstrarea), rutele de cazuri
 * (allowStaff*), events.ts (auditDetail, recordAudit, deliverActivityLog) și
 * engine.ts (notify cade pe canalul de audit).
 */
import { LOGS_MODULE_ROUTES, cleanPath, countLabel, deepEqual, getAt, isDiscordId, isValidInteger } from "./model";

export { LOGS_ROUTE, isLogsRoute } from "./model";

/* ------------------------------------------------------------------ */
/* Modulele grupului                                                   */
/* ------------------------------------------------------------------ */

export type LogsModuleId = keyof typeof LOGS_MODULE_ROUTES;

export type LogsModuleDef = {
  id: LogsModuleId;
  route: string;
  short: string;
  title: string;
  description: string;
  configKey?: "audit" | "activityLog";
  switchLabel?: string;
  /** What the module edits; a change in any of these marks it unsaved in the menu. */
  paths: readonly string[];
};

export const LOGS_MODULES: readonly LogsModuleDef[] = [
  {
    id: "cases", route: LOGS_MODULE_ROUTES.cases, short: "Cazuri", title: "Cazurile de moderare",
    description: "Fiecare acțiune devine un caz, un dosar cu motivul și dovezile, pe care îl consulți, îl închizi și îi adaugi note.",
    paths: ["cases"],
  },
  {
    id: "audit", route: LOGS_MODULE_ROUTES.audit, short: "Audit", title: "Audit",
    description: "Un jurnal separat al evenimentelor de moderare, cu nivelul de detaliu pe care îl alegi și un canal în Discord.",
    configKey: "audit", switchLabel: "Activează auditul", paths: ["audit"],
  },
  {
    id: "activity", route: LOGS_MODULE_ROUTES.activity, short: "Jurnale de activitate", title: "Jurnale de activitate",
    description: "Ce se întâmplă pe server, pe categorii, fiecare în canalul ei privat din Discord: mesaje, membri, canale, roluri, voce, moderare și securitate.",
    configKey: "activityLog", switchLabel: "Activează jurnalele de activitate", paths: ["activityLog"],
  },
];

export function logsModuleForRoute(path: string): LogsModuleDef {
  const clean = cleanPath(path);
  return LOGS_MODULES.find((module) => module.route === clean) ?? LOGS_MODULES[0]!;
}

/** The parts of the configuration the page saves; only the ones that changed are sent. */
export const LOGS_SECTIONS = [
  { key: "cases", label: "Cazuri" },
  { key: "audit", label: "Audit" },
  { key: "activityLog", label: "Jurnale de activitate" },
] as const;

export function isLogsModuleChanged(module: Pick<LogsModuleDef, "paths">, saved: any, draft: any): boolean {
  if (!saved || !draft) return false;
  return module.paths.some((path) => !deepEqual(getAt(saved, path.split(".")), getAt(draft, path.split("."))));
}

/* ------------------------------------------------------------------ */
/* Cazuri                                                              */
/* ------------------------------------------------------------------ */

export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3_650;
export const DEFAULT_RETENTION_DAYS = 365;
export const RETENTION_PRESETS: ReadonlyArray<readonly [number, string]> = [
  [30, "30 de zile"], [90, "90 de zile"], [180, "6 luni"], [365, "Un an"], [730, "2 ani"], [3_650, "10 ani"],
];

export function retentionDays(config: any): number | undefined {
  const days = config?.cases?.retentionDays;
  return typeof days === "number" ? days : undefined;
}

/** "Un an", "6 luni", or "45 de zile". */
export function describeRetention(days: number): string {
  const preset = RETENTION_PRESETS.find(([value]) => value === days);
  return preset ? preset[1] : countLabel(days, "zi", "zile");
}

/**
 * Saving a shorter retention deletes the older cases for good (with their notes
 * and appeals), so the page says so. Returns the new number of days when the
 * draft keeps cases for less time than what is saved, otherwise null.
 */
export function retentionShrinks(saved: any, draft: any): number | null {
  const before = retentionDays(saved) ?? DEFAULT_RETENTION_DAYS;
  const after = retentionDays(draft);
  return after !== undefined && isValidInteger(after, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS) && after < before ? after : null;
}

export type StaffRightKey = "allowStaffClose" | "allowStaffNotes" | "allowStaffExport";
export const STAFF_RIGHTS: ReadonlyArray<{ key: StaffRightKey; label: string; hint: string; fallback: boolean }> = [
  { key: "allowStaffClose", label: "Staff-ul poate închide cazuri", fallback: true, hint: "Altfel doar proprietarul și administratorii închid un caz." },
  { key: "allowStaffNotes", label: "Staff-ul poate adăuga note", fallback: true, hint: "Notele rămân în caz, cu autorul și ora lor." },
  { key: "allowStaffExport", label: "Staff-ul poate exporta cazurile (CSV)", fallback: false, hint: "Exportul are cel mult 1.000 de cazuri, cele mai noi." },
];

export function staffRight(config: any, key: StaffRightKey): boolean {
  const value = config?.cases?.[key];
  return typeof value === "boolean" ? value : STAFF_RIGHTS.find((right) => right.key === key)!.fallback;
}

/** The line under "Cazuri" in the menu. */
export function casesSummary(config: any): string {
  const days = retentionDays(config) ?? DEFAULT_RETENTION_DAYS;
  return `Păstrate ${isValidInteger(days, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS) ? describeRetention(days).toLocaleLowerCase("ro") : "—"}`;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export type DetailLevel = "minimal" | "standard" | "verbose";
export const DETAIL_LEVELS: ReadonlyArray<readonly [DetailLevel, string]> = [["minimal", "Minimal"], ["standard", "Standard"], ["verbose", "Detaliat"]];
export const DETAIL_HINT: Readonly<Record<DetailLevel, string>> = {
  minimal: "Doar cine a făcut ce și când.",
  standard: "Plus detaliile fiecărui eveniment (canal, număr de mesaje, motiv).",
  verbose: "Tot, cu valorile de dinainte și de după fiecare schimbare.",
};

/** The line under "Audit" in the menu. */
export function auditSummary(config: any): string {
  if (!config?.audit?.enabled) return "Oprit";
  const level = DETAIL_LEVELS.find(([key]) => key === config.audit.detailLevel)?.[1] ?? "Standard";
  return config.audit.channelId ? `${level} · cu canal` : `${level} · fără canal`;
}

export type ModuleLogDef = { name: string; route: string; path: readonly string[] };
export const MODULE_LOGS: readonly ModuleLogDef[] = [
  { name: "AutoMod", route: "/automod", path: ["autoMod", "logChannelId"] },
  { name: "Anti-spam", route: "/anti-spam", path: ["antiSpam", "logChannelId"] },
  { name: "Anti-flood", route: "/anti-flood", path: ["antiFlood", "logChannelId"] },
  { name: "Anti-raid", route: "/anti-raid", path: ["antiRaid", "alertChannelId"] },
  { name: "Comportament suspect", route: "/comportament-suspect", path: ["suspiciousBehavior", "alertChannelId"] },
  { name: "Judecătorul AI", route: "/ai", path: ["ai", "logChannelId"] },
];

export type ModuleLogDestination = ModuleLogDef & { channelId: string | null; via: "own" | "audit" | "none" };

/**
 * Where each module writes what it finds: its own channel, else the audit
 * channel while the audit is on (the bot falls back to it), else nowhere.
 */
export function moduleLogDestinations(config: any): ModuleLogDestination[] {
  const audit = config?.audit?.enabled && typeof config.audit.channelId === "string" && config.audit.channelId ? config.audit.channelId : null;
  return MODULE_LOGS.map((def) => {
    const own = getAt(config, [...def.path]);
    if (typeof own === "string" && own) return { ...def, channelId: own, via: "own" };
    return audit ? { ...def, channelId: audit, via: "audit" } : { ...def, channelId: null, via: "none" };
  });
}

/* ------------------------------------------------------------------ */
/* Jurnale de activitate                                               */
/* ------------------------------------------------------------------ */

export type ActivityCategory = "messages" | "members" | "channels" | "roles" | "voice" | "moderation" | "security";
export const ACTIVITY_CATEGORIES: ReadonlyArray<{ key: ActivityCategory; label: string; hint: string }> = [
  { key: "messages", label: "Mesaje", hint: "Mesaje modificate sau șterse, cu textul de dinainte și de după." },
  { key: "members", label: "Membri", hint: "Intrări și ieșiri de pe server și schimbări de nume." },
  { key: "channels", label: "Canale", hint: "Canale create, modificate sau șterse și cine le-a schimbat." },
  { key: "roles", label: "Roluri", hint: "Roluri create, modificate sau șterse și rolurile primite sau pierdute de membri." },
  { key: "voice", label: "Voce", hint: "Intrări, ieșiri și mutări în canalele de voce." },
  { key: "moderation", label: "Moderare", hint: "Acțiunile de moderare: avertismente, mute, kick, ban, ștergeri, comenzi." },
  { key: "security", label: "Securitate", hint: "Alertele de raid, spam, AutoMod, comportament suspect și Judecătorul AI." },
];

export function isCategoryOn(config: any, key: ActivityCategory): boolean {
  // The server's default is on for every category.
  return config?.activityLog?.categories?.[key] !== false;
}

export function categoryChannel(config: any, key: ActivityCategory): string | null {
  const id = config?.activityLog?.channelIds?.[key];
  return typeof id === "string" && id ? id : null;
}

export function enabledCategoryCount(config: any): number {
  return ACTIVITY_CATEGORIES.filter(({ key }) => isCategoryOn(config, key)).length;
}

/** Categories ticked without a channel yet: the bot creates theirs when the logs are saved switched on. */
export function categoriesWithoutChannel(config: any): ActivityCategory[] {
  return ACTIVITY_CATEGORIES.filter(({ key }) => isCategoryOn(config, key) && !categoryChannel(config, key)).map(({ key }) => key);
}

/** The line under "Jurnale de activitate" in the menu. */
export function activitySummary(config: any): string {
  if (!config?.activityLog?.enabled) return "Oprite";
  return `${enabledCategoryCount(config)} din ${ACTIVITY_CATEGORIES.length} categorii`;
}

/* ------------------------------------------------------------------ */
/* Verificări înainte de salvare                                       */
/* ------------------------------------------------------------------ */

function channelProblem(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isDiscordId(value) ? null : `${label}: „${String(value)}” nu este un ID de canal Discord (are între 5 și 25 de cifre).`;
}

/** First problem that would make the server refuse the draft, worded for the person, or null. */
export function logsDraftError(config: any, sections?: ReadonlyArray<string>): string | null {
  const checks = (key: string) => !sections || sections.includes(key);
  if (checks("cases")) {
    const days = retentionDays(config);
    if (config?.cases && "retentionDays" in config.cases && !isValidInteger(days, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS)) {
      return `Cazuri — Păstrează cazurile: introdu un număr întreg de zile între ${MIN_RETENTION_DAYS} și ${MAX_RETENTION_DAYS}.`;
    }
  }
  if (checks("audit")) {
    const problem = channelProblem("Audit — Canalul de audit", config?.audit?.channelId);
    if (problem) return problem;
  }
  if (checks("activityLog")) {
    const log = config?.activityLog;
    if (log?.enabled && enabledCategoryCount(config) === 0) {
      return "Jurnale de activitate — alege cel puțin o categorie sau oprește jurnalele.";
    }
    for (const { key, label } of ACTIVITY_CATEGORIES) {
      const problem = channelProblem(`Jurnale de activitate — ${label}`, log?.channelIds?.[key]);
      if (problem) return problem;
    }
  }
  return null;
}
