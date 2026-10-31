/**
 * Logica paginii Cazuri și audit, fără React: modulele, felurile de acțiuni,
 * de unde vine un caz, contestațiile, căutarea după membru, datele relative,
 * gruparea pe zile a jurnalului de audit și acțiunile de verificat.
 *
 * Ce citește pagina vine din api-server/src/moderation: store.listCases (cu
 * appealStatus), countCases, getLatestAppeal, listAudit, listActions și
 * people.ts (numele membrilor). Setările cazurilor și ale auditului rămân la
 * /jurnale.
 */
import type { IconName } from "./fields";
import { RECORDS_MODULE_ROUTES, cleanPath, countLabel, isDiscordId } from "./model";
import { AUDIT_EVENT_CATEGORIES, getAuditEventCategory, type AuditEventCategory, type ModerationAuditLog } from "../../../lib/moderation-audit";

export { RECORDS_ROUTE, isRecordsRoute } from "./model";

/* ------------------------------------------------------------------ */
/* Modulele                                                            */
/* ------------------------------------------------------------------ */

export type RecordsModuleId = keyof typeof RECORDS_MODULE_ROUTES;

export const RECORDS_MODULES: ReadonlyArray<{ id: RecordsModuleId; route: string; short: string; title: string; description: string; icon: IconName }> = [
  {
    id: "cases", route: RECORDS_MODULE_ROUTES.cases, short: "Cazuri", title: "Cazuri", icon: "gavel",
    description: "Fiecare sancțiune, cu motivul, dovezile, notele staff-ului și contestația. Le închizi, le redeschizi și le adaugi note.",
  },
  {
    id: "audit", route: RECORDS_MODULE_ROUTES.audit, short: "Jurnal de audit", title: "Jurnal de audit", icon: "scroll",
    description: "Tot ce s-a întâmplat pe server și în panou, pe zile: setări schimbate, acțiuni, alerte, membri, canale și roluri.",
  },
];

export function recordsModuleForRoute(path: string) {
  const clean = cleanPath(path);
  return RECORDS_MODULES.find((module) => module.route === clean) ?? RECORDS_MODULES[0]!;
}

/* ------------------------------------------------------------------ */
/* Cazurile                                                            */
/* ------------------------------------------------------------------ */

export type CaseStatus = "open" | "closed";
export type AppealStatus = "pending" | "accepted" | "rejected";

export type ModerationCase = {
  id: string;
  subjectId: string;
  actorId: string | null;
  actionType: string;
  reason: string | null;
  evidence: unknown[];
  status: CaseStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string | null;
  closedBy?: string | null;
  appealStatus?: AppealStatus | null;
};

export type CaseNote = { id?: string; authorId: string; body: string; createdAt: string };
export type CaseAppeal = {
  status: AppealStatus; appellantId: string; channelId: string; createdAt: string;
  decidedAt: string | null; decidedBy: string | null; decisionNote: string | null;
  /** "web" for an appeal made on the site (its channelId is then "web:<id>"); a ticket otherwise. */
  source?: "ticket" | "web"; body?: string | null;
  clarification?: { id: string; question: string } | null;
};
export type CaseDetails = ModerationCase & { notes?: CaseNote[]; appeal?: CaseAppeal | null };

type ActionKind = { label: string; icon: IconName; tone: "ban" | "kick" | "mute" | "warn" | "msg" | "chan" | "info"; subject: "member" | "channel" };

/** Every action the bot can record; the label is what a list shows. */
export const ACTION_KINDS: Record<string, ActionKind> = {
  warn: { label: "Avertisment", icon: "alert", tone: "warn", subject: "member" },
  mute: { label: "Timeout", icon: "mute", tone: "mute", subject: "member" },
  unmute: { label: "Timeout ridicat", icon: "check", tone: "info", subject: "member" },
  kick: { label: "Eliminare", icon: "leave", tone: "kick", subject: "member" },
  ban: { label: "Interdicție", icon: "ban", tone: "ban", subject: "member" },
  delete: { label: "Mesaj șters", icon: "msgx", tone: "msg", subject: "member" },
  purge: { label: "Mesaje șterse", icon: "trash", tone: "msg", subject: "channel" },
  slowmode: { label: "Slowmode", icon: "clock", tone: "chan", subject: "channel" },
  lock: { label: "Canal blocat", icon: "lock", tone: "chan", subject: "channel" },
  unlock: { label: "Canal deblocat", icon: "lock", tone: "info", subject: "channel" },
  nick: { label: "Poreclă schimbată", icon: "tag", tone: "info", subject: "member" },
  role: { label: "Rol schimbat", icon: "users", tone: "info", subject: "member" },
};

export function actionKind(type: string): ActionKind {
  return ACTION_KINDS[type] ?? { label: type ? type.charAt(0).toUpperCase() + type.slice(1) : "Acțiune", icon: "gavel", tone: "info", subject: "member" };
}

export const CASE_STATUS_FILTERS = [["open", "Deschise"], ["closed", "Închise"], ["all", "Toate"]] as const;
export type CaseStatusFilter = (typeof CASE_STATUS_FILTERS)[number][0];

export const CASE_ACTION_FILTERS: ReadonlyArray<readonly [string, string]> = [
  ["all", "Toate acțiunile"],
  ...Object.entries(ACTION_KINDS).map(([key, kind]) => [key, kind.label] as const),
];

export const CASE_PAGE_SIZE = 25;

/** Who gave the sanction, from the case's record: staff, AutoMod or the anti-raid. */
export function caseSource(item: Pick<ModerationCase, "metadata">): { automatic: boolean; label: string } {
  const source = item.metadata?.source;
  if (source === "automod") return { automatic: true, label: "moderarea automată" };
  if (source === "raid") return { automatic: true, label: "anti-raid" };
  return { automatic: false, label: "staff" };
}

/** A sanction Discord did not confirm, as the case's record says; null when it was applied. */
export function caseOutcome(item: Pick<ModerationCase, "metadata">): { label: string; text: string } | null {
  const outcome = item.metadata?.outcome;
  if (outcome === "failed") return { label: "Neaplicată", text: "Discord nu a aplicat acțiunea. Cazul rămâne ca dovadă a încercării." };
  if (outcome === "pending" || outcome === "uncertain") {
    return { label: "Neconfirmată", text: "Nu se știe sigur dacă Discord a aplicat acțiunea. O confirmi în Jurnalul de audit, la „De verificat”." };
  }
  return null;
}

export const APPEAL_LABELS: Record<AppealStatus, string> = {
  pending: "Contestație deschisă",
  accepted: "Contestație acceptată",
  rejected: "Contestație respinsă",
};

/**
 * A member typed in the search: an ID, a mention (<@id>) or a profile link. Empty
 * text means no filter; anything else that is not an ID gives an error.
 */
export function parseMemberQuery(text: string): { id: string | null; error: string | null } {
  const value = text.trim();
  if (!value) return { id: null, error: null };
  const match = value.match(/^<@!?(\d{5,25})>$/) ?? value.match(/discord(?:app)?\.com\/users\/(\d{5,25})/) ?? value.match(/^(\d{5,25})$/);
  if (match && isDiscordId(match[1]!)) return { id: match[1]!, error: null };
  return { id: null, error: "Scrie ID-ul membrului (cifre), o mențiune <@…> sau linkul profilului. Clic dreapta pe membru în Discord → Copiază ID-ul." };
}

/** The link that opens a message in Discord. */
export function messageLink(guildId: string, channelId?: unknown, messageId?: unknown): string | null {
  if (typeof channelId !== "string" || !isDiscordId(channelId)) return null;
  if (typeof messageId === "string" && isDiscordId(messageId)) return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

const EVIDENCE_KINDS: Record<string, string> = {
  spam: "spam", flood: "flood", "edit-spam": "editări repetate", link: "link", invite: "invitație", word: "cuvânt interzis",
  caps: "majuscule", mention: "mențiuni", mentions: "mențiuni", emoji: "emoji", attachment: "atașament", ai: "moderarea AI",
  scam: "înșelătorie", raid: "raid",
};

export type EvidenceView = { kind: string | null; text: string | null; link: string | null; linkLabel: string; url: string | null };

/** A piece of evidence as the case sheet shows it. */
export function evidenceView(guildId: string, value: unknown): EvidenceView {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const kind = typeof item.kind === "string" && item.kind.trim()
    ? EVIDENCE_KINDS[item.kind] ?? item.kind.replace(/[-_]+/g, " ")
    : null;
  const link = messageLink(guildId, item.channelId, item.messageId);
  const url = typeof item.url === "string" && /^https:\/\//.test(item.url) ? item.url : null;
  return {
    kind,
    text: typeof item.description === "string" && item.description.trim() ? item.description.trim() : null,
    link,
    linkLabel: typeof item.messageId === "string" ? "Deschide mesajul în Discord" : "Deschide canalul în Discord",
    url,
  };
}

/** The IDs of people a case list shows: members who were sanctioned, and staff who did it. */
export function casePeopleIds(items: ReadonlyArray<Pick<ModerationCase, "subjectId" | "actorId" | "actionType" | "closedBy">>): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (actionKind(item.actionType).subject === "member" && isDiscordId(item.subjectId)) ids.add(item.subjectId);
    if (item.actorId && isDiscordId(item.actorId)) ids.add(item.actorId);
    if (item.closedBy && isDiscordId(item.closedBy)) ids.add(item.closedBy);
  }
  return [...ids];
}

/** The menu's line for the case list. */
export function casesSummary(counts: { open: number; closed: number } | undefined): string {
  if (!counts) return "sancțiunile date";
  if (!counts.open) return counts.closed ? "niciunul deschis" : "niciun caz încă";
  return `${countLabel(counts.open, "deschis", "deschise")}`;
}

/* ------------------------------------------------------------------ */
/* Date                                                                */
/* ------------------------------------------------------------------ */

const TIME = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" });
const SHORT_DATE = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short" });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", year: "numeric" });
const LONG_DATE = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long" });
const LONG_DATE_YEAR = new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const FULL = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(date: Date, now: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - start) / 86_400_000);
}

/** "acum 5 min", "acum 3 h", "ieri, 14:30", "12 oct.", for lists. */
export function relativeTime(value: string | Date, now = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45 && seconds > -60) return "chiar acum";
  if (seconds < 3_600 && seconds > 0) return `acum ${Math.max(1, Math.round(seconds / 60))} min`;
  const days = daysBetween(date, now);
  if (days === 0) return `azi, ${TIME.format(date)}`;
  if (days === 1) return `ieri, ${TIME.format(date)}`;
  return date.getFullYear() === now.getFullYear() ? SHORT_DATE.format(date) : SHORT_DATE_YEAR.format(date);
}

/** "29 octombrie 2026, 14:30", for the case sheet. */
export function fullTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? FULL.format(date) : "";
}

export function clockTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? TIME.format(date) : "";
}

/* ------------------------------------------------------------------ */
/* Jurnalul de audit                                                   */
/* ------------------------------------------------------------------ */

export const AUDIT_CATEGORY_ICONS: Record<AuditEventCategory, IconName> = {
  messages: "message", members: "users", channels: "hash", roles: "tag", voice: "mega", moderation: "gavel", security: "shield", other: "info",
};

export const AUDIT_CATEGORY_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["all", "Toate categoriile"],
  ...AUDIT_EVENT_CATEGORIES.map((option) => [option.value, option.label] as const),
];

export type AuditDay<T> = { key: string; label: string; items: T[] };

/** The events of a page, by local day: "Azi", "Ieri", then the date. */
export function groupAuditByDay<T extends { createdAt: string }>(events: readonly T[], now = new Date()): AuditDay<T>[] {
  const days: AuditDay<T>[] = [];
  for (const event of events) {
    const date = new Date(event.createdAt);
    const valid = Number.isFinite(date.getTime());
    const key = valid ? localDayKey(date) : "unknown";
    let day = days.find((item) => item.key === key);
    if (!day) {
      const diff = valid ? daysBetween(date, now) : null;
      const label = diff === null ? "Fără dată"
        : diff === 0 ? "Azi"
          : diff === 1 ? "Ieri"
            : (date.getFullYear() === now.getFullYear() ? LONG_DATE : LONG_DATE_YEAR).format(date);
      day = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
      days.push(day);
    }
    day.items.push(event);
  }
  return days;
}

export function auditCategory(event: Pick<ModerationAuditLog, "eventType">): AuditEventCategory {
  return getAuditEventCategory(event.eventType || "unknown");
}

/** The people an audit page mentions, when the event is about a member. */
export function auditPeopleIds(events: ReadonlyArray<Pick<ModerationAuditLog, "actorId" | "targetId" | "targetType">>): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.actorId && isDiscordId(event.actorId)) ids.add(event.actorId);
    if (event.targetId && isDiscordId(event.targetId) && ["member", "user"].includes(event.targetType ?? "")) ids.add(event.targetId);
  }
  return [...ids];
}

const HIDDEN_DETAIL_KEYS = new Set(["actorVerified", "actorId"]);

/** The event's raw details as short lines, for the "Detalii" disclosure. */
export function auditDetailLines(detail: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!detail) return [];
  return Object.entries(detail)
    .filter(([key, value]) => !HIDDEN_DETAIL_KEYS.has(key) && value !== null && value !== undefined && value !== "")
    .slice(0, 20)
    .map(([key, value]) => {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return [key, text.length > 300 ? `${text.slice(0, 300)}…` : text] as [string, string];
    });
}

/* ------------------------------------------------------------------ */
/* Acțiuni de verificat                                                */
/* ------------------------------------------------------------------ */

export type LedgerAction = {
  id: string; status: "pending" | "uncertain" | "applied" | "failed"; actionType: string; actorId: string;
  input?: Record<string, unknown>; error?: string | null; createdAt: string;
};

/** What an unconfirmed action wanted to do, in a sentence. */
export function ledgerSummary(action: LedgerAction): { title: string; reason: string | null; targetId: string | null; channelId: string | null } {
  const input = action.input ?? {};
  const kind = actionKind(String(input.type ?? action.actionType));
  const minutes = typeof input.durationMinutes === "number" ? input.durationMinutes : null;
  const duration = kind.tone === "mute" && minutes
    ? minutes >= 1_440 ? ` de ${countLabel(Math.round(minutes / 1_440), "zi", "zile")}` : minutes >= 60 ? ` de ${countLabel(Math.round(minutes / 60), "oră", "ore")}` : ` de ${countLabel(minutes, "minut", "minute")}`
    : "";
  return {
    title: `${kind.label}${duration}`,
    reason: typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : null,
    targetId: typeof input.targetId === "string" && isDiscordId(input.targetId) ? input.targetId : null,
    channelId: typeof input.channelId === "string" && isDiscordId(input.channelId) ? input.channelId : null,
  };
}
