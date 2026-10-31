/**
 * Logica paginii Personalizare mesaje, fără React: modulele (catalogul tuturor
 * mesajelor botului, textele jurnalelor de activitate, anunțul alianței),
 * citirea și scrierea șabloanelor, previzualizarea și verificările dinainte
 * de salvare.
 *
 * Jurnalele scriu în config.activityLog.templates (setările de moderare; la
 * intrare și plecare și în câmpurile vechi memberJoin… și memberLeave…, pe care
 * botul le citește încă). Anunțul alianței e în setările botului:
 * tickets.allianceAnnouncementTemplate.
 */
import {
  ACTIVITY_LOG_GROUPS, ACTIVITY_LOG_TEMPLATES, ACTIVITY_LOG_VARIABLES, renderActivityLogText,
  type ActivityLogGroup, type ActivityLogTextTemplate,
} from "../../../../../api-server/src/moderation/activity-log-template-definitions";
import { MESSAGES_MODULE_ROUTES, MESSAGES_ROUTE, cleanPath, deepEqual, isMessagesRoute } from "./model";
import { appealSettings } from "./sanctions-model";
import { dmOf, memberMessagesOf } from "./settings-model";

export { MESSAGES_MODULE_ROUTES, MESSAGES_ROUTE, isMessagesRoute };

export type MessagesModuleId = keyof typeof MESSAGES_MODULE_ROUTES;

export const MESSAGES_MODULES: ReadonlyArray<{ id: MessagesModuleId; route: string; short: string; title: string; description: string; source: "config" | "bot" | "none" }> = [
  {
    id: "catalog", route: MESSAGES_MODULE_ROUTES.catalog, short: "Toate mesajele", title: "Toate mesajele botului", source: "none",
    description: "Fiecare mesaj pe care îl trimite botul și unde îl schimbi. Cele mai multe stau lângă setările lor; aici sunt doar cele care nu au alt loc.",
  },
  {
    id: "logs", route: MESSAGES_MODULE_ROUTES.logs, short: "Jurnale de activitate", title: "Textele jurnalelor de activitate", source: "config",
    description: "Titlul și descrierea fiecărui jurnal postat de bot (mesaje editate, membri, canale, roluri, voce, moderare, securitate). Canalele și ce se înregistrează rămân la Cazuri și jurnale.",
  },
  {
    id: "alliance", route: MESSAGES_MODULE_ROUTES.alliance, short: "Anunțul alianței", title: "Anunțul public al alianței", source: "bot",
    description: "Ce postează botul când staff-ul apasă „Publică pactul” la o cerere de parteneriat. Canalul, forma și imaginile sunt la Tichete → Parteneriate.",
  },
];

export function messagesModuleForRoute(path: string) {
  const clean = cleanPath(path);
  return MESSAGES_MODULES.find((module) => module.route === clean) ?? MESSAGES_MODULES[0]!;
}

/* ------------------------------------------------------------------ */
/* Catalogul                                                           */
/* ------------------------------------------------------------------ */

export type CatalogEntry = { id: string; group: string; title: string; text: string; href: string; place: string; on: boolean | null };

/** Every message the bot sends, where it is edited, and whether it is on (null when unknown). */
export function messageCatalog(config: any, bot: any): CatalogEntry[] {
  const members = bot ? memberMessagesOf(bot) : null;
  const activityOn = config ? config.activityLog?.enabled === true : null;
  return [
    { id: "notices", group: "Moderare", title: "Notificările de moderare", text: "Mesajul din canalul de moderare la fiecare sancțiune.", href: "/setari/notificari", place: "Setări bot → Notificări", on: config ? config.embeds?.enabled !== false : null },
    { id: "dm", group: "Moderare", title: "Mesajul privat la sancțiune", text: "Ce primește membrul în privat la avertisment, mute, kick sau ban.", href: "/setari/privat", place: "Setări bot → Mesaje în privat", on: config ? dmOf(config).enabled : null },
    { id: "appeal", group: "Moderare", title: "Contestația acceptată", text: "Mesajul privat cu linkul serverului, după o contestație acceptată.", href: "/sanctiuni/contestatii", place: "Sancțiuni → Contestații", on: config ? appealSettings(config).enabled && appealSettings(config).dmOnAccept : null },
    { id: "logs", group: "Moderare", title: "Jurnalele de activitate", text: "Titlul și descrierea fiecărui jurnal: mesaje, membri, canale, roluri, voce, securitate.", href: MESSAGES_MODULE_ROUTES.logs, place: "Aici", on: activityOn },
    { id: "welcome", group: "Membri", title: "Bun venit", text: "Mesajul din canal când intră cineva.", href: "/setari/bun-venit", place: "Setări bot → Bun venit și plecare", on: members ? members.welcomeEnabled : null },
    { id: "leave", group: "Membri", title: "Plecare", text: "Mesajul din canal când pleacă cineva.", href: "/setari/bun-venit", place: "Setări bot → Bun venit și plecare", on: members ? members.leaveEnabled : null },
    { id: "verification", group: "Membri", title: "Verificarea", text: "Panoul cu butonul de verificare și răspunsurile lui.", href: "/verificare/mesaje", place: "Verificare → Mesaje", on: null },
    { id: "daily", group: "Rapoarte", title: "Raportul zilnic", text: "Titlul, textele și etichetele raportului zilnic.", href: "/control/raport", place: "Control bot → Raport zilnic", on: bot ? bot.dailyStats?.enabled === true : null },
    { id: "tickets", group: "Tichete", title: "Tichetele", text: "Panoul de tichete, întrebările formularelor și mesajele pentru staff.", href: "/tichete", place: "Tichete", on: null },
    { id: "alliance", group: "Tichete", title: "Anunțul alianței", text: "Postarea publică a unui parteneriat aprobat.", href: MESSAGES_MODULE_ROUTES.alliance, place: "Aici", on: null },
    { id: "oracle", group: "Oracolul", title: "Răspunsurile Oracolului", text: "Tonul, limba și cum vorbește Oracolul în conversații.", href: "/oracol/ton", place: "Oracolul → Ton", on: null },
  ];
}

/* ------------------------------------------------------------------ */
/* Jurnale                                                             */
/* ------------------------------------------------------------------ */

export const MAX_LOG_TITLE = 256;
export const MAX_LOG_DESCRIPTION = 2_000;

export type LogEntry = (typeof ACTIVITY_LOG_TEMPLATES)[number];

const MEMBER_VARIABLES = ["member", "member_name", "username", "account_created_at", "account_created_at_relative", "account_age", "account_age_years", "account_age_days", "server_joined_at", "server_joined_at_relative", "timestamp", "timestamp_relative"];

function memberKind(key: string): "join" | "leave" | null {
  return key === "member_join" ? "join" : key === "member_leave" ? "leave" : null;
}

export function logGroups(): Array<{ group: ActivityLogGroup; label: string; entries: LogEntry[] }> {
  return (Object.entries(ACTIVITY_LOG_GROUPS) as Array<[ActivityLogGroup, string]>).map(([group, label]) => ({
    group, label, entries: ACTIVITY_LOG_TEMPLATES.filter((entry) => entry.group === group),
  }));
}

/** The text the bot uses for one log; joins and leaves still fall back to their older fields. */
export function logTemplate(config: any, key: string): ActivityLogTextTemplate {
  const saved = config?.activityLog?.templates?.[key];
  if (saved) return { title: String(saved.title ?? ""), description: String(saved.description ?? "") };
  const kind = memberKind(key);
  if (!kind) return { title: "", description: "" };
  const prefix = kind === "join" ? "memberJoin" : "memberLeave";
  return { title: String(config?.activityLog?.[`${prefix}TitleTemplate`] ?? ""), description: String(config?.activityLog?.[`${prefix}DescriptionTemplate`] ?? "") };
}

/** A new activityLog section with one log's text changed (and, for joins and leaves, the older fields too). */
export function withLogTemplate(activityLog: any, key: string, template: ActivityLogTextTemplate): any {
  const next = { ...(activityLog ?? {}), templates: { ...(activityLog?.templates ?? {}), [key]: template } };
  const kind = memberKind(key);
  if (kind) {
    const prefix = kind === "join" ? "memberJoin" : "memberLeave";
    next[`${prefix}TitleTemplate`] = template.title;
    next[`${prefix}DescriptionTemplate`] = template.description;
  }
  return next;
}

export function isCustomLog(template: ActivityLogTextTemplate): boolean {
  return Boolean(template.title.trim() || template.description.trim());
}

export function customLogCount(config: any): number {
  return ACTIVITY_LOG_TEMPLATES.filter((entry) => isCustomLog(logTemplate(config, entry.key))).length;
}

export function logVariables(entry: { key: string; group: ActivityLogGroup }): string[] {
  const kind = memberKind(entry.key);
  if (kind) return [...MEMBER_VARIABLES, ...(kind === "leave" ? ["server_left_at", "server_left_at_relative", "server_duration"] : [])];
  return [...ACTIVITY_LOG_VARIABLES.common, ...ACTIVITY_LOG_VARIABLES[entry.group]];
}

const PREVIEW_VALUES: Record<string, string> = {
  guild: "Regatul Cenușii", member: "@Adina", member_name: "Adina pe server", username: "adina",
  moderator: "@Moderator", channel: "#general", target: "@Adina", action: "mute", reason: "Spam",
  timestamp: "5 octombrie 2026, 14:00", timestamp_relative: "acum",
  details: "Detaliile primite de la Discord.", before: "Textul de dinainte", after: "Textul nou", content: "Textul mesajului", count: "3",
  name: "comunitate", changes: "Nume: vechi → nou", roles_added: "Membru", roles_removed: "Vizitator",
  old_channel: "Lobby", new_channel: "General", old_nickname: "Adina", new_nickname: "Adina pe server",
  duration: "10 minute", error: "Permisiuni insuficiente",
  account_created_at: "12 martie 2024", account_created_at_relative: "acum 2 ani", account_age: "2 ani, 7 luni", account_age_years: "2", account_age_days: "963",
  server_joined_at: "1 octombrie 2026", server_joined_at_relative: "acum 4 zile", server_left_at: "5 octombrie 2026", server_left_at_relative: "acum", server_duration: "4 zile",
};

/** What the log would look like, with example values; an empty field shows the bot's default. */
export function previewLog(entry: { key: string; event: string; group: ActivityLogGroup; title: string }, template: ActivityLogTextTemplate): { title: string; description: string } {
  const kind = memberKind(entry.key);
  const fallbackDescription = kind === "join" ? "Un membru nou s-a alăturat serverului." : kind === "leave" ? "Membrul a părăsit serverul." : "{details}";
  const values = { ...PREVIEW_VALUES, event: entry.event, category: ACTIVITY_LOG_GROUPS[entry.group], title: entry.title };
  return {
    title: renderActivityLogText(template.title.trim() || entry.title, values),
    description: renderActivityLogText(template.description.trim() || fallbackDescription, values),
  };
}

/* ------------------------------------------------------------------ */
/* Anunțul alianței                                                    */
/* ------------------------------------------------------------------ */

export const MAX_ALLIANCE = 2_000;

export const DEFAULT_ALLIANCE = [
  "🤝 PACTUL CELOR DOUĂ REGATE", "══════════════════════════", "",
  "🏰 Comunitatea parteneră: {server_name}", "", "📝 Descrierea serverului:", "{description}", "",
  "👥 Membri: {members_total} total · {members_online} online", "🔗 Link: {invite}", "",
  "👤 Contract completat de: {applicant_mention}", "", "Pact pecetluit · Regatul Cenușii",
].join("\n");

export const ALLIANCE_VARIABLES = [
  "server_name", "description", "invite", "representative", "members_total", "members_online", "members",
  "motivation", "offer", "terms", "applicant", "applicant_mention", "timestamp", "timestamp_relative", "date", "time", "year",
];

const ALLIANCE_PREVIEW: Record<string, string> = {
  server_name: "Taverna Dragonului", description: "O comunitate de jocuri și povești.", invite: "discord.gg/taverna",
  representative: "@Mihai", members_total: "1.240", members_online: "312", members: "1.240", motivation: "Evenimente comune.",
  offer: "Un canal de parteneri.", terms: "Anunțuri reciproce lunare.", applicant: "Mihai", applicant_mention: "@Mihai",
  timestamp: "5 octombrie 2026, 14:00", timestamp_relative: "acum", date: "5 octombrie 2026", time: "14:00", year: "2026",
};

export function allianceTemplateOf(bot: any): string {
  const value = bot?.tickets?.allianceAnnouncementTemplate;
  return typeof value === "string" && value.trim() ? value : DEFAULT_ALLIANCE;
}

export function previewAlliance(text: string): string {
  return renderActivityLogText(text, ALLIANCE_PREVIEW);
}

/** Inserts {variable} where the cursor is, within the length limit. */
export function insertVariable(text: string, variable: string, at: number | null, max: number): { text: string; cursor: number } {
  const token = `{${variable}}`;
  const position = at === null || at < 0 || at > text.length ? text.length : at;
  const next = `${text.slice(0, position)}${token}${text.slice(position)}`;
  if (next.length > max) return { text, cursor: position };
  return { text: next, cursor: position + token.length };
}

/* ------------------------------------------------------------------ */
/* Salvare                                                             */
/* ------------------------------------------------------------------ */

/**
 * One section per log (and the older join and leave fields), so saving sends only
 * the texts that changed: a channel or another text changed meanwhile stays as it is.
 */
export const MESSAGES_SECTIONS: ReadonlyArray<{ key: string; label: string }> = [
  ...ACTIVITY_LOG_TEMPLATES.map((entry) => ({ key: `activityLog.templates.${entry.key}`, label: `Jurnal: ${entry.title}` })),
  ...["memberJoinTitleTemplate", "memberJoinDescriptionTemplate", "memberLeaveTitleTemplate", "memberLeaveDescriptionTemplate"]
    .map((field) => {
      const entry = ACTIVITY_LOG_TEMPLATES.find((item) => item.key === (field.startsWith("memberJoin") ? "member_join" : "member_leave"))!;
      return { key: `activityLog.${field}`, label: `Jurnal: ${entry.title}` };
    }),
];

export function changedAllianceParts(saved: any, draft: any): Array<{ key: string; label: string }> {
  return deepEqual(saved?.tickets?.allianceAnnouncementTemplate, draft?.tickets?.allianceAnnouncementTemplate)
    ? []
    : [{ key: "alliance", label: "Anunțul alianței" }];
}

export function messagesDraftError(config: any): string | null {
  for (const entry of ACTIVITY_LOG_TEMPLATES) {
    const template = logTemplate(config, entry.key);
    if (template.title.length > MAX_LOG_TITLE) return `Jurnale — „${entry.title}”: titlul are cel mult ${MAX_LOG_TITLE} de caractere.`;
    if (template.description.length > MAX_LOG_DESCRIPTION) return `Jurnale — „${entry.title}”: descrierea are cel mult ${MAX_LOG_DESCRIPTION} de caractere.`;
  }
  return null;
}

export function allianceDraftError(bot: any): string | null {
  const text = bot?.tickets?.allianceAnnouncementTemplate;
  if (typeof text !== "string") return null;
  if (text.length > MAX_ALLIANCE) return `Anunțul alianței are cel mult ${MAX_ALLIANCE} de caractere.`;
  return null;
}
