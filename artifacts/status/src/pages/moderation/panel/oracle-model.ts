/**
 * Logica paginii Oracol, fără React: modulele grupului (Pornire, Conversație,
 * Ton și lungime, Profeții), setările citite cu valorile implicite, rezumatele
 * din meniu, ora următoarei profeții a zilei și verificările de dinainte de
 * salvare.
 *
 * Ce scrie pagina este ce citește botul: api-server/src/bot/oracle-settings.ts
 * (normalizeOracleSettings). Comutatorul general e același cu /stopai și
 * /startai; mesajul pentru Oracolul oprit stă în gameplayConfig.messages.
 */
import type { OracleSettings } from "../../../hooks/use-moderation-api";
import { ORACLE_MODULE_ROUTES, cleanPath, countLabel, deepEqual, getAt, isDiscordId, isValidInteger } from "./model";
import { isMessageImageUrl } from "./verification-model";

export { ORACLE_ROUTE, isOracleRoute } from "./model";
export type { OracleSettings };

export type OracleTone = OracleSettings["chat"]["tone"];
export type OracleLength = OracleSettings["chat"]["length"];

export const MAX_ORACLE_CHANNELS = 50;
export const MAX_COOLDOWN_SECONDS = 3_600;
export const MAX_DAILY_LIMIT = 50;
export const MAX_PAUSED_MESSAGE = 2_000;

/** The bot's defaults (DEFAULT_ORACLE_SETTINGS): a server that never chose keeps the previous behaviour. */
export const DEFAULT_ORACLE: OracleSettings = {
  enabled: true,
  chat: { channelIds: [], replyToReplies: true, tone: "implicit", length: "mediu", cooldownSeconds: 12 },
  prophecy: { commandEnabled: true, dailyLimit: 10, daily: { enabled: false, channelId: "", hour: 9, timeZone: "Europe/Bucharest" } },
};

export const DEFAULT_PAUSED_MESSAGE = "🛑 Oracle AI este oprit momentan. Un administrator îl poate reporni cu `/startai`.";

/** The Oracle's settings in a config, with the defaults for what is missing (an older server sends none). */
export function oracleOf(config: any): OracleSettings {
  const raw = config?.oracle ?? {};
  const chat = raw.chat ?? {};
  const prophecy = raw.prophecy ?? {};
  return {
    enabled: raw.enabled ?? DEFAULT_ORACLE.enabled,
    chat: { ...DEFAULT_ORACLE.chat, ...chat, channelIds: Array.isArray(chat.channelIds) ? chat.channelIds : [] },
    prophecy: {
      ...DEFAULT_ORACLE.prophecy, ...prophecy,
      daily: { ...DEFAULT_ORACLE.prophecy.daily, ...(prophecy.daily ?? {}) },
    },
  };
}

/** The whole settings with one value changed, for the draft's `oracle`. */
export function withOracle(config: any, path: readonly string[], value: unknown): OracleSettings {
  const next: any = structuredClone(oracleOf(config));
  let target = next;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path[path.length - 1]!] = value;
  return next;
}

/* ------------------------------------------------------------------ */
/* Modulele grupului                                                   */
/* ------------------------------------------------------------------ */

export type OracleModuleId = keyof typeof ORACLE_MODULE_ROUTES;

export type OracleModuleDef = {
  id: OracleModuleId;
  route: string;
  short: string;
  title: string;
  description: string;
  /** What the module edits; a change in any of these marks it unsaved in the menu. */
  paths: readonly string[];
};

const PAUSED_PATHS = ["gameplayConfig.messages.oraclePaused", "gameplayConfig.messages.oraclePausedImageUrl", "gameplayConfig.messages.oraclePausedThumbnailUrl"];

export const ORACLE_MODULES: readonly OracleModuleDef[] = [
  {
    id: "status", route: ORACLE_MODULE_ROUTES.status, short: "Pornire", title: "Pornirea Oracolului",
    description: "Comutatorul general al Oracolului pe server, același cu /stopai și /startai, și ce răspunde cât timp e oprit.",
    paths: ["oracle.enabled", ...PAUSED_PATHS],
  },
  {
    id: "chat", route: ORACLE_MODULE_ROUTES.chat, short: "Conversație", title: "Conversație",
    description: "Unde răspunde Oracolul când e menționat, dacă răspunde și la reply-uri și cât așteaptă un membru între două răspunsuri.",
    paths: ["oracle.chat.channelIds", "oracle.chat.replyToReplies", "oracle.chat.cooldownSeconds"],
  },
  {
    id: "style", route: ORACLE_MODULE_ROUTES.style, short: "Ton și lungime", title: "Ton și lungime",
    description: "Cum sună răspunsurile Oracolului în chat: tonul și cât de lungi sunt.",
    paths: ["oracle.chat.tone", "oracle.chat.length"],
  },
  {
    id: "prophecy", route: ORACLE_MODULE_ROUTES.prophecy, short: "Profeții", title: "Profeții",
    description: "Profețiile personale cerute cu /profetie și profeția zilei, trimisă pentru tot serverul la ora aleasă.",
    paths: ["oracle.prophecy"],
  },
];

export function oracleModuleForRoute(path: string): OracleModuleDef {
  const clean = cleanPath(path);
  return ORACLE_MODULES.find((module) => module.route === clean) ?? ORACLE_MODULES[0]!;
}

/** A value of the config; the Oracle's settings are read with their defaults, so an older server is not "changed". */
function valueAt(config: any, path: string): unknown {
  const parts = path.split(".");
  return parts[0] === "oracle" ? getAt(oracleOf(config), parts.slice(1)) : getAt(config, parts);
}

export function isOracleModuleChanged(module: OracleModuleDef, saved: any, draft: any): boolean {
  return module.paths.some((path) => !deepEqual(valueAt(saved, path), valueAt(draft, path)));
}

export function changedOracleParts(saved: any, draft: any): Array<{ key: string; label: string }> {
  if (!saved || !draft) return [];
  return ORACLE_MODULES.filter((module) => isOracleModuleChanged(module, saved, draft)).map((module) => ({ key: module.id, label: module.short }));
}

/* ------------------------------------------------------------------ */
/* Ton și lungime                                                      */
/* ------------------------------------------------------------------ */

export const TONES: ReadonlyArray<{ id: OracleTone; label: string; text: string }> = [
  { id: "implicit", label: "Ca de obicei", text: "Vocea lui obișnuită: arhaic, solemn și poetic. Tonul se schimbă după starea lui de spirit (calm, iritat, extatic…)." },
  { id: "mistic", label: "Mistic", text: "Solemn, ca un oracol vechi, cu imagini de cenușă, foc și destin, dar fără să devină neclar." },
  { id: "prietenos", label: "Prietenos", text: "Cald, ca un aliat apropiat: încurajează și explică simplu." },
  { id: "sobru", label: "Sobru", text: "La obiect, fără glume și fără podoabe, dar tot în personaj." },
  { id: "jucaus", label: "Jucăuș", text: "Ironic, cu umor medieval blând; nu jignește pe nimeni." },
];

export const LENGTHS: ReadonlyArray<{ id: OracleLength; label: string; text: string; sentences: number }> = [
  { id: "scurt", label: "Scurt", text: "O propoziție, cel mult două.", sentences: 1 },
  { id: "mediu", label: "Mediu", text: "Lungimea obișnuită: câteva propoziții.", sentences: 3 },
  { id: "lung", label: "Lung", text: "Când întrebarea o cere, un paragraf întreg, de cinci până la opt propoziții.", sentences: 6 },
];

export const toneLabel = (tone: OracleTone) => TONES.find((item) => item.id === tone)?.label ?? TONES[0]!.label;
export const lengthLabel = (length: OracleLength) => LENGTHS.find((item) => item.id === length)?.label ?? "Mediu";

/** The example question of the preview and, for each tone, an answer written by hand (the real answers are the AI's). */
export const SAMPLE_QUESTION = "Cum pot să ajung în staff?";
const SAMPLE_ANSWERS: Record<OracleTone, readonly string[]> = {
  implicit: [
    "Călătorule, drumul spre straja Regatului începe cu un formular în tichete.",
    "Deschide „Aplicații staff” și răspunde fără grabă la fiecare întrebare.",
    "Străjerii citesc tot ce scrii, deci fii sincer și limpede.",
    "Cenușa ține minte cine a fost de folos celorlalți.",
    "Arată-te răbdător în chat și ajută-i pe cei noi.",
    "Iar când vine răspunsul, primește-l cu fruntea sus, oricare ar fi.",
  ],
  mistic: [
    "Văd o cărare de jar care duce spre straja Regatului: se deschide în tichete.",
    "Alege „Aplicații staff” și lasă-ți răspunsurile să ardă limpede.",
    "Străjerii vor cântări fiecare cuvânt la lumina focului.",
    "Destinul îi alege pe cei care veghează și când nu-i privește nimeni.",
    "Fii o flacără blândă pentru cei abia sosiți.",
    "Iar cenușa va șopti numele tău la sfat.",
  ],
  prietenos: [
    "Super că vrei să ajuți! Primul pas e un tichet de „Aplicații staff”.",
    "Completezi câteva întrebări, pe rând, în ritmul tău.",
    "Echipa citește tot și îți răspunde direct în tichet.",
    "Până atunci, cel mai mult contează să fii activ și de ajutor.",
    "Dacă te încurci la ceva, întreabă fără grijă.",
    "Îți țin pumnii!",
  ],
  sobru: [
    "Deschide un tichet „Aplicații staff” și completează formularul.",
    "Răspunde la toate întrebările obligatorii.",
    "Staff-ul analizează aplicația și îți răspunde în tichet.",
    "Contează activitatea și comportamentul tău pe server.",
    "Nu deschide mai multe aplicații în același timp.",
    "Decizia se comunică tot în tichet.",
  ],
  jucaus: [
    "Vrei armură de străjer? Mai întâi, hârtiile: un tichet de „Aplicații staff”.",
    "Da, chiar și eroii completează formulare.",
    "Răspunde frumos, fiindcă străjerii citesc tot, chiar și greșelile de tipar.",
    "Un pic de ajutor dat celor noi valorează mai mult decât zece dragoni învinși.",
    "Și nu mitui juriul cu Oboli; am încercat eu.",
    "Mult noroc, viitorule străjer!",
  ],
};

/** The example answer for a tone, cut to the chosen length. */
export function sampleAnswer(tone: OracleTone, length: OracleLength): string {
  const sentences = LENGTHS.find((item) => item.id === length)?.sentences ?? 3;
  return (SAMPLE_ANSWERS[tone] ?? SAMPLE_ANSWERS.implicit).slice(0, sentences).join(" ");
}

/* ------------------------------------------------------------------ */
/* Conversație                                                         */
/* ------------------------------------------------------------------ */

type ChannelLike = { id: string; name: string; type: number | string; parentId?: string | null };

const CATEGORY_TYPES = new Set(["4", "GuildCategory", "category"]);
const CHAT_CHANNEL_NOTES = new Map<string, string | undefined>([
  ["0", undefined], ["GuildText", undefined], ["text", undefined],
  ["5", "anunțuri"], ["GuildAnnouncement", "anunțuri"], ["announcement", "anunțuri"],
  ["15", "forum"], ["GuildForum", "forum"],
  ["2", "voce"], ["GuildVoice", "voce"], ["13", "scenă"], ["GuildStageVoice", "scenă"],
]);

/** Where the Oracle can be limited to: categories first, then the channels that hold messages, by name. */
export function oracleChannelOptions(channels: ChannelLike[] | undefined): Array<{ id: string; name: string; note?: string }> | undefined {
  if (!channels) return undefined;
  const byName = (a: ChannelLike, b: ChannelLike) => a.name.localeCompare(b.name, "ro");
  const categories = channels.filter((channel) => CATEGORY_TYPES.has(String(channel.type))).sort(byName);
  const rest = channels.filter((channel) => CHAT_CHANNEL_NOTES.has(String(channel.type))).sort(byName);
  return [
    ...categories.map((channel) => ({ id: channel.id, name: channel.name, note: "categorie" })),
    ...rest.map((channel) => ({ id: channel.id, name: channel.name, note: CHAT_CHANNEL_NOTES.get(String(channel.type)) })),
  ];
}

export function isCategory(channels: ChannelLike[] | undefined, id: string): boolean {
  return Boolean(channels?.some((channel) => channel.id === id && CATEGORY_TYPES.has(String(channel.type))));
}

export function cooldownText(seconds: number): string {
  if (!seconds) return "fără pauză";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

export function whereSummary(oracle: OracleSettings): string {
  const count = oracle.chat.channelIds.length;
  return count ? `în ${countLabel(count, "loc ales", "locuri alese")}` : "în toate canalele";
}

/* ------------------------------------------------------------------ */
/* Profeții                                                            */
/* ------------------------------------------------------------------ */

/** The time zones offered: the value, its name in the list and its clock in a sentence ("la 20:00, ora Londrei"). */
export const TIME_ZONES: ReadonlyArray<readonly [string, string, string]> = [
  ["Europe/Bucharest", "România (București)", "ora României"],
  ["Europe/Chisinau", "Moldova (Chișinău)", "ora Moldovei"],
  ["Europe/London", "Marea Britanie (Londra)", "ora Londrei"],
  ["Europe/Paris", "Franța (Paris)", "ora Parisului"],
  ["Europe/Berlin", "Germania (Berlin)", "ora Berlinului"],
  ["Europe/Madrid", "Spania (Madrid)", "ora Madridului"],
  ["Europe/Rome", "Italia (Roma)", "ora Romei"],
  ["UTC", "UTC", "ora UTC"],
  ["America/New_York", "SUA, coasta de est", "ora New York-ului"],
  ["America/Los_Angeles", "SUA, coasta de vest", "ora Los Angeles-ului"],
];

export function timeZoneClock(zone: string): string {
  return TIME_ZONES.find(([id]) => id === zone)?.[2] ?? `ora din ${zone}`;
}

export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("ro-RO", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const hourText = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function localHour(at: Date, zone: string): number {
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(at);
  return Number(text);
}

/**
 * When the next prophecy of the day goes out: the first full hour from now
 * that is the chosen hour in the chosen time zone. The bot checks every
 * minute, so the prophecy goes out in the first minute of that hour.
 */
export function nextDailyProphecy(daily: OracleSettings["prophecy"]["daily"], now = new Date()): Date | null {
  if (!isValidTimeZone(daily.timeZone) || !isValidInteger(daily.hour, 0, 23)) return null;
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  for (let step = 1; step <= 49; step += 1) {
    const at = new Date(start.getTime() + step * 3_600_000);
    if (localHour(at, daily.timeZone) === daily.hour) return at;
  }
  return null;
}

/** The chosen hour is the current one: a prophecy not yet sent today goes out within a minute. */
export function isDailyHourNow(daily: OracleSettings["prophecy"]["daily"], now = new Date()): boolean {
  return isValidTimeZone(daily.timeZone) && localHour(now, daily.timeZone) === daily.hour;
}

/** "azi", "mâine" or the weekday of a moment, in a time zone, seen from now. */
export function dayWord(at: Date, now: Date, zone: string): string {
  const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const today = day(now);
  const target = day(at);
  if (target === today) return "azi";
  if (target === day(new Date(now.getTime() + 86_400_000))) return "mâine";
  return new Intl.DateTimeFormat("ro-RO", { timeZone: zone, weekday: "long" }).format(at);
}

export function prophecySummary(oracle: OracleSettings): string {
  const { commandEnabled, dailyLimit, daily } = oracle.prophecy;
  const parts = [
    commandEnabled ? `/profetie · ${dailyLimit} pe zi` : null,
    daily.enabled ? `zilnic la ${hourText(daily.hour)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "oprite";
}

/* ------------------------------------------------------------------ */
/* Meniul și salvarea                                                   */
/* ------------------------------------------------------------------ */

export function oracleModuleSummary(config: any, id: OracleModuleId): string {
  const oracle = oracleOf(config);
  switch (id) {
    case "status": return oracle.enabled ? "pornit pe server" : "oprit pe server";
    case "chat": return `${whereSummary(oracle)} · ${cooldownText(oracle.chat.cooldownSeconds)}`;
    case "style": return `${toneLabel(oracle.chat.tone)} · ${lengthLabel(oracle.chat.length).toLowerCase()}`;
    case "prophecy": return prophecySummary(oracle);
  }
}

/** The menu's light: the module works on the server right now. */
export function isOracleModuleOn(config: any, id: OracleModuleId): boolean {
  const oracle = oracleOf(config);
  if (!oracle.enabled) return false;
  return id === "prophecy" ? oracle.prophecy.commandEnabled || oracle.prophecy.daily.enabled : true;
}

/** First problem that would make the server refuse the draft, or null. */
export function oracleDraftError(config: any): string | null {
  const messages = config?.gameplayConfig?.messages;
  if (messages) {
    const paused = String(messages.oraclePaused ?? "").trim();
    if (!paused) return "Pornire — Scrie mesajul pentru când Oracolul e oprit.";
    if (paused.length > MAX_PAUSED_MESSAGE) return `Pornire — Mesajul pentru Oracolul oprit are cel mult ${MAX_PAUSED_MESSAGE} de caractere.`;
    for (const key of ["oraclePausedImageUrl", "oraclePausedThumbnailUrl"]) {
      if (!isMessageImageUrl(String(messages[key] ?? "").trim())) return "Pornire — o imagine a mesajului nu e un link HTTPS sau o imagine încărcată.";
    }
  }
  const oracle = oracleOf(config);
  const bad = oracle.chat.channelIds.find((id) => !isDiscordId(String(id)));
  if (bad !== undefined) return `Conversație — „${bad}” nu este un ID Discord.`;
  if (oracle.chat.channelIds.length > MAX_ORACLE_CHANNELS) return `Conversație — Poți alege cel mult ${MAX_ORACLE_CHANNELS} de canale.`;
  if (!isValidInteger(oracle.chat.cooldownSeconds, 0, MAX_COOLDOWN_SECONDS)) return `Conversație — Pauza e un număr întreg de secunde, între 0 și ${MAX_COOLDOWN_SECONDS}.`;
  if (!TONES.some((tone) => tone.id === oracle.chat.tone) || !LENGTHS.some((length) => length.id === oracle.chat.length)) {
    return "Ton și lungime — Alege tonul și lungimea din listă.";
  }
  if (!isValidInteger(oracle.prophecy.dailyLimit, 1, MAX_DAILY_LIMIT)) return `Profeții — Limita pe zi e între 1 și ${MAX_DAILY_LIMIT}.`;
  const daily = oracle.prophecy.daily;
  if (daily.channelId && !isDiscordId(daily.channelId)) return `Profeții — Canalul: „${daily.channelId}” nu este un ID Discord.`;
  if (daily.enabled && !daily.channelId) return "Profeții — Alege canalul profeției zilei.";
  if (!isValidInteger(daily.hour, 0, 23)) return "Profeții — Ora profeției zilei e între 0 și 23.";
  if (!isValidTimeZone(daily.timeZone)) return "Profeții — Fusul orar nu e cunoscut.";
  return null;
}
