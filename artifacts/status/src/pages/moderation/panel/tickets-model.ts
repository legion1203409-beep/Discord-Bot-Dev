/**
 * Logica paginii Tichete, fără React: modulele grupului (cele patru fluxuri și
 * setările comune), întrebările unui flux, publicarea alianțelor, termenele
 * pentru tichetele neterminate, rezumatele din meniu și verificările de
 * dinainte de salvare.
 *
 * Ce scrie pagina este ce citește botul: api-server/src/bot/ticket-config.ts
 * (normalizeTicketConfig) și ticket-ui.ts. Botul pune panoul unui flux în orice
 * canal nou din categoria fluxului, cere întrebările pe rând, la final anunță
 * rolul staff-ului dacă fluxul o cere și șterge tichetele neterminate.
 */
import { TICKETS_MODULE_ROUTES, cleanPath, countLabel, deepEqual, getAt, isDiscordId, isValidInteger } from "./model";
import { isMessageImageUrl } from "./verification-model";

export { TICKETS_ROUTE, isTicketsRoute } from "./model";

/* ------------------------------------------------------------------ */
/* Modulele grupului                                                   */
/* ------------------------------------------------------------------ */

export type FlowKind = "staff" | "partnership" | "help_report" | "appeal";
export type TicketsModuleId = keyof typeof TICKETS_MODULE_ROUTES;
export const FLOW_KINDS: readonly FlowKind[] = ["staff", "partnership", "help_report", "appeal"];

export type TicketsModuleDef = {
  id: TicketsModuleId;
  route: string;
  short: string;
  title: string;
  description: string;
  /** What the module edits; a change in any of these marks it unsaved in the menu. */
  paths: readonly string[];
};

const ALLIANCE_PATHS = [
  "tickets.alliancePublicChannelId", "tickets.allianceOwnerGuildId", "tickets.allianceAnnouncementMode",
  "tickets.allianceAnnouncementImageUrl", "tickets.allianceAnnouncementThumbnailUrl", "tickets.allianceAnnouncementImageMode",
  "allianceRecruitmentText",
];
const COMMON_PATHS = ["tickets.staffReviewRoleId", "tickets.firstWarningMinutes", "tickets.secondWarningMinutes", "tickets.incompleteTimeoutMinutes"];
const flowPaths = (kind: FlowKind) => [`tickets.categories.${kind}`, `tickets.flows.${kind}`];

export const TICKETS_MODULES: readonly TicketsModuleDef[] = [
  {
    id: "staff", route: TICKETS_MODULE_ROUTES.staff, short: "Aplicații staff", title: "Aplicații de staff",
    description: "Cine vrea în echipă răspunde pe rând la întrebări, iar staff-ul primește răspunsurile în ticket.",
    paths: flowPaths("staff"),
  },
  {
    id: "partnership", route: TICKETS_MODULE_ROUTES.partnership, short: "Parteneriate", title: "Cereri de parteneriat",
    description: "Alt server propune o alianță; staff-ul o confirmă din ticket, iar botul o poate anunța public.",
    paths: [...flowPaths("partnership"), ...ALLIANCE_PATHS],
  },
  {
    id: "help_report", route: TICKETS_MODULE_ROUTES.help_report, short: "Ajutor și raportări", title: "Ajutor și raportări",
    description: "Membrii cer ajutor sau raportează pe cineva, cu detaliile de care are nevoie staff-ul.",
    paths: flowPaths("help_report"),
  },
  {
    id: "appeal", route: TICKETS_MODULE_ROUTES.appeal, short: "Contestații", title: "Contestații",
    description: "Un membru sancționat cere revizuirea unui caz; staff-ul acceptă, respinge sau cere clarificări din ticket.",
    paths: flowPaths("appeal"),
  },
  {
    id: "common", route: TICKETS_MODULE_ROUTES.common, short: "Setări comune", title: "Setări comune",
    description: "Rolul staff-ului care se ocupă de tichete și cât timp are un membru să termine formularul.",
    paths: COMMON_PATHS,
  },
];

export function ticketsModuleForRoute(path: string): TicketsModuleDef {
  const clean = cleanPath(path);
  return TICKETS_MODULES.find((module) => module.route === clean) ?? TICKETS_MODULES[0]!;
}

const changedPath = (saved: any, draft: any) => (path: string) => !deepEqual(getAt(saved, path.split(".")), getAt(draft, path.split(".")));

export function isTicketsModuleChanged(module: TicketsModuleDef, saved: any, draft: any): boolean {
  return module.paths.some(changedPath(saved, draft));
}

/** What the save bar lists as unsaved, one entry per module. */
export function changedTicketParts(saved: any, draft: any): Array<{ key: string; label: string }> {
  if (!saved || !draft) return [];
  return TICKETS_MODULES.filter((module) => isTicketsModuleChanged(module, saved, draft)).map((module) => ({ key: module.id, label: module.short }));
}

/* ------------------------------------------------------------------ */
/* Un flux                                                             */
/* ------------------------------------------------------------------ */

export type TicketQuestion = {
  key: string; label: string; description: string; placeholder: string; multiline: boolean; required: boolean;
  imageUrl?: string; thumbnailUrl?: string;
};

export type TicketFlow = {
  mode: "legacy" | "custom"; title: string; startButtonLabel: string; panelDescription: string; requirementsText: string;
  completionMessage: string; staffNotificationMessage: string; completionAction: "lock" | "notify_staff" | "keep_open";
  questions: TicketQuestion[]; postedQuestionKeys?: string[];
  panelImageUrl?: string; panelThumbnailUrl?: string; completionImageUrl?: string; completionThumbnailUrl?: string;
  staffNotificationImageUrl?: string; staffNotificationThumbnailUrl?: string;
};

export const FLOW_NAMES: Record<FlowKind, string> = {
  staff: "Aplicații staff", partnership: "Parteneriate", help_report: "Ajutor și raportări", appeal: "Contestații",
};

export const MAX_QUESTIONS = 20;
/** The appeal flow always starts with the case it contests (normalizeTicketConfig keeps it first). */
export const APPEAL_CASE_KEY = "case_id";

export function flowOf(config: any, kind: FlowKind): TicketFlow | undefined {
  return config?.tickets?.flows?.[kind];
}

export function categoryOf(config: any, kind: FlowKind): string {
  return String(config?.tickets?.categories?.[kind] ?? "");
}

/** A flow works only with a category: the bot answers in the channels opened in it. */
export function isFlowOn(config: any, kind: FlowKind): boolean {
  return Boolean(categoryOf(config, kind));
}

export function flowSummary(config: any, kind: FlowKind): string {
  if (!isFlowOn(config, kind)) return "Fără categorie";
  const count = flowOf(config, kind)?.questions?.length ?? 0;
  return countLabel(count, "întrebare", "întrebări");
}

/**
 * A changed flow uses its own texts and questions. Until its first change a
 * flow may still be "legacy" (the bot's built-in texts); the page edits it as
 * a custom one, as the bot then reads it.
 */
export function editFlow(flow: TicketFlow, change: Partial<TicketFlow>): TicketFlow {
  return { ...flow, ...change, mode: "custom" };
}

/** Whether the flow mentions the staff role when a form is finished (otherwise it only closes the form). */
export function notifiesStaff(flow: TicketFlow | undefined): boolean {
  return flow?.completionAction === "notify_staff";
}

/** A question key as the server accepts it: lowercase letters, digits and "_", at most 32. */
export function questionKey(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_]+/g, "_").slice(0, 32);
}

export function duplicateKeys(flow: TicketFlow | undefined): string[] {
  const counts = new Map<string, number>();
  for (const question of flow?.questions ?? []) counts.set(question.key, (counts.get(question.key) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([key]) => key);
}

export function isLockedQuestion(kind: FlowKind, question: TicketQuestion | undefined): boolean {
  return kind === "appeal" && question?.key === APPEAL_CASE_KEY;
}

const postedKeys = (flow: TicketFlow) => flow.postedQuestionKeys ?? flow.questions.map((question) => question.key);

export function addQuestion(flow: TicketFlow): TicketFlow {
  if (flow.questions.length >= MAX_QUESTIONS) return flow;
  const used = new Set(flow.questions.map((question) => question.key));
  let number = flow.questions.length + 1;
  while (used.has(`intrebare_${number}`)) number += 1;
  const question: TicketQuestion = {
    key: `intrebare_${number}`, label: "Întrebare nouă", description: "Scrie întrebarea la care răspunde membrul.",
    placeholder: "Scrie răspunsul tău...", multiline: true, required: true,
  };
  return editFlow(flow, { questions: [...flow.questions, question], postedQuestionKeys: [...postedKeys(flow), question.key] });
}

export function removeQuestion(kind: FlowKind, flow: TicketFlow, index: number): TicketFlow {
  const question = flow.questions[index];
  if (!question || flow.questions.length <= 1 || isLockedQuestion(kind, question)) return flow;
  return editFlow(flow, {
    questions: flow.questions.filter((_, position) => position !== index),
    postedQuestionKeys: postedKeys(flow).filter((key) => key !== question.key),
  });
}

export function moveQuestion(kind: FlowKind, flow: TicketFlow, index: number, step: -1 | 1): TicketFlow {
  const target = index + step;
  if (target < 0 || target >= flow.questions.length) return flow;
  if (isLockedQuestion(kind, flow.questions[index]) || isLockedQuestion(kind, flow.questions[target])) return flow;
  const questions = [...flow.questions];
  [questions[index], questions[target]] = [questions[target]!, questions[index]!];
  return editFlow(flow, { questions });
}

export function setQuestion(flow: TicketFlow, index: number, change: Partial<TicketQuestion>): TicketFlow {
  const before = flow.questions[index];
  if (!before) return flow;
  const next = { ...before, ...change };
  const questions = flow.questions.map((question, position) => position === index ? next : question);
  const posted = change.key !== undefined && change.key !== before.key
    ? postedKeys(flow).map((key) => key === before.key ? next.key : key)
    : flow.postedQuestionKeys;
  return editFlow(flow, { questions, ...(posted ? { postedQuestionKeys: posted } : {}) });
}

/* ------------------------------------------------------------------ */
/* Parteneriate                                                        */
/* ------------------------------------------------------------------ */

/** The answers the bot uses in the alliance summary and announcement, in this order (partnershipAnswersForCustomFlow). */
export const PARTNERSHIP_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["server_name", "numele serverului"], ["representative", "reprezentantul"], ["invite", "linkul serverului"],
  ["members", "membrii"], ["description", "descrierea"], ["motivation", "motivul alianței"],
  ["offer", "ce oferă"], ["terms", "condițiile"],
];

/**
 * Which alliance field each question fills: a field is filled by the question
 * with its key, else by the question in its position.
 */
export function partnershipFieldsByQuestion(flow: TicketFlow | undefined): string[][] {
  const questions = flow?.questions ?? [];
  const fields = questions.map(() => [] as string[]);
  PARTNERSHIP_FIELDS.forEach(([key, label], position) => {
    const byKey = questions.findIndex((question) => question.key === key);
    const index = byKey >= 0 ? byKey : position < questions.length ? position : -1;
    if (index >= 0) fields[index]!.push(label);
  });
  return fields;
}

/** Approved alliances are published only on the server named in the settings (ticket-ui: allianceOwnerGuildId). */
export function alliancePublishingOn(config: any, guildId: string | null | undefined): boolean {
  return Boolean(guildId) && config?.tickets?.allianceOwnerGuildId === guildId;
}

/* ------------------------------------------------------------------ */
/* Termene pentru tichetele neterminate                                */
/* ------------------------------------------------------------------ */

export const DEADLINES = [
  { key: "firstWarningMinutes", label: "Primul avertisment", min: 1, max: 180 },
  { key: "secondWarningMinutes", label: "Al doilea avertisment", min: 2, max: 239 },
  { key: "incompleteTimeoutMinutes", label: "Ștergerea ticketului", min: 10, max: 240 },
] as const;

export function deadlinesProblem(tickets: any): string | null {
  for (const deadline of DEADLINES) {
    if (!isValidInteger(tickets?.[deadline.key], deadline.min, deadline.max)) {
      return `${deadline.label}: un număr de minute între ${deadline.min} și ${deadline.max}.`;
    }
  }
  const { firstWarningMinutes: first, secondWarningMinutes: second, incompleteTimeoutMinutes: end } = tickets;
  if (first >= second) return "Primul avertisment trebuie să vină înaintea celui de-al doilea.";
  if (second >= end) return "Al doilea avertisment trebuie să vină înainte de ștergerea ticketului.";
  return null;
}

export function deadlinesSummary(config: any): string {
  const end = config?.tickets?.incompleteTimeoutMinutes;
  return isValidInteger(end, 10, 240) ? `Șterse după ${countLabel(end, "minut", "minute")}` : "Termene de verificat";
}

/* ------------------------------------------------------------------ */
/* Înainte de salvare                                                  */
/* ------------------------------------------------------------------ */

const FLOW_TEXTS: ReadonlyArray<readonly [keyof TicketFlow, string, number]> = [
  ["title", "Titlul panoului", 256], ["startButtonLabel", "Textul butonului", 80], ["panelDescription", "Descrierea panoului", 2_000],
  ["requirementsText", "Ghidul", 2_000], ["completionMessage", "Mesajul de final", 2_000], ["staffNotificationMessage", "Mesajul pentru staff", 2_000],
];
const FLOW_IMAGES: ReadonlyArray<keyof TicketFlow> = [
  "panelImageUrl", "panelThumbnailUrl", "completionImageUrl", "completionThumbnailUrl", "staffNotificationImageUrl", "staffNotificationThumbnailUrl",
];
const QUESTION_TEXTS: ReadonlyArray<readonly [keyof TicketQuestion, string, number]> = [
  ["label", "Întrebarea", 45], ["description", "Explicația", 900], ["placeholder", "Exemplul din câmp", 100],
];

function flowError(kind: FlowKind, flow: TicketFlow | undefined): string | null {
  const name = FLOW_NAMES[kind];
  if (!flow) return null;
  for (const [key, label, max] of FLOW_TEXTS) {
    const value = String(flow[key] ?? "").trim();
    if (!value) return `${name} — ${label} nu poate fi gol.`;
    if (value.length > max) return `${name} — ${label} are ${value.length} de caractere; cel mult ${max}.`;
  }
  for (const key of FLOW_IMAGES) {
    if (!isMessageImageUrl(String(flow[key] ?? "").trim())) return `${name} — o imagine nu e un link HTTPS sau o imagine încărcată.`;
  }
  if (!flow.questions.length) return `${name} — Formularul are nevoie de cel puțin o întrebare.`;
  if (flow.questions.length > MAX_QUESTIONS) return `${name} — Cel mult ${MAX_QUESTIONS} de întrebări.`;
  for (const [index, question] of flow.questions.entries()) {
    const where = `${name} — Întrebarea ${index + 1}`;
    if (!/^[a-z0-9_]{1,32}$/.test(question.key)) return `${where}: cheia poate avea doar litere mici, cifre și „_”.`;
    for (const [key, label, max] of QUESTION_TEXTS) {
      const value = String(question[key] ?? "").trim();
      if (!value) return `${where}: ${label.toLocaleLowerCase("ro")} nu poate fi goală.`;
      if (value.length > max) return `${where}: ${label.toLocaleLowerCase("ro")} are ${value.length} de caractere; cel mult ${max}.`;
    }
    if (!isMessageImageUrl(String(question.imageUrl ?? "").trim()) || !isMessageImageUrl(String(question.thumbnailUrl ?? "").trim())) {
      return `${where}: o imagine nu e un link HTTPS sau o imagine încărcată.`;
    }
  }
  const duplicates = duplicateKeys(flow);
  if (duplicates.length) return `${name} — Aceeași cheie apare de mai multe ori: ${duplicates.join(", ")}.`;
  return null;
}

/** The first problem that would make the server refuse the tickets, or null. */
export function ticketsDraftError(config: any): string | null {
  const tickets = config?.tickets;
  if (!tickets) return null;
  if (!isDiscordId(String(tickets.staffReviewRoleId ?? ""))) return "Setări comune — Alege rolul staff-ului care se ocupă de tichete.";
  for (const kind of FLOW_KINDS) {
    const category = categoryOf(config, kind);
    if (category && !isDiscordId(category)) return `${FLOW_NAMES[kind]} — Categoria: „${category}” nu este un ID Discord.`;
  }
  const publicChannel = String(tickets.alliancePublicChannelId ?? "");
  if (publicChannel && !isDiscordId(publicChannel)) return `Parteneriate — Canalul alianțelor: „${publicChannel}” nu este un ID Discord.`;
  for (const key of ["allianceAnnouncementImageUrl", "allianceAnnouncementThumbnailUrl"]) {
    if (!isMessageImageUrl(String(tickets[key] ?? "").trim())) return "Parteneriate — o imagine a anunțului nu e un link HTTPS sau o imagine încărcată.";
  }
  if (String(config.allianceRecruitmentText ?? "").trim().length > 2_000) return "Parteneriate — Textul de recrutare are cel mult 2000 de caractere.";
  for (const kind of FLOW_KINDS) {
    const problem = flowError(kind, flowOf(config, kind));
    if (problem) return problem;
  }
  const deadlines = deadlinesProblem(tickets);
  return deadlines ? `Setări comune — ${deadlines}` : null;
}
