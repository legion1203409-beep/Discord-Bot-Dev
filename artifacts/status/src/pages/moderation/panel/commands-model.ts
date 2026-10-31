/**
 * Logica paginii Comenzi (/comenzi), fără React: comenzile pe care staff-ul
 * le poate da din panou, ce cere fiecare, verificarea înainte de trimitere,
 * ce se trimite botului și propoziția de confirmare.
 *
 * Botul primește acțiunea la POST /guilds/:id/actions (api-server
 * moderation/router.ts, actionSchema) și o aplică prin
 * bot/moderation/engine.ts, cu aceleași reguli ca în Discord: comenzile
 * oprite la Sancțiuni → Comenzi sunt refuzate, iar contul tău are nevoie de
 * permisiunea comenzii sau de un rol ales acolo.
 */
import type { IconName } from "./fields";
import { cleanPath, countLabel, isDiscordId } from "./model";
import { STAFF_COMMANDS, isCommandOn, type CommandKey } from "./sanctions-model";
import { parseMemberQuery } from "./records-model";

export const COMMANDS_ROUTE = "/comenzi";

export function isCommandsRoute(path: string): boolean {
  return cleanPath(path) === COMMANDS_ROUTE;
}

type Needs = "member" | "channel";
type Extra = "duration" | "nickname" | "role" | "purge" | "slowmode" | null;

export type PanelCommand = {
  key: CommandKey;
  group: "sanctions" | "members" | "channels";
  label: string;
  /** What it does, in a sentence (the same as on the Sanctions page). */
  description: string;
  /** The Discord permission it needs, unless a role chosen at Sanctions → Comenzi allows it. */
  permission: string;
  icon: IconName;
  tone: "ban" | "kick" | "mute" | "warn" | "msg" | "chan" | "info";
  needs: Needs;
  extra: Extra;
  /** Hard to undo: the confirmation button is red. */
  danger: boolean;
};

const DETAILS: Record<CommandKey, Omit<PanelCommand, "key" | "group" | "description" | "permission">> = {
  warn: { label: "Avertisment", icon: "alert", tone: "warn", needs: "member", extra: null, danger: false },
  mute: { label: "Timeout", icon: "mute", tone: "mute", needs: "member", extra: "duration", danger: false },
  unmute: { label: "Scoate timeout-ul", icon: "check", tone: "info", needs: "member", extra: null, danger: false },
  kick: { label: "Eliminare", icon: "leave", tone: "kick", needs: "member", extra: null, danger: true },
  ban: { label: "Interdicție", icon: "ban", tone: "ban", needs: "member", extra: null, danger: true },
  nick: { label: "Schimbă porecla", icon: "tag", tone: "info", needs: "member", extra: "nickname", danger: false },
  role: { label: "Dă un rol", icon: "users", tone: "info", needs: "member", extra: "role", danger: false },
  purge: { label: "Șterge mesaje", icon: "trash", tone: "msg", needs: "channel", extra: "purge", danger: true },
  slowmode: { label: "Slowmode", icon: "clock", tone: "chan", needs: "channel", extra: "slowmode", danger: false },
  lock: { label: "Blochează canalul", icon: "lock", tone: "chan", needs: "channel", extra: null, danger: false },
  unlock: { label: "Deblochează canalul", icon: "lock", tone: "info", needs: "channel", extra: null, danger: false },
};

export const PANEL_COMMANDS: readonly PanelCommand[] = STAFF_COMMANDS.map((command) => ({
  key: command.key, group: command.group, description: command.description, permission: command.permission, ...DETAILS[command.key],
}));

export const COMMAND_GROUP_LABELS: Record<PanelCommand["group"], string> = {
  sanctions: "Sancțiuni", members: "Membri", channels: "Canale și mesaje",
};

export function panelCommand(key: string | null | undefined): PanelCommand {
  return PANEL_COMMANDS.find((command) => command.key === key) ?? PANEL_COMMANDS[0]!;
}

/** Why a command would be refused before it reaches Discord, as the bot says it; null when it can be given. */
export function commandBlock(config: any, key: CommandKey): string | null {
  if (!config) return null;
  if (!config.manualTools?.enabled) return "Comenzile staff-ului sunt oprite pe acest server.";
  if (!isCommandOn(config, key)) return `Comanda /${key} e oprită pentru toți.`;
  return null;
}

export function availableCommands(config: any): number {
  return PANEL_COMMANDS.filter((command) => !commandBlock(config, command.key)).length;
}

/* ------------------------------------------------------------------ */
/* Durate                                                              */
/* ------------------------------------------------------------------ */

export const MAX_TIMEOUT_MINUTES = 40_320;
export const MAX_SLOWMODE_SECONDS = 21_600;

export const TIMEOUT_PRESETS: ReadonlyArray<readonly [number, string]> = [
  [10, "10 min"], [60, "1 oră"], [360, "6 ore"], [1_440, "1 zi"], [10_080, "7 zile"], [40_320, "28 de zile"],
];
export const SLOWMODE_PRESETS: ReadonlyArray<readonly [number, string]> = [
  [0, "Oprit"], [5, "5 s"], [30, "30 s"], [60, "1 min"], [300, "5 min"], [3_600, "1 oră"],
];
export const PURGE_PRESETS: readonly number[] = [10, 25, 50, 100];

/** "1 oră", "2 zile și 3 ore", "45 de minute". */
export function minutesText(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  const parts = [
    days ? countLabel(days, "zi", "zile") : null,
    hours ? countLabel(hours, "oră", "ore") : null,
    rest ? countLabel(rest, "minut", "minute") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} și ${parts.at(-1)}` : parts[0] ?? "";
}

export function secondsText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds === 0) return "fără pauză";
  if (seconds < 60) return countLabel(seconds, "secundă", "secunde");
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const text = minutesText(minutes);
  return rest ? `${text} și ${countLabel(rest, "secundă", "secunde")}` : text;
}

/* ------------------------------------------------------------------ */
/* Formularul                                                          */
/* ------------------------------------------------------------------ */

export type CommandForm = {
  type: CommandKey;
  /** What was typed for the member: an ID, a mention or a profile link. */
  member: string;
  channelId: string;
  roleId: string;
  /** Give the role to every member who can get it (role only). */
  allMembers: boolean;
  durationMinutes: number | undefined;
  nickname: string;
  /** Messages to delete (purge) or seconds between messages (slowmode). */
  amount: number | undefined;
  reason: string;
};

export function emptyCommandForm(type: CommandKey = "warn"): CommandForm {
  return { type, member: "", channelId: "", roleId: "", allMembers: false, durationMinutes: 60, nickname: "", amount: undefined, reason: "" };
}

/** The member's ID from what was typed, or null. */
export function formMemberId(form: Pick<CommandForm, "member">): string | null {
  return parseMemberQuery(form.member).id;
}

function inRange(value: number | undefined, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** The first thing missing or wrong in the form, as a sentence; null when it can be sent. */
export function commandProblem(form: CommandForm): string | null {
  const command = panelCommand(form.type);
  const bulk = command.key === "role" && form.allMembers;
  if (command.needs === "member" && !bulk) {
    if (!form.member.trim()) return "Scrie membrul: ID-ul, o mențiune <@…> sau linkul profilului.";
    const parsed = parseMemberQuery(form.member);
    if (parsed.error) return parsed.error;
  }
  if (command.needs === "channel" && !isDiscordId(form.channelId)) return "Alege canalul.";
  switch (command.extra) {
    case "duration":
      if (!inRange(form.durationMinutes, 1, MAX_TIMEOUT_MINUTES)) return "Durata timeout-ului e între 1 minut și 28 de zile.";
      break;
    case "nickname": {
      const nickname = form.nickname.trim();
      if (!nickname) return "Scrie porecla nouă.";
      if (nickname.length > 32) return "Porecla are cel mult 32 de caractere.";
      break;
    }
    case "role":
      if (!isDiscordId(form.roleId)) return "Alege rolul.";
      break;
    case "purge":
      if (!inRange(form.amount, 1, 100)) return "Poți șterge între 1 și 100 de mesaje odată.";
      break;
    case "slowmode":
      if (!inRange(form.amount, 0, MAX_SLOWMODE_SECONDS)) return "Pauza e între 0 (oprit) și 21.600 de secunde (6 ore).";
      break;
  }
  if (form.reason.trim().length > 500) return "Motivul are cel mult 500 de caractere.";
  return null;
}

/** What the bot receives for the form, with only the fields the command uses. */
export function commandPayload(form: CommandForm): Record<string, unknown> {
  const command = panelCommand(form.type);
  const payload: Record<string, unknown> = { type: command.key };
  const bulk = command.key === "role" && form.allMembers;
  if (command.needs === "member" && !bulk) payload.targetId = formMemberId(form);
  if (bulk) payload.allMembers = true;
  if (command.needs === "channel") payload.channelId = form.channelId;
  if (command.extra === "duration") payload.durationMinutes = form.durationMinutes;
  if (command.extra === "nickname") payload.nickname = form.nickname.trim();
  if (command.extra === "role") payload.roleId = form.roleId;
  if (command.extra === "purge" || command.extra === "slowmode") payload.amount = form.amount;
  const reason = form.reason.trim();
  if (reason) payload.reason = reason;
  return payload;
}

/** The confirmation's sentence: what will happen, to whom. */
export function commandSentence(form: CommandForm, names: { member?: string | null; channel?: string | null; role?: string | null } = {}): string {
  const command = panelCommand(form.type);
  const member = names.member ?? formMemberId(form) ?? "membru";
  const channel = names.channel ?? (form.channelId ? `canalul ${form.channelId}` : "canal");
  const role = names.role ?? (form.roleId ? `rolul ${form.roleId}` : "rol");
  switch (command.key) {
    case "warn": return `${member} primește un avertisment.`;
    case "mute": return `${member} primește timeout pentru ${minutesText(form.durationMinutes ?? 0)}.`;
    case "unmute": return `${member} nu mai are timeout.`;
    case "kick": return `${member} e scos de pe server. Poate reveni cu o invitație.`;
    case "ban": return `${member} primește interdicție pe server.`;
    case "nick": return `${member} se va numi „${form.nickname.trim()}” pe server.`;
    case "role": return form.allMembers ? `Toți membrii care pot primi ${role} îl primesc.` : `${member} primește ${role}.`;
    case "purge": return `Se șterg ultimele ${countLabel(form.amount ?? 0, "mesaj", "mesaje")} din ${channel}.`;
    case "slowmode": return form.amount === 0 ? `${channel} nu mai are slowmode.` : `În ${channel} se poate scrie o dată la ${secondsText(form.amount ?? 0)}.`;
    case "lock": return `Nimeni în afară de staff nu mai poate scrie în ${channel}.`;
    case "unlock": return `${channel} se redeschide, exact cum era înainte de blocare.`;
  }
}

/** A refused action's message, in plain words when the bot says the action waits to be checked. */
export function actionErrorText(status: number | null, message: string): { text: string; toAudit: boolean } {
  if (status === 409 || /reconciliation/i.test(message)) {
    return { text: "Botul nu știe sigur dacă Discord a aplicat acțiunea. O verifici și o confirmi în Jurnalul de audit, la „De verificat”, înainte să o dai din nou.", toAudit: true };
  }
  if (status === 403) return { text: "Nu ai acces la comenzi pe acest server. Accesul se dă la Setări bot → Acces staff.", toAudit: false };
  return { text: message || "Acțiunea nu a putut fi trimisă.", toAudit: false };
}
