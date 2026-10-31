/**
 * Pure logic of the protection panel: which ticked action ends up in which
 * field of a rule, how a rule reads back into ticks, the registry of the five
 * protection modules and their rules, and the checks run before saving.
 *
 * Nothing here touches React, so every behaviour a tick has on the bot can be
 * covered by plain unit tests. The server mirror of the action rules lives in
 * api-server/src/bot/moderation/rule-actions.ts; what this file writes is what
 * that planner reads.
 */
import {
  CAPS_LIMIT, DELETE_SPAM, EDIT_SPAM, EMOJI_LIMIT, FLOOD_LENGTH, FLOOD_RUN, groupThresholdFields, MENTION_LIMIT,
  MESSAGE_SPAM, RAID_LIMIT, REPEAT_LIMIT, SUSPICIOUS_LIMIT, type Threshold,
} from "../../../lib/anti-spam-validation";

export type Path = Array<string | number>;
export type RuleLike = { action?: string; deleteMessage?: boolean; warnMember?: boolean; alertStaff?: boolean; muteMinutes?: number } & Record<string, any>;

/* ------------------------------------------------------------------ */
/* Ticked actions                                                      */
/* ------------------------------------------------------------------ */

export type ActionKey = "delete" | "warn" | "mute" | "kick" | "ban" | "alert";
export type ActionTicks = Record<ActionKey, boolean>;
/**
 * message: the rule reacts to a message, so the message can be deleted.
 * scam:    the anti-scam filter; it always deletes and has no "ban".
 * event:   the rule reacts to something that is not a message (a join, a role change).
 */
export type RuleKind = "message" | "scam" | "event";

export const ACTION_ORDER: readonly ActionKey[] = ["delete", "warn", "mute", "kick", "ban", "alert"];
export const ACTION_LABEL: Record<ActionKey, string> = {
  delete: "Șterge mesajul",
  warn: "Avertisment",
  mute: "Mute",
  kick: "Kick",
  ban: "Ban",
  alert: "Anunță staff-ul",
};
export const ACTION_HINT: Record<ActionKey, string> = {
  delete: "Mesajul dispare din canal.",
  warn: "Membrul primește un avertisment, care intră în dosarul lui.",
  mute: "Membrul nu mai poate scrie cât ține durata aleasă.",
  kick: "Membrul este scos de pe server și poate reveni.",
  ban: "Membrul este interzis pe server.",
  alert: "Staff-ul este menționat în canalul de jurnal sau de alerte.",
};

export const MIN_MUTE_MINUTES = 1;
export const MAX_MUTE_MINUTES = 40_320;
export const DEFAULT_MUTE_MINUTES = 10;
export const MUTE_PRESETS: ReadonlyArray<readonly [number, string]> = [
  [5, "5 min"], [10, "10 min"], [60, "1 oră"], [360, "6 ore"], [1_440, "1 zi"], [10_080, "7 zile"],
];

const SANCTIONS = ["mute", "kick", "ban"] as const;

/** Which ticks a kind of rule offers. */
export function availableActions(kind: RuleKind, only?: readonly ActionKey[]): ActionKey[] {
  const all: ActionKey[] = kind === "message" ? ["delete", "warn", "mute", "kick", "ban", "alert"]
    : kind === "scam" ? ["delete", "warn", "mute", "kick", "alert"]
    : ["warn", "mute", "kick", "ban", "alert"];
  return only ? all.filter((key) => only.includes(key)) : all;
}

/** Ticks that are on and cannot be changed (the anti-scam filter always deletes). */
export function lockedActions(kind: RuleKind): ActionKey[] {
  return kind === "scam" ? ["delete"] : [];
}

/** Reads what a rule currently does, in ticks. Rules saved before the extra ticks existed read correctly. */
export function readTicks(rule: RuleLike | null | undefined, kind: RuleKind): ActionTicks {
  const source = rule ?? {};
  const action = typeof source.action === "string" ? source.action : "none";
  const sanction = action === "delete" ? "none" : action;
  return {
    delete: kind === "scam" ? true : kind === "message" ? action === "delete" || source.deleteMessage === true : false,
    warn: sanction === "warn" || source.warnMember === true,
    mute: sanction === "mute",
    kick: sanction === "kick",
    ban: kind === "scam" ? false : sanction === "ban",
    alert: source.alertStaff === true,
  };
}

/**
 * Writes ticks into a rule. Keeps every other field. A warning on its own is the
 * rule's main action ("warn"); next to a mute, kick or ban it becomes the
 * extra `warnMember` flag. A deletion is the independent `deleteMessage` flag.
 */
export function writeTicks<T extends RuleLike>(rule: T, ticks: ActionTicks, kind: RuleKind): T {
  const next: RuleLike = { ...rule };
  const sanction = SANCTIONS.find((key) => ticks[key] && (key !== "ban" || kind !== "scam")) ?? null;
  if (kind === "scam") {
    next.action = sanction === "mute" || sanction === "kick" ? sanction : "delete";
    if (ticks.warn) next.warnMember = true; else delete next.warnMember;
  } else {
    if (sanction) {
      next.action = sanction;
      if (ticks.warn) next.warnMember = true; else delete next.warnMember;
    } else {
      next.action = ticks.warn ? "warn" : "none";
      delete next.warnMember;
    }
    if (kind === "message") next.deleteMessage = ticks.delete;
  }
  if (ticks.alert) next.alertStaff = true; else delete next.alertStaff;
  return next as T;
}

const TICK_FIELDS = ["action", "deleteMessage", "warnMember", "alertStaff", "muteMinutes"] as const;

/**
 * Copies only what the ticks decide (action, deletion, warning, alert, mute
 * length) from `source` onto `target`. Used to apply a tick change onto the
 * newest state of a rule or module without touching its other fields.
 */
export function withTickFields<T extends RuleLike>(target: T, source: RuleLike): T {
  const next: RuleLike = { ...target };
  for (const key of TICK_FIELDS) {
    if (source[key] === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = source[key];
  }
  return next as T;
}

/** True when at least one action is ticked. */
export function hasTickedAction(rule: RuleLike | null | undefined, kind: RuleKind, only?: readonly ActionKey[]): boolean {
  return describeTicks(rule, kind, only).length > 0;
}

/** Turns one tick on or off. Mute, kick and ban exclude each other; locked and unavailable ticks do nothing. */
export function toggleTick<T extends RuleLike>(rule: T, key: ActionKey, on: boolean, kind: RuleKind, only?: readonly ActionKey[]): T {
  if (!availableActions(kind, only).includes(key) || lockedActions(kind).includes(key)) return rule;
  const ticks = readTicks(rule, kind);
  ticks[key] = on;
  if (on && (SANCTIONS as readonly string[]).includes(key)) {
    for (const other of SANCTIONS) if (other !== key) ticks[other] = false;
  }
  return writeTicks(rule, ticks, kind);
}

export function readMuteMinutes(rule: RuleLike | null | undefined): number {
  const value = rule?.muteMinutes;
  return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_MUTE_MINUTES;
}

export function isValidMuteMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_MUTE_MINUTES && value <= MAX_MUTE_MINUTES;
}

export function setMuteMinutes<T extends RuleLike>(rule: T, minutes: number | undefined): T {
  const next: RuleLike = { ...rule };
  if (minutes === undefined) delete next.muteMinutes; else next.muteMinutes = minutes;
  return next as T;
}

/** A rule saved with the old single "delete" action: it cannot delete anything when the event is not a message. */
export function hasUnavailableDelete(rule: RuleLike | null | undefined, kind: RuleKind): boolean {
  return kind === "event" && rule?.action === "delete";
}

/** Mirror of the server rule: a rule that picked its own warning or sanction does not follow its module. */
export function hasOwnSanction(rule: RuleLike | null | undefined): boolean {
  const action = rule?.action;
  return action === "warn" || action === "mute" || action === "kick" || action === "ban" || rule?.warnMember === true;
}

/**
 * A count with its noun, the Romanian way: "1 zi", "5 zile", "20 de zile",
 * "101 zile". From 20 on, a number not ending in 01–19 takes "de".
 */
export function countLabel(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const rest = Math.abs(count) % 100;
  const plain = count === 0 || (rest >= 1 && rest <= 19);
  return plain ? `${count} ${many}` : `${count} de ${many}`;
}

export function describeMuteLength(minutes: number): string {
  if (minutes % 1_440 === 0) return countLabel(minutes / 1_440, "zi", "zile");
  if (minutes % 60 === 0) return countLabel(minutes / 60, "oră", "ore");
  return countLabel(minutes, "minut", "minute");
}

function partsOf(ticks: ActionTicks, muteMinutes: number, kind: RuleKind, only?: readonly ActionKey[]): string[] {
  const offered = availableActions(kind, only);
  return ACTION_ORDER.filter((key) => offered.includes(key) && ticks[key]).map((key) =>
    key === "mute" ? `Mute ${describeMuteLength(muteMinutes)}` : ACTION_LABEL[key]);
}

/** The ticked actions as readable parts, in a fixed order, e.g. ["Șterge mesajul", "Mute 1 oră"]. */
export function describeTicks(rule: RuleLike | null | undefined, kind: RuleKind, only?: readonly ActionKey[]): string[] {
  return partsOf(readTicks(rule, kind), readMuteMinutes(rule), kind, only);
}

/**
 * One line for a rule's subtitle. An event rule without a warning or sanction of
 * its own follows its module (the staff alert counts if either one asks for it).
 */
export function actionsText(
  rule: RuleLike | null | undefined,
  kind: RuleKind,
  options: { only?: readonly ActionKey[]; moduleDefaults?: RuleLike | null } = {},
): string {
  const { only, moduleDefaults } = options;
  if (moduleDefaults && kind === "event") {
    const moduleAlert = readTicks(moduleDefaults, "event").alert;
    if (!hasOwnSanction(rule)) {
      const inherited = readTicks(moduleDefaults, "event");
      const merged: ActionTicks = { ...inherited, alert: moduleAlert || readTicks(rule, kind).alert };
      const parts = partsOf(merged, readMuteMinutes(moduleDefaults), kind, only);
      return parts.length ? `Ca modulul: ${parts.join(" + ")}` : "Doar înregistrare";
    }
    // Its own sanction, but the staff alert still adds up with the module's.
    const own: ActionTicks = { ...readTicks(rule, kind), alert: moduleAlert || readTicks(rule, kind).alert };
    const parts = partsOf(own, readMuteMinutes(rule), kind, only);
    return parts.length ? parts.join(" + ") : "Doar înregistrare";
  }
  const own = describeTicks(rule, kind, only);
  return own.length ? own.join(" + ") : "Doar înregistrare";
}

/* ------------------------------------------------------------------ */
/* Values and paths                                                    */
/* ------------------------------------------------------------------ */

export function getAt(source: any, path: Path): any {
  return path.reduce((value, key) => value?.[key], source);
}

/** Immutable nested update; creates missing objects on the way. */
export function setAt<T extends Record<string, any>>(source: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const copy: any = Array.isArray(source) ? [...source] : { ...(source ?? {}) };
  const child = copy[head!];
  copy[head!] = rest.length === 0
    ? value
    : setAt(child ?? (typeof rest[0] === "number" ? [] : {}), rest, value);
  return copy;
}

/** Structural equality that ignores key order, so reverting an edit leaves nothing "unsaved". */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  const keysA = Object.keys(a as object).filter((key) => (a as any)[key] !== undefined);
  const keysB = Object.keys(b as object).filter((key) => (b as any)[key] !== undefined);
  return keysA.length === keysB.length && keysA.every((key) => deepEqual((a as any)[key], (b as any)[key]));
}

/** A Discord ID (snowflake) has 5 to 25 digits. */
export function isDiscordId(value: string): boolean {
  return /^\d{5,25}$/.test(value);
}

export function isValidInteger(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** The number to show for a threshold: the preferred key, else the first legacy alias that is set. */
export function readThreshold(rule: RuleLike | null | undefined, field: Threshold): number | undefined {
  const thresholds = rule?.thresholds ?? {};
  return thresholds[field.key] ?? field.groupKeys.map((key) => thresholds[key]).find((value) => value !== undefined);
}

/** Writes the preferred key and removes the legacy aliases, so the engine cannot read an older alias first. */
export function writeThreshold<T extends RuleLike>(rule: T, field: Threshold, value: number | undefined): T {
  const thresholds: Record<string, unknown> = { ...(rule.thresholds ?? {}) };
  for (const key of field.groupKeys) delete thresholds[key];
  if (value !== undefined) thresholds[field.key] = value;
  return { ...rule, thresholds };
}

/** Threshold fields of a rule, one per group of aliases. */
export function thresholdFields(thresholds: Threshold[]): Threshold[] {
  return groupThresholdFields(thresholds);
}

/* ------------------------------------------------------------------ */
/* Modules and rules                                                   */
/* ------------------------------------------------------------------ */

export type ModuleId = "automod" | "antispam" | "antiflood" | "antiraid" | "suspect";

export type RuleDef = {
  /** Stable id, used for the open/closed state of the card and for test ids. */
  id: string;
  /** Where the rule lives in the configuration. */
  path: string[];
  title: string;
  hint: string;
  kind: RuleKind;
  thresholds: Threshold[];
  /** Restricts the ticks a rule offers (flow of joins and leaves can only alert). */
  onlyActions?: readonly ActionKey[];
  /**
   * What the severity setting changes for this rule. "thresholds": the numbers
   * above are scaled; "slowmode": the rule has no number to scale, severity only
   * sets the automatic slowmode; "none": the bot ignores it, so it is not shown.
   */
  severity: "thresholds" | "slowmode" | "none";
  /** Name of the switch in the card header. */
  switchLabel?: string;
};

export type ModuleDef = {
  id: ModuleId;
  /** Key of the module in the configuration. */
  configKey: "autoMod" | "antiSpam" | "antiFlood" | "antiRaid" | "suspiciousBehavior";
  route: string;
  title: string;
  short: string;
  description: string;
  switchLabel: string;
  /** Name used in the group page header and in toasts. */
  rulesTitle?: string;
  rules: RuleDef[];
};

const rule = (def: RuleDef): RuleDef => def;

export const MODULES: ModuleDef[] = [
  {
    id: "automod",
    configKey: "autoMod",
    route: "/automod",
    title: "AutoMod pentru mesaje",
    short: "AutoMod",
    description: "Filtrează mesajele după cuvinte, linkuri, scamuri și format. Fiecare regulă are acțiunile ei.",
    switchLabel: "Activează AutoMod",
    rulesTitle: "Reguli",
    rules: [
      rule({ id: "wordFilter", path: ["autoMod", "wordFilter"], title: "Filtru cuvinte", hint: "Șterge sau sancționează mesajele care conțin cuvintele din listă.", kind: "message", severity: "slowmode", thresholds: [] }),
      rule({ id: "linkBlock", path: ["autoMod", "linkBlock"], title: "Blocare linkuri", hint: "Blochează categoriile de linkuri alese și domeniile din listă.", kind: "message", severity: "slowmode", thresholds: [] }),
      rule({ id: "scamFilter", path: ["autoMod", "scamFilter"], title: "Anti-Scam", hint: "Recunoaște afirmațiile clare despre câștiguri în bani sau crypto, inclusiv în imaginile atașate.", kind: "scam", severity: "none", thresholds: [], switchLabel: "Activează Anti-Scam" }),
      rule({ id: "emojiLimit", path: ["autoMod", "emojiLimit"], title: "Limită emoji", hint: "Prea multe emoji într-un singur mesaj.", kind: "message", severity: "thresholds", thresholds: EMOJI_LIMIT }),
      rule({ id: "capsLimit", path: ["autoMod", "capsLimit"], title: "Limită majuscule", hint: "Mesaje scrise în mare parte cu majuscule.", kind: "message", severity: "thresholds", thresholds: CAPS_LIMIT }),
      rule({ id: "repeatBlock", path: ["autoMod", "repeatBlock"], title: "Repetări de caractere și mesaje", hint: "Același caracter la rând sau același mesaj trimis de mai multe ori.", kind: "message", severity: "thresholds", thresholds: REPEAT_LIMIT }),
    ],
  },
  {
    id: "antispam",
    configKey: "antiSpam",
    route: "/anti-spam",
    title: "Anti-spam",
    short: "Anti-spam",
    description: "Limite separate pentru mesaje, editări, ștergeri, mențiuni și emoji.",
    switchLabel: "Activează anti-spam",
    rulesTitle: "Ce detectează",
    rules: [
      rule({ id: "message", path: ["antiSpam", "message"], title: "Spam de mesaje", hint: "Mesaje repetate într-o fereastră de timp.", kind: "message", severity: "slowmode", thresholds: MESSAGE_SPAM }),
      rule({ id: "edit", path: ["antiSpam", "edit"], title: "Spam de editări", hint: "Editări repetate într-o fereastră de timp.", kind: "message", severity: "none", thresholds: EDIT_SPAM }),
      rule({ id: "delete", path: ["antiSpam", "delete"], title: "Spam de ștergeri", hint: "Ștergeri repetate într-o fereastră de timp.", kind: "event", severity: "thresholds", thresholds: DELETE_SPAM }),
      rule({ id: "mention", path: ["antiSpam", "mention"], title: "Spam de mențiuni", hint: "Mențiuni într-un singur mesaj.", kind: "message", severity: "thresholds", thresholds: MENTION_LIMIT }),
      rule({ id: "emoji", path: ["antiSpam", "emoji"], title: "Spam de emoji", hint: "Numărul maxim de emoji într-un mesaj.", kind: "message", severity: "thresholds", thresholds: EMOJI_LIMIT }),
    ],
  },
  {
    id: "antiflood",
    configKey: "antiFlood",
    route: "/anti-flood",
    title: "Anti-flood",
    short: "Anti-flood",
    description: "Controlează mesajele foarte lungi, șirurile de caractere, majusculele și simbolurile în exces.",
    switchLabel: "Activează anti-flood",
    rulesTitle: "Ce detectează",
    rules: [
      rule({ id: "longMessage", path: ["antiFlood", "longMessage"], title: "Mesaj lung", hint: "Mesaje cu prea multe caractere.", kind: "message", severity: "thresholds", thresholds: FLOOD_LENGTH }),
      rule({ id: "character", path: ["antiFlood", "character"], title: "Șir de caractere", hint: "Același caracter repetat la rând.", kind: "message", severity: "thresholds", thresholds: FLOOD_RUN }),
      rule({ id: "caps", path: ["antiFlood", "caps"], title: "Majuscule excesive", hint: "Mesaje scrise în mare parte cu majuscule.", kind: "message", severity: "thresholds", thresholds: CAPS_LIMIT }),
      rule({ id: "symbol", path: ["antiFlood", "symbol"], title: "Șir de simboluri", hint: "Același simbol repetat la rând.", kind: "message", severity: "thresholds", thresholds: FLOOD_RUN }),
    ],
  },
  {
    id: "antiraid",
    configKey: "antiRaid",
    route: "/anti-raid",
    title: "Anti-raid",
    short: "Anti-raid",
    description: "Urmărește valurile de membri care intră și ține cont de vârsta conturilor noi.",
    switchLabel: "Activează anti-raid",
    rulesTitle: "Regula anti-raid",
    rules: [
      rule({ id: "rule", path: ["antiRaid", "rule"], title: "Regula de raid", hint: "Se aplică membrilor prinși în val și celor care intră cu un cont prea nou.", kind: "event", severity: "none", thresholds: RAID_LIMIT }),
    ],
  },
  {
    id: "suspect",
    configKey: "suspiciousBehavior",
    route: "/comportament-suspect",
    title: "Comportament suspect",
    short: "Comportament suspect",
    description: "Observă schimbările neobișnuite de nickname sau roluri, editările și ștergerile în masă, valurile de intrări și ieșiri.",
    switchLabel: "Activează detecția",
    rulesTitle: "Ce urmărește",
    rules: [
      rule({ id: "nicknameChanges", path: ["suspiciousBehavior", "nicknameChanges"], title: "Schimbări nickname", hint: "Nickname-uri schimbate prea des. Sancțiunea merge la cel care a făcut schimbarea, găsit în jurnalul de audit; fără el, botul doar alertează.", kind: "event", severity: "thresholds", thresholds: SUSPICIOUS_LIMIT }),
      rule({ id: "roleChanges", path: ["suspiciousBehavior", "roleChanges"], title: "Schimbări roluri", hint: "Roluri date sau scoase prea des. Sancțiunea merge la cel care a făcut schimbarea, găsit în jurnalul de audit; fără el, botul doar alertează.", kind: "event", severity: "thresholds", thresholds: SUSPICIOUS_LIMIT }),
      rule({ id: "massEdits", path: ["suspiciousBehavior", "massEdits"], title: "Editări în masă", hint: "Multe mesaje editate într-un timp scurt.", kind: "event", severity: "thresholds", thresholds: SUSPICIOUS_LIMIT }),
      rule({ id: "massDeletes", path: ["suspiciousBehavior", "massDeletes"], title: "Ștergeri în masă", hint: "Multe mesaje șterse într-un timp scurt. Sancțiunea merge doar la un autor verificat în jurnalul de audit; altfel botul doar alertează.", kind: "event", severity: "thresholds", thresholds: SUSPICIOUS_LIMIT }),
      rule({ id: "joinLeaveFlood", path: ["suspiciousBehavior", "joinLeaveFlood"], title: "Flux intrări / ieșiri", hint: "Doar alertă: intrările și ieșirile nu au un actor care poate fi sancționat automat.", kind: "event", severity: "thresholds", thresholds: SUSPICIOUS_LIMIT, onlyActions: ["alert"] }),
      rule({ id: "unusualActivity", path: ["suspiciousBehavior", "unusualActivity"], title: "Activitate neobișnuită", hint: "Combină incidentele detectate de celelalte reguli și schimbările de canale, roluri sau webhook-uri.", kind: "event", severity: "thresholds", thresholds: SUSPICIOUS_LIMIT }),
    ],
  },
];

export const MODULE_BY_ID: Record<ModuleId, ModuleDef> = Object.fromEntries(MODULES.map((module) => [module.id, module])) as Record<ModuleId, ModuleDef>;

/** The overview route of the group; it opens the first module. */
export const PROTECTION_ROUTE = "/protectie";

/** A route without its query, hash and trailing slash. */
export function cleanPath(path: string): string {
  return path.split("?")[0]!.split("#")[0]!.replace(/\/+$/, "") || "/";
}

/** Finds the module a route belongs to; "/protectie" and unknown paths open the first module. */
export function moduleForRoute(path: string): ModuleDef {
  const clean = cleanPath(path);
  return MODULES.find((module) => module.route === clean) ?? MODULES[0]!;
}

/** True for "/protectie" and the five module routes: they are one page with one draft. */
export function isProtectionRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === PROTECTION_ROUTE || MODULES.some((module) => module.route === clean);
}

/** The page of the AI judge. */
export const JUDGE_ROUTE = "/ai";

/** The overview route of the sanctions group and the routes of its four modules (one page, one draft). */
export const SANCTIONS_ROUTE = "/sanctiuni";
export const SANCTIONS_MODULE_ROUTES = {
  escalation: "/sanctiuni/escaladare",
  commands: "/sanctiuni/comenzi",
  policies: "/sanctiuni/roluri-canale",
  schedule: "/sanctiuni/program",
  appeals: "/sanctiuni/contestatii",
  evasion: "/sanctiuni/ocolire-ban",
} as const;

/** True for "/sanctiuni" and the routes of its modules. */
export function isSanctionsRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === SANCTIONS_ROUTE || Object.values(SANCTIONS_MODULE_ROUTES).some((route) => route === clean);
}

/** The overview route of the cases and logs group and the routes of its three modules. */
export const LOGS_ROUTE = "/jurnale";
export const LOGS_MODULE_ROUTES = {
  cases: "/jurnale/cazuri",
  audit: "/jurnale/audit",
  activity: "/jurnale/activitate",
} as const;

/** True for "/jurnale" and the routes of its modules. */
export function isLogsRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === LOGS_ROUTE || Object.values(LOGS_MODULE_ROUTES).some((route) => route === clean);
}

/** The overview route of the verification group and the routes of its three modules. */
export const VERIFICATION_ROUTE = "/verificare";
export const VERIFICATION_MODULE_ROUTES = {
  settings: "/verificare/setari",
  messages: "/verificare/mesaje",
  members: "/verificare/membri",
} as const;

/** True for "/verificare" and the routes of its modules. */
export function isVerificationRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === VERIFICATION_ROUTE || Object.values(VERIFICATION_MODULE_ROUTES).some((route) => route === clean);
}

/** The overview route of the tickets group and the routes of its five modules. */
export const TICKETS_ROUTE = "/tichete";
export const TICKETS_MODULE_ROUTES = {
  staff: "/tichete/aplicatii",
  partnership: "/tichete/parteneriate",
  help_report: "/tichete/ajutor",
  appeal: "/tichete/contestatii",
  common: "/tichete/setari",
} as const;

/** True for "/tichete" and the routes of its modules. */
export function isTicketsRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === TICKETS_ROUTE || Object.values(TICKETS_MODULE_ROUTES).some((route) => route === clean);
}

/** The overview route of the Oracle's group and the routes of its four modules. */
export const ORACLE_ROUTE = "/oracol";
export const ORACLE_MODULE_ROUTES = {
  status: "/oracol/pornire",
  chat: "/oracol/conversatie",
  style: "/oracol/ton",
  prophecy: "/oracol/profetii",
} as const;

export function isOracleRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === ORACLE_ROUTE || Object.values(ORACLE_MODULE_ROUTES).some((route) => route === clean);
}

/** The overview route of the bot settings group and the routes of its four modules. */
export const SETTINGS_ROUTE = "/setari";
export const SETTINGS_MODULE_ROUTES = {
  access: "/setari/acces",
  notices: "/setari/notificari",
  dm: "/setari/privat",
  welcome: "/setari/bun-venit",
} as const;

export function isSettingsRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === SETTINGS_ROUTE || Object.values(SETTINGS_MODULE_ROUTES).some((route) => route === clean);
}

/** The overview route of the bot control group and the routes of its five modules. */
export const CONTROL_ROUTE = "/control";
export const CONTROL_MODULE_ROUTES = {
  invites: "/control/invitatii",
  recruitment: "/control/recrutare",
  daily: "/control/raport",
  channels: "/control/canale",
  server: "/control/bot",
} as const;

export function isControlRoute(path: string): boolean {
  const clean = cleanPath(path);
  return clean === CONTROL_ROUTE || Object.values(CONTROL_MODULE_ROUTES).some((route) => route === clean);
}

/** The case list and the audit log: one page with two modules (their settings stay under /jurnale). */
export const RECORDS_ROUTE = "/cazuri";
export const RECORDS_MODULE_ROUTES = {
  cases: "/cazuri",
  audit: "/audit",
} as const;

export function isRecordsRoute(path: string): boolean {
  const clean = cleanPath(path);
  return Object.values(RECORDS_MODULE_ROUTES).some((route) => route === clean);
}

/** The game page and its modules. */
export const GAME_ROUTE = "/joc";
export const GAME_MODULE_ROUTES = {
  state: "/joc",
  channels: "/joc/canale",
  events: "/joc/evenimente",
  missions: "/joc/misiuni",
  economy: "/joc/economie",
  progress: "/joc/progres",
  seasons: "/joc/sezoane",
} as const;

export function isGameRoute(path: string): boolean {
  const clean = cleanPath(path);
  return Object.values(GAME_MODULE_ROUTES).some((route) => route === clean);
}

/** The message customization page and its modules. */
export const MESSAGES_ROUTE = "/config/mesaje";
export const MESSAGES_MODULE_ROUTES = {
  catalog: "/config/mesaje",
  logs: "/config/mesaje/jurnale",
  alliance: "/config/mesaje/alianta",
} as const;

export function isMessagesRoute(path: string): boolean {
  const clean = cleanPath(path);
  return Object.values(MESSAGES_MODULE_ROUTES).some((route) => route === clean);
}

/**
 * The group a route belongs to, for pages whose modules share one draft: moving
 * between the modules of a group must not reload the page. Null elsewhere.
 */
export function panelGroupRoute(path: string): string | null {
  if (isProtectionRoute(path)) return PROTECTION_ROUTE;
  if (isSanctionsRoute(path)) return SANCTIONS_ROUTE;
  if (isLogsRoute(path)) return LOGS_ROUTE;
  if (isVerificationRoute(path)) return VERIFICATION_ROUTE;
  if (isTicketsRoute(path)) return TICKETS_ROUTE;
  if (isOracleRoute(path)) return ORACLE_ROUTE;
  if (isSettingsRoute(path)) return SETTINGS_ROUTE;
  if (isControlRoute(path)) return CONTROL_ROUTE;
  if (isRecordsRoute(path)) return RECORDS_ROUTE;
  if (isMessagesRoute(path)) return MESSAGES_ROUTE;
  if (isGameRoute(path)) return GAME_ROUTE;
  return null;
}

/** Pages built with the panel, which use the whole width of the console column. */
export function isWidePanelRoute(path: string): boolean {
  // The overview ("/") and the commands page lay out their cards side by side too.
  return panelGroupRoute(path) !== null || [JUDGE_ROUTE, "/comenzi", "/"].includes(cleanPath(path));
}

/** What a module header needs: the module's key in the configuration and its texts. */
export type ModuleHeadDef = { id: string; configKey: string; title: string; description: string; switchLabel: string };

export function isModuleEnabled(config: any, module: { configKey: string }): boolean {
  return Boolean(config?.[module.configKey]?.enabled);
}

export function enabledRuleCount(config: any, module: ModuleDef): number {
  return module.rules.filter((def) => Boolean(getAt(config, def.path)?.enabled)).length;
}

/** on: the module runs; paused: it is on but the whole protection is off; off: it is off. */
export function moduleStatus(config: any, module: { configKey: string }): "on" | "paused" | "off" {
  if (!isModuleEnabled(config, module)) return "off";
  return config?.protection?.enabled === false ? "paused" : "on";
}

/** The second line of a module in the menu. */
export function moduleNavSummary(config: any, module: ModuleDef): string {
  const status = moduleStatus(config, module);
  if (status === "off") return "Oprit";
  if (status === "paused") return "Pornit, dar protecția e oprită";
  const on = enabledRuleCount(config, module);
  if (module.rules.length === 1) return on ? "Pornit, regula e activă" : "Pornit, regula e oprită";
  return `${on} din ${module.rules.length} reguli pornite`;
}

/** Short units for the line under a rule's title. */
const UNIT_BY_KEY: Record<string, string> = {
  emoji: "emoji", messages: "mesaje", windowMs: "s", seconds: "s", edits: "editări", deletes: "ștergeri", mentions: "mențiuni",
  capsPercent: "% majuscule", repeat: "caractere la rând", run: "caractere la rând", joins: "intrări", windowSeconds: "s",
  length: "caractere", changes: "evenimente",
};

/** The thresholds of a rule in a few words, e.g. "5 mesaje · 5 s". */
export function thresholdSummary(def: Pick<RuleDef, "thresholds">, rule: RuleLike | null | undefined): string {
  return thresholdFields(def.thresholds).map((field) => {
    const value = readThreshold(rule, field);
    if (value === undefined) return "";
    const unit = UNIT_BY_KEY[field.key];
    return unit ? `${value} ${unit}` : `${field.label}: ${value}`;
  }).filter(Boolean).join(" · ");
}

/** The line under a rule's title: its thresholds and what the bot does. */
export function ruleSummary(def: RuleDef, rule: RuleLike | null | undefined, moduleDefaults?: RuleLike | null): string {
  if (!rule?.enabled) return "Oprită";
  return [thresholdSummary(def, rule), actionsText(rule, def.kind, { only: def.onlyActions, moduleDefaults })].filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------------ */
/* What is saved, and the checks before saving                         */
/* ------------------------------------------------------------------ */

/**
 * The parts of the configuration this page edits. Only the parts that really
 * changed are sent, so a module edited somewhere else in the meantime is never
 * overwritten with the older values loaded here.
 */
export const PROTECTION_SECTIONS = [
  { key: "protection.enabled", label: "Protecția serverului" },
  { key: "autoMod", label: "AutoMod" },
  { key: "antiSpam", label: "Anti-spam" },
  { key: "antiFlood", label: "Anti-flood" },
  { key: "antiRaid", label: "Anti-raid" },
  { key: "suspiciousBehavior", label: "Comportament suspect" },
] as const;

/** A part of the configuration a page saves: a top-level key or a dotted path. */
export type DraftSection = { readonly key: string; readonly label: string };

/** The sections whose content differs between what is saved and the draft. */
export function changedSectionsOf<T extends DraftSection>(sections: readonly T[], saved: any, draft: any): T[] {
  if (!saved || !draft) return [];
  return sections.filter((section) => !deepEqual(getAt(saved, section.key.split(".")), getAt(draft, section.key.split("."))));
}

export function changedSections(saved: any, draft: any): Array<(typeof PROTECTION_SECTIONS)[number]> {
  return changedSectionsOf(PROTECTION_SECTIONS, saved, draft);
}

/** First problem that would make the server refuse the draft, worded for the person, or null. */
export function protectionDraftError(config: any, sections?: ReadonlyArray<string>): string | null {
  const rangeError = (name: string, label: string, min: number, max: number) =>
    `${name} — ${label}: introdu un număr întreg între ${min} și ${max}.`;
  // Only the sections about to be sent are checked: an old value in a module
  // nobody touched must not block saving another one.
  const checks = (key: string) => !sections || sections.includes(key);
  for (const module of MODULES) {
    if (!checks(module.configKey)) continue;
    for (const def of module.rules) {
      const current = getAt(config, def.path);
      if (!current) continue;
      for (const field of thresholdFields(def.thresholds)) {
        for (const key of field.groupKeys) {
          const value = current.thresholds?.[key];
          if (value !== undefined && !isValidInteger(value, field.min, field.max)) return rangeError(def.title, field.label, field.min, field.max);
        }
      }
      if (current.muteMinutes !== undefined && !isValidMuteMinutes(current.muteMinutes)) {
        return rangeError(def.title, "Durata mute-ului (minute)", MIN_MUTE_MINUTES, MAX_MUTE_MINUTES);
      }
    }
  }
  const suspicious = checks("suspiciousBehavior") ? config?.suspiciousBehavior : undefined;
  if (suspicious?.muteMinutes !== undefined && !isValidMuteMinutes(suspicious.muteMinutes)) {
    return rangeError("Comportament suspect", "Durata mute-ului (minute)", MIN_MUTE_MINUTES, MAX_MUTE_MINUTES);
  }
  const raid = checks("antiRaid") ? config?.antiRaid : undefined;
  if (raid && raid.joinsPerMinute !== undefined && !isValidInteger(raid.joinsPerMinute, 1, 10_000)) return rangeError("Anti-raid", "Intrări pe minut", 1, 10_000);
  if (raid && raid.accountAgeDays !== undefined && !isValidInteger(raid.accountAgeDays, 0, 3_650)) return rangeError("Anti-raid", "Vârsta minimă a contului", 0, 3_650);
  return null;
}

/* ------------------------------------------------------------------ */
/* Notes shown next to the ticks                                       */
/* ------------------------------------------------------------------ */

/**
 * The staff alert is posted in the module's log or alert channel and mentions
 * the staff roles from the permissions. Without either, ticking it does little;
 * say so instead of letting it look like it works.
 */
export function staffAlertProblems(config: any, channelId: string | null | undefined): string[] {
  const problems: string[] = [];
  // Without a channel of its own, a module posts in the audit channel when the audit log is on.
  const auditChannel = config?.audit?.enabled ? config?.audit?.channelId : null;
  if (!channelId && !auditChannel) {
    problems.push("Alege un canal de jurnal sau de alerte pentru modul (ori pornește jurnalul de audit); fără el, anunțul nu are unde să apară.");
  }
  const staffRoles = config?.permissions?.staffRoleIds;
  if (!Array.isArray(staffRoles) || staffRoles.length === 0) {
    problems.push("Nu ai ales roluri de staff în setările de permisiuni, așa că anunțul nu menționează pe nimeni.");
  }
  return problems;
}

/** Why a ticked action may not run, for rules whose module is off or whose global switch is off. */
export function pausedReason(config: any, module: { configKey: string }): string | null {
  if (!isModuleEnabled(config, module)) return null;
  if (config?.protection?.enabled === false) return "Protecția serverului este oprită, așa că modulul nu rulează.";
  return null;
}
