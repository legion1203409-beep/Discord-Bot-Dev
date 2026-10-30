/**
 * Logica paginii Sancțiuni, fără React, ca să poată fi testată direct: modulele
 * grupului și rutele lor, treptele de escaladare, comenzile staff-ului, listele
 * de roluri și canale, profilele de timp, rezumatele din meniu și verificările
 * de dinainte de salvare.
 *
 * Ce scrie pagina este ce citește botul: api-server/src/moderation/config.ts
 * (schema) și api-server/src/bot/moderation/engine.ts (escalationLevelForCount,
 * ruleAtEscalationLevel, activeSeverity, validateManualPermission).
 */
import {
  MAX_MUTE_MINUTES, MIN_MUTE_MINUTES, SANCTIONS_MODULE_ROUTES, cleanPath, countLabel, deepEqual, describeMuteLength, getAt,
  isDiscordId, isValidInteger, isValidMuteMinutes,
} from "./model";

export { SANCTIONS_ROUTE, isSanctionsRoute } from "./model";

/* ------------------------------------------------------------------ */
/* Modulele grupului                                                   */
/* ------------------------------------------------------------------ */

export type SanctionsModuleId = keyof typeof SANCTIONS_MODULE_ROUTES;

export type SanctionsModuleDef = {
  id: SanctionsModuleId;
  route: string;
  /** Name in the menu. */
  short: string;
  title: string;
  description: string;
  /** The module's own on/off switch, when it has one. */
  configKey?: "escalation" | "manualTools";
  switchLabel?: string;
  /** What the module edits; a change in any of these marks it unsaved in the menu. */
  paths: readonly string[];
};

export const SANCTIONS_MODULES: readonly SanctionsModuleDef[] = [
  {
    id: "escalation", route: SANCTIONS_MODULE_ROUTES.escalation, short: "Escaladare", title: "Escaladarea sancțiunilor",
    description: "Pedeapsa crește pe măsură ce un membru repetă abaterile prinse de bot. Se pornește separat pe fiecare server.",
    configKey: "escalation", switchLabel: "Activează escaladarea", paths: ["escalation"],
  },
  {
    id: "commands", route: SANCTIONS_MODULE_ROUTES.commands, short: "Comenzi", title: "Comenzi de moderare",
    description: "Comenzile staff-ului, din Discord și din site: care sunt pornite și cine le poate folosi. Botul verifică oricum permisiunile și ierarhia fiecăruia.",
    configKey: "manualTools", switchLabel: "Activează comenzile de moderare", paths: ["manualTools", "roles.specialPermissionRoleIds"],
  },
  {
    id: "policies", route: SANCTIONS_MODULE_ROUTES.policies, short: "Roluri și canale", title: "Roluri și canale",
    description: "Pe cine poate sancționa botul și unde verifică mesajele. Se aplică întregii moderări, automate și manuale.",
    paths: ["roles.protectedRoleIds", "roles.ignoredAutoModRoleIds", "roles.sanctionableRoleIds", "channels"],
  },
  {
    id: "schedule", route: SANCTIONS_MODULE_ROUTES.schedule, short: "Program", title: "Program",
    description: "Cât de strictă e moderarea automată a mesajelor noaptea, ziua, în weekend sau în timpul unui eveniment.",
    paths: ["timeProfiles"],
  },
];

/** The module a route opens; "/sanctiuni" and unknown routes open the first one. */
export function sanctionsModuleForRoute(path: string): SanctionsModuleDef {
  const clean = cleanPath(path);
  return SANCTIONS_MODULES.find((module) => module.route === clean) ?? SANCTIONS_MODULES[0]!;
}

/** The parts of the configuration the page saves; only the ones that changed are sent. */
export const SANCTIONS_SECTIONS = [
  { key: "escalation", label: "Escaladare" },
  { key: "manualTools", label: "Comenzi" },
  { key: "roles", label: "Roluri" },
  { key: "channels", label: "Canale" },
  { key: "timeProfiles", label: "Program" },
] as const;

/** True when the draft differs from what is saved in anything this module edits. */
export function isModuleChanged(module: Pick<SanctionsModuleDef, "paths">, saved: any, draft: any): boolean {
  if (!saved || !draft) return false;
  return module.paths.some((path) => !deepEqual(getAt(saved, path.split(".")), getAt(draft, path.split("."))));
}

function listAt(config: any, path: readonly string[]): string[] {
  const value = getAt(config, [...path]);
  return Array.isArray(value) ? value : [];
}

/* ------------------------------------------------------------------ */
/* Escaladare                                                          */
/* ------------------------------------------------------------------ */

export type EscalationAction = "warn" | "mute" | "kick" | "ban";
export const ESCALATION_ACTIONS: ReadonlyArray<readonly [EscalationAction, string]> = [
  ["warn", "Avertisment"], ["mute", "Mute"], ["kick", "Kick"], ["ban", "Ban"],
];
/** Steps older settings may hold. They are shown as they are, so nothing changes by itself. */
export const LEGACY_ESCALATION_ACTIONS: Readonly<Record<string, string>> = { none: "Fără sancțiune", delete: "Doar ștergerea mesajului" };
const SAVED_ACTIONS = new Set(["none", "warn", "mute", "kick", "ban", "delete"]);

export const MAX_ESCALATION_LEVELS = 4;
export const MIN_VIOLATIONS = 1;
export const MAX_VIOLATIONS = 10_000;
export const MIN_RESET_DAYS = 1;
export const MAX_RESET_DAYS = 3_650;

export type EscalationLevel = { level: number; violations?: number; action: string; muteMinutes?: number };

export function escalationLevels(config: any): EscalationLevel[] {
  const levels = config?.escalation?.levels;
  return Array.isArray(levels) ? levels : [];
}

const NEXT_ACTION: Readonly<Record<string, EscalationAction>> = { warn: "mute", mute: "kick", kick: "ban", ban: "ban" };

/** Steps are numbered 1 to 4 in the order shown; the bot itself reads only the number of offenses. */
function numbered(levels: EscalationLevel[]): EscalationLevel[] {
  return levels.map((level, index) => (level.level === index + 1 ? level : { ...level, level: index + 1 }));
}

/** A new step after the last one: one offense later and one sanction stronger. */
export function addEscalationLevel(levels: EscalationLevel[]): EscalationLevel[] {
  if (levels.length >= MAX_ESCALATION_LEVELS) return levels;
  const highest = levels.reduce((max, level) => (
    isValidInteger(level.violations, MIN_VIOLATIONS, MAX_VIOLATIONS) ? Math.max(max, level.violations!) : max
  ), 0);
  const last = levels.at(-1);
  const action = last ? NEXT_ACTION[last.action] ?? "warn" : "warn";
  return numbered([...levels, { level: levels.length + 1, violations: Math.min(MAX_VIOLATIONS, highest + 1), action }]);
}

/** The bot needs at least one step, so the last one stays. */
export function removeEscalationLevel(levels: EscalationLevel[], index: number): EscalationLevel[] {
  if (levels.length <= 1) return levels;
  return numbered(levels.filter((_, position) => position !== index));
}

function changeLevel(levels: EscalationLevel[], index: number, change: (level: EscalationLevel) => EscalationLevel): EscalationLevel[] {
  return levels.map((level, position) => (position === index ? change({ ...level }) : level));
}

export function setEscalationViolations(levels: EscalationLevel[], index: number, violations: number | undefined): EscalationLevel[] {
  return changeLevel(levels, index, (level) => {
    if (violations === undefined) delete level.violations; else level.violations = violations;
    return level;
  });
}

export function setEscalationAction(levels: EscalationLevel[], index: number, action: string): EscalationLevel[] {
  return changeLevel(levels, index, (level) => {
    level.action = action;
    // Only a mute has a length.
    if (action !== "mute") delete level.muteMinutes;
    return level;
  });
}

export function setEscalationMuteMinutes(levels: EscalationLevel[], index: number, minutes: number | undefined): EscalationLevel[] {
  return changeLevel(levels, index, (level) => {
    if (minutes === undefined) delete level.muteMinutes; else level.muteMinutes = minutes;
    return level;
  });
}

/** What a step does, e.g. "Mute 1 zi"; a mute without its own length uses the rule's. */
export function describeEscalationAction(level: Pick<EscalationLevel, "action" | "muteMinutes">): string {
  if (level.action === "mute") return isValidMuteMinutes(level.muteMinutes) ? `Mute ${describeMuteLength(level.muteMinutes)}` : "Mute, durata regulii";
  return ESCALATION_ACTIONS.find(([key]) => key === level.action)?.[1] ?? LEGACY_ESCALATION_ACTIONS[level.action] ?? level.action;
}

export type LadderStep = {
  /** Position of the step in the list shown. */
  index: number;
  /** The offense it starts at, and the last one before the next step (null: and every one after). */
  from: number;
  to: number | null;
  level: EscalationLevel;
};

/**
 * The steps the way the bot reads them: by the number of offenses, whatever
 * their order in the list. Of two steps that start at the same offense only the
 * later one counts, as in the bot. A step without a valid number is left out.
 */
export function escalationLadder(levels: EscalationLevel[]): LadderStep[] {
  const sorted = levels
    .map((level, index) => ({ level, index }))
    .filter(({ level }) => isValidInteger(level.violations, MIN_VIOLATIONS, MAX_VIOLATIONS))
    .sort((left, right) => left.level.violations! - right.level.violations!);
  const kept = sorted.filter((entry, position) => sorted[position + 1]?.level.violations !== entry.level.violations);
  return kept.map((entry, position) => ({
    index: entry.index,
    from: entry.level.violations!,
    to: kept[position + 1] ? kept[position + 1]!.level.violations! - 1 : null,
    level: entry.level,
  }));
}

/** "3", "3–4" or "5+": the offenses a step covers. */
export function ladderRange(step: Pick<LadderStep, "from" | "to">): string {
  if (step.to === null) return `${step.from}+`;
  return step.to === step.from ? `${step.from}` : `${step.from}–${step.to}`;
}

/** Steps that never apply because a later step starts at the same offense. */
export function shadowedEscalationLevels(levels: EscalationLevel[]): number[] {
  const used = new Set(escalationLadder(levels).map((step) => step.index));
  return levels
    .map((level, index) => ({ level, index }))
    .filter(({ level, index }) => isValidInteger(level.violations, MIN_VIOLATIONS, MAX_VIOLATIONS) && !used.has(index))
    .map(({ index }) => index);
}

export function describeDays(days: number): string {
  return countLabel(days, "zi", "zile");
}

/** The line under "Escaladare" in the menu. */
export function escalationSummary(config: any): string {
  if (!config?.escalation?.enabled) return "Oprită";
  const steps = escalationLadder(escalationLevels(config)).length;
  const days = config.escalation.resetAfterDays;
  const reset = isValidInteger(days, MIN_RESET_DAYS, MAX_RESET_DAYS) ? ` · ${describeDays(days)}` : "";
  return `${countLabel(steps, "treaptă", "trepte")}${reset}`;
}

/* ------------------------------------------------------------------ */
/* Comenzile staff-ului                                                */
/* ------------------------------------------------------------------ */

export type CommandKey = "warn" | "mute" | "unmute" | "kick" | "ban" | "nick" | "role" | "purge" | "slowmode" | "lock" | "unlock";
export type CommandGroup = "sanctions" | "members" | "channels";
export type CommandDef = {
  key: CommandKey;
  group: CommandGroup;
  description: string;
  /** The Discord permission that lets someone use it without a role chosen here. */
  permission: string;
  /** The person also needs that permission in the channel the command is used in. */
  inChannel?: boolean;
};

export const COMMAND_GROUPS: ReadonlyArray<readonly [CommandGroup, string]> = [
  ["sanctions", "Sancțiuni"], ["members", "Membri"], ["channels", "Canale și mesaje"],
];

export const STAFF_COMMANDS: readonly CommandDef[] = [
  { key: "warn", group: "sanctions", permission: "Timeout Members", description: "Dă un avertisment unui membru, care intră în dosarul lui." },
  { key: "mute", group: "sanctions", permission: "Timeout Members", description: "Pune un membru pe mute (timeout), de la un minut la 28 de zile." },
  { key: "unmute", group: "sanctions", permission: "Timeout Members", description: "Scoate mute-ul unui membru." },
  { key: "kick", group: "sanctions", permission: "Kick Members", description: "Scoate un membru de pe server; poate reveni cu o invitație." },
  { key: "ban", group: "sanctions", permission: "Ban Members", description: "Interzice accesul unui membru pe server." },
  { key: "nick", group: "members", permission: "Manage Nicknames", description: "Schimbă nickname-ul unui membru." },
  { key: "role", group: "members", permission: "Manage Roles", description: "Dă unui membru un rol aflat sub rolul tău și al botului, care nu aduce permisiuni pe care nu le ai deja." },
  { key: "purge", group: "channels", permission: "Manage Messages", inChannel: true, description: "Șterge între 1 și 100 de mesaje recente dintr-un canal." },
  { key: "slowmode", group: "channels", permission: "Manage Channels", inChannel: true, description: "Setează pauza dintre mesaje într-un canal; 0 o scoate." },
  { key: "lock", group: "channels", permission: "Manage Channels", inChannel: true, description: "Blochează scrisul într-un canal și ține minte permisiunile de dinainte." },
  { key: "unlock", group: "channels", permission: "Manage Channels", inChannel: true, description: "Redeschide un canal blocat cu /lock, exact cum era." },
];

export function disabledCommands(config: any): string[] {
  return listAt(config, ["manualTools", "disabledCommands"]);
}

export function isCommandOn(config: any, key: CommandKey): boolean {
  return !disabledCommands(config).includes(key);
}

/**
 * Switches one command on or off for everyone. A command switched off goes to
 * the end of the list and one switched back on leaves it, so undoing a change
 * gives back exactly what was saved.
 */
export function setCommandOn<T extends Record<string, any>>(manualTools: T | undefined, key: CommandKey, on: boolean): T {
  const current: string[] = Array.isArray(manualTools?.disabledCommands) ? manualTools!.disabledCommands : [];
  const others = current.filter((item) => item !== key);
  return { ...(manualTools ?? {}), disabledCommands: on ? others : [...others, key] } as unknown as T;
}

export function enabledCommandCount(config: any): number {
  return STAFF_COMMANDS.filter((command) => isCommandOn(config, command.key)).length;
}

/** How many commands staff can use right now: none while the commands are switched off. */
export function availableCommandCount(config: any): number {
  return config?.manualTools?.enabled ? enabledCommandCount(config) : 0;
}

export function commandGrants(config: any, key: CommandKey): string[] {
  return listAt(config, ["manualTools", "commandGrants", key]);
}

/** The roles that may use a command besides the Discord permission; an empty list is removed. */
export function setCommandGrants<T extends Record<string, any>>(manualTools: T | undefined, key: CommandKey, roleIds: string[]): T {
  const grants: Record<string, string[]> = { ...(manualTools?.commandGrants ?? {}) };
  if (roleIds.length) grants[key] = roleIds; else delete grants[key];
  return { ...(manualTools ?? {}), commandGrants: grants } as unknown as T;
}

/** The line under a command: switched off, or who can use it. */
export function commandSummary(config: any, command: CommandDef): string {
  if (!isCommandOn(config, command.key)) return "Oprită pentru toți";
  const roles = commandGrants(config, command.key).length;
  return roles ? `${command.permission} sau ${countLabel(roles, "rol ales", "roluri alese")}` : `Cu permisiunea ${command.permission}`;
}

/** The line under "Comenzi" in the menu. */
export function commandsSummary(config: any): string {
  if (!config?.manualTools?.enabled) return "Oprite";
  const on = enabledCommandCount(config);
  return on === STAFF_COMMANDS.length ? "Toate pornite" : `${on} din ${STAFF_COMMANDS.length} pornite`;
}

/* ------------------------------------------------------------------ */
/* Roluri și canale                                                    */
/* ------------------------------------------------------------------ */

export type PolicyDef = {
  path: readonly [string, string];
  kind: "role" | "channel";
  label: string;
  hint: string;
  testId: string;
  /** Only plain text channels: the bot changes slowmode there and nowhere else. */
  textOnly?: boolean;
};

export const ROLE_POLICIES: readonly PolicyDef[] = [
  {
    path: ["roles", "protectedRoleIds"], kind: "role", testId: "policy-protected-roles", label: "Roluri protejate",
    hint: "Membrii cu aceste roluri nu pot fi sancționați deloc: nici de bot, nici cu comenzile staff-ului. Rolurile protejate nu pot fi date nici cu /role.",
  },
  {
    path: ["roles", "ignoredAutoModRoleIds"], kind: "role", testId: "policy-ignored-roles", label: "Roluri ignorate de moderarea automată",
    hint: "Botul nu le verifică mesajele și ce fac pe server. Staff-ul îi poate sancționa în continuare cu comenzi.",
  },
  {
    path: ["roles", "sanctionableRoleIds"], kind: "role", testId: "policy-sanctionable-roles", label: "Doar aceste roluri pot fi sancționate",
    hint: "Lasă gol ca oricine să poată fi sancționat. Dacă alegi roluri, doar membrii cu cel puțin unul dintre ele pot primi sancțiuni, automate sau de la staff.",
  },
];

export const CHANNEL_POLICIES: readonly PolicyDef[] = [
  {
    path: ["channels", "ignoredChannelIds"], kind: "channel", testId: "policy-ignored-channels", label: "Canale ignorate",
    hint: "Botul nu verifică mesajele și evenimentele din ele. Comenzile staff-ului merg normal.",
  },
  {
    path: ["channels", "protectedChannelIds"], kind: "channel", testId: "policy-protected-channels", label: "Canale protejate",
    hint: "Botul nu verifică nimic în ele, iar staff-ul nu poate folosi aici /purge, /slowmode, /lock și /unlock.",
  },
  {
    path: ["channels", "strictChannelIds"], kind: "channel", testId: "policy-strict-channels", label: "Canale stricte",
    hint: "Regulile automate de mesaje sunt aici mereu pe severitatea Strictă: praguri cu 25% mai mici, la orice oră.",
  },
  {
    path: ["channels", "softChannelIds"], kind: "channel", testId: "policy-soft-channels", label: "Canale blânde",
    hint: "Regulile automate de mesaje sunt aici mereu pe severitatea Blândă: praguri cu 50% mai mari, la orice oră.",
  },
  {
    path: ["channels", "autoSlowmodeChannelIds"], kind: "channel", testId: "policy-slowmode-channels", label: "Slowmode automat", textOnly: true,
    hint: "Când o regulă automată prinde un mesaj aici, botul pune slowmode: 5 secunde între mesaje, 10 dacă regula e pe Strictă. Rămâne până îl scoți (cu /slowmode 0 sau din Discord). Merge doar în canalele text în care botul are Manage Channels.",
  },
];

export function policyList(config: any, def: Pick<PolicyDef, "path">): string[] {
  return listAt(config, def.path);
}

/** The line under "Roluri și canale" in the menu. */
export function policySummary(config: any): string {
  const roles = ROLE_POLICIES.reduce((count, def) => count + policyList(config, def).length, 0);
  const channels = CHANNEL_POLICIES.reduce((count, def) => count + policyList(config, def).length, 0);
  if (!roles && !channels) return "Nimic ales";
  return [roles ? countLabel(roles, "rol", "roluri") : "", channels ? countLabel(channels, "canal", "canale") : ""].filter(Boolean).join(" · ");
}

/**
 * Choices that cancel each other out, worded for the person: the bot applies
 * only one of them, so say which. `name` turns an ID into "#canal" or "@rol".
 */
export function policyConflicts(config: any, name: (kind: "role" | "channel", id: string) => string): string[] {
  const notes: string[] = [];
  const list = (path: readonly [string, string]) => policyList(config, { path });
  const strict = new Set(list(["channels", "strictChannelIds"]));
  const soft = list(["channels", "softChannelIds"]);
  const unchecked = new Set([...list(["channels", "ignoredChannelIds"]), ...list(["channels", "protectedChannelIds"])]);
  const both = soft.filter((id) => strict.has(id));
  if (both.length) {
    notes.push(`${both.map((id) => name("channel", id)).join(", ")} ${both.length === 1 ? "este" : "sunt"} și printre canalele stricte, și printre cele blânde: contează Strictă.`);
  }
  const shaped = [...new Set([...strict, ...soft, ...list(["channels", "autoSlowmodeChannelIds"])])].filter((id) => unchecked.has(id));
  if (shaped.length) {
    notes.push(`${shaped.map((id) => name("channel", id)).join(", ")} nu ${shaped.length === 1 ? "este verificat" : "sunt verificate"} deloc (ignorat sau protejat), așa că severitatea și slowmode-ul alese aici nu se aplică.`);
  }
  const protectedRoles = new Set(list(["roles", "protectedRoleIds"]));
  const sanctionableProtected = list(["roles", "sanctionableRoleIds"]).filter((id) => protectedRoles.has(id));
  if (sanctionableProtected.length) {
    notes.push(`${sanctionableProtected.map((id) => name("role", id)).join(", ")} ${sanctionableProtected.length === 1 ? "este protejat" : "sunt protejate"}, deci nu poate fi sancționat, chiar dacă apare și printre rolurile sancționabile.`);
  }
  return notes;
}

/* ------------------------------------------------------------------ */
/* Program                                                             */
/* ------------------------------------------------------------------ */

export type Severity = "soft" | "normal" | "hard";
export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { soft: "Blândă", normal: "Normală", hard: "Strictă" };
export const SEVERITY_OPTIONS: ReadonlyArray<readonly [Severity, string]> = [["soft", "Blândă"], ["normal", "Normală"], ["hard", "Strictă"]];

export type ScheduleProfile = "majorEvent" | "strictNight" | "weekend" | "softDay";
export const PROFILE_LABEL: Readonly<Record<ScheduleProfile, string>> = {
  majorEvent: "Eveniment major", strictNight: "Noapte strictă", weekend: "Weekend", softDay: "Zi blândă",
};
const PROFILE_ORDER: readonly ScheduleProfile[] = ["majorEvent", "strictNight", "weekend", "softDay"];
const DEFAULT_HOURS = { strictNight: [22, 7], softDay: [8, 21] } as const;

/** Whole hours, both ends included: 22–7 covers 22:00 to 07:59. */
export function hourInRange(hour: number, start: number, end: number): boolean {
  return start <= end ? hour >= start && hour <= end : hour >= start || hour <= end;
}

function hoursOf(timeProfiles: any, key: "strictNight" | "softDay"): [number, number] | null {
  const start = timeProfiles?.[key]?.startHour ?? DEFAULT_HOURS[key][0];
  const end = timeProfiles?.[key]?.endHour ?? DEFAULT_HOURS[key][1];
  return isValidInteger(start, 0, 23) && isValidInteger(end, 0, 23) ? [start, end] : null;
}

function severityOf(value: unknown, fallback: Severity): Severity {
  return value === "soft" || value === "normal" || value === "hard" ? value : fallback;
}

export type ActiveProfile = { profile: ScheduleProfile; severity: Severity };

/**
 * The profile in force at an hour, in the bot's order (strict and soft channels
 * come before all of them): a major event, the strict night, the weekend, which
 * replaces the soft day on Saturdays and Sundays, and the soft day. Null: every
 * rule keeps its own severity.
 */
export function profileAt(timeProfiles: any, hour: number, weekend: boolean): ActiveProfile | null {
  const tp = timeProfiles ?? {};
  if (tp.majorEvent?.enabled) return { profile: "majorEvent", severity: severityOf(tp.majorEvent.severity, "hard") };
  const night = hoursOf(tp, "strictNight");
  if (tp.strictNight?.enabled && night && hourInRange(hour, night[0], night[1])) return { profile: "strictNight", severity: "hard" };
  if (tp.weekend?.enabled && weekend) return { profile: "weekend", severity: severityOf(tp.weekend.severity, "normal") };
  const day = hoursOf(tp, "softDay");
  if (tp.softDay?.enabled && day && hourInRange(hour, day[0], day[1])) return { profile: "softDay", severity: "soft" };
  return null;
}

/** The 24 hours of a weekday or of a weekend day, each with the profile in force. */
export function dayTimeline(timeProfiles: any, weekend: boolean): Array<{ hour: number; active: ActiveProfile | null }> {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, active: profileAt(timeProfiles, hour, weekend) }));
}

/** The same timeline as consecutive stretches, for reading it out: [{ from: 0, to: 7, active }]. */
export function timelineStretches(timeline: Array<{ hour: number; active: ActiveProfile | null }>) {
  const stretches: Array<{ from: number; to: number; active: ActiveProfile | null }> = [];
  for (const { hour, active } of timeline) {
    const last = stretches.at(-1);
    if (last && last.active?.profile === active?.profile && last.active?.severity === active?.severity) last.to = hour;
    else stretches.push({ from: hour, to: hour, active });
  }
  return stretches;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "22:00 – 07:59": the end hour is included whole. */
export function formatHourRange(start: number, end: number): string {
  return `${pad(start)}:00 – ${pad(end)}:59`;
}

export const TIMEZONES: ReadonlyArray<readonly [string, string]> = [
  ["Europe/Bucharest", "București"], ["Europe/Chisinau", "Chișinău"], ["UTC", "UTC"], ["Europe/London", "Londra"],
  ["Europe/Dublin", "Dublin"], ["Europe/Lisbon", "Lisabona"], ["Europe/Madrid", "Madrid"], ["Europe/Paris", "Paris"],
  ["Europe/Brussels", "Bruxelles"], ["Europe/Amsterdam", "Amsterdam"], ["Europe/Berlin", "Berlin"], ["Europe/Vienna", "Viena"],
  ["Europe/Rome", "Roma"], ["Europe/Athens", "Atena"], ["Europe/Istanbul", "Istanbul"], ["America/New_York", "New York"],
  ["America/Chicago", "Chicago"], ["America/Los_Angeles", "Los Angeles"], ["America/Toronto", "Toronto"],
];

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const DAY_NAMES: Readonly<Record<string, string>> = {
  Mon: "luni", Tue: "marți", Wed: "miercuri", Thu: "joi", Fri: "vineri", Sat: "sâmbătă", Sun: "duminică",
};

/** The hour and day in a time zone, read the way the bot reads them. */
export function localTime(timezone: string, now: Date): { hour: number; minute: number; day: string; weekend: boolean } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "numeric", minute: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    if (!isValidInteger(hour, 0, 23) || !isValidInteger(minute, 0, 59) || !DAY_NAMES[weekday]) return null;
    return { hour, minute, day: DAY_NAMES[weekday]!, weekend: weekday === "Sat" || weekday === "Sun" };
  } catch {
    return null;
  }
}

/** What applies right now: the local time on the server's clock and the profile in force. */
export function scheduleNow(timeProfiles: any, now: Date = new Date()): { time: string; day: string; active: ActiveProfile | null } | null {
  const timezone = timeProfiles?.timezone ?? "UTC";
  if (!isValidTimezone(timezone)) return null;
  const local = localTime(timezone, now);
  if (!local) return null;
  return { time: `${pad(local.hour)}:${pad(local.minute)}`, day: local.day, active: profileAt(timeProfiles, local.hour, local.weekend) };
}

export function enabledProfiles(timeProfiles: any): ScheduleProfile[] {
  return PROFILE_ORDER.filter((profile) => timeProfiles?.[profile]?.enabled === true);
}

/** The line under "Program" in the menu. */
export function scheduleSummary(config: any): string {
  const on = enabledProfiles(config?.timeProfiles).map((profile) => PROFILE_LABEL[profile]);
  return on.length ? on.join(" · ") : "Niciun profil pornit";
}

/* ------------------------------------------------------------------ */
/* Verificări înainte de salvare                                       */
/* ------------------------------------------------------------------ */

function idListProblem(label: string, list: unknown): string | null {
  if (list === undefined) return null;
  if (!Array.isArray(list)) return `${label}: lista nu a putut fi citită.`;
  if (list.length > 100) return `${label}: cel mult 100.`;
  const wrong = list.find((id) => typeof id !== "string" || !isDiscordId(id));
  return wrong === undefined ? null : `${label}: „${String(wrong)}” nu este un ID Discord (are între 5 și 25 de cifre).`;
}

/** First problem that would make the server refuse the draft, worded for the person, or null. */
export function sanctionsDraftError(config: any, sections?: ReadonlyArray<string>): string | null {
  // Only the parts about to be sent are checked: an old value nobody touched must not block the rest.
  const checks = (key: string) => !sections || sections.includes(key);
  if (checks("escalation")) {
    const days = config?.escalation?.resetAfterDays;
    if (days !== undefined && !isValidInteger(days, MIN_RESET_DAYS, MAX_RESET_DAYS)) {
      return `Escaladare — Abaterile se uită după: introdu un număr întreg de zile între ${MIN_RESET_DAYS} și ${MAX_RESET_DAYS}.`;
    }
    // Without a list of its own the server keeps its four default steps.
    const levels = escalationLevels(config);
    if (Array.isArray(config?.escalation?.levels) && (levels.length < 1 || levels.length > MAX_ESCALATION_LEVELS)) {
      return `Escaladare — păstrează între 1 și ${MAX_ESCALATION_LEVELS} trepte.`;
    }
    for (const [index, level] of levels.entries()) {
      const name = `Escaladare — treapta ${index + 1}`;
      if (!isValidInteger(level.violations, MIN_VIOLATIONS, MAX_VIOLATIONS)) {
        return `${name}, La abaterea: introdu un număr întreg între ${MIN_VIOLATIONS} și ${MAX_VIOLATIONS}.`;
      }
      if (!SAVED_ACTIONS.has(level.action)) return `${name}: alege sancțiunea.`;
      if (level.muteMinutes !== undefined && !isValidMuteMinutes(level.muteMinutes)) {
        return `${name}, Minute de mute: introdu un număr întreg între ${MIN_MUTE_MINUTES} și ${MAX_MUTE_MINUTES}.`;
      }
    }
  }
  if (checks("manualTools")) {
    for (const command of STAFF_COMMANDS) {
      const problem = idListProblem(`Comenzi — rolurile pentru /${command.key}`, config?.manualTools?.commandGrants?.[command.key]);
      if (problem) return problem;
    }
  }
  if (checks("roles")) {
    for (const def of ROLE_POLICIES) {
      const problem = idListProblem(def.label, getAt(config, [...def.path]));
      if (problem) return problem;
    }
    const special = idListProblem("Roluri cu acces la toate comenzile", config?.roles?.specialPermissionRoleIds);
    if (special) return special;
  }
  if (checks("channels")) {
    for (const def of CHANNEL_POLICIES) {
      const problem = idListProblem(def.label, getAt(config, [...def.path]));
      if (problem) return problem;
    }
  }
  if (checks("timeProfiles")) {
    const tp = config?.timeProfiles ?? {};
    if (tp.timezone !== undefined && !isValidTimezone(tp.timezone)) return `Program — fusul orar „${String(tp.timezone)}” nu este valid. Alege unul din listă.`;
    for (const key of ["strictNight", "softDay"] as const) {
      for (const field of ["startHour", "endHour"] as const) {
        const value = tp[key]?.[field];
        if (value !== undefined && !isValidInteger(value, 0, 23)) return `Program — ${PROFILE_LABEL[key]}: alege o oră între 0 și 23.`;
      }
    }
  }
  return null;
}
