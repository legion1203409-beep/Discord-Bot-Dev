/**
 * Setările Oracolului pentru fiecare server, alese din panou: dacă răspunde,
 * în ce canale, la ce mesaje, cu ce ton și lungime, cât așteaptă între două
 * răspunsuri pentru același membru și profețiile (comanda /profetie și
 * profeția zilei). Valorile implicite păstrează comportamentul de dinainte.
 */
import { loadOracleSettings, saveOracleSettings } from "./db";

export const ORACLE_TONES = ["implicit", "mistic", "prietenos", "sobru", "jucaus"] as const;
export const ORACLE_LENGTHS = ["scurt", "mediu", "lung"] as const;
export type OracleTone = (typeof ORACLE_TONES)[number];
export type OracleLength = (typeof ORACLE_LENGTHS)[number];

export interface OracleSettings {
  /** The Oracle answers and posts on this server (also switched by /stopai and /startai). */
  enabled: boolean;
  chat: {
    /** Channels (or categories) where the Oracle answers; empty means every channel. */
    channelIds: string[];
    /** Also answer a reply to one of its messages, without a mention. */
    replyToReplies: boolean;
    tone: OracleTone;
    length: OracleLength;
    /** Pause between two answers for the same member. */
    cooldownSeconds: number;
  };
  prophecy: {
    /** Members may ask for a personal prophecy with /profetie. */
    commandEnabled: boolean;
    /** Personal prophecies a member may ask for in one day. */
    dailyLimit: number;
    /** One prophecy for the whole server, posted every day at the chosen hour. */
    daily: { enabled: boolean; channelId: string; hour: number; timeZone: string };
  };
}

export const MAX_ORACLE_CHANNELS = 50;

/** ORACLE_USER_COOLDOWN_MS stays the default pause for servers that never chose one. */
function defaultCooldownSeconds(): number {
  const fromEnv = Number(process.env.ORACLE_USER_COOLDOWN_MS);
  return Number.isFinite(fromEnv) && fromEnv >= 0 && fromEnv <= 3_600_000 ? Math.round(fromEnv / 1000) : 12;
}

export const DEFAULT_ORACLE_SETTINGS: OracleSettings = {
  enabled: true,
  chat: { channelIds: [], replyToReplies: true, tone: "implicit", length: "mediu", cooldownSeconds: defaultCooldownSeconds() },
  prophecy: { commandEnabled: true, dailyLimit: 10, daily: { enabled: false, channelId: "", hour: 9, timeZone: "Europe/Bucharest" } },
};

const isSnowflake = (value: unknown): value is string => typeof value === "string" && /^\d{5,25}$/.test(value);

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("ro-RO", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function normalizeOracleSettings(value: unknown): OracleSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const chat = (raw.chat && typeof raw.chat === "object" ? raw.chat : {}) as Record<string, unknown>;
  const prophecy = (raw.prophecy && typeof raw.prophecy === "object" ? raw.prophecy : {}) as Record<string, any>;
  const daily = (prophecy.daily && typeof prophecy.daily === "object" ? prophecy.daily : {}) as Record<string, unknown>;
  const defaults = DEFAULT_ORACLE_SETTINGS;
  return {
    enabled: raw.enabled !== false,
    chat: {
      channelIds: Array.isArray(chat.channelIds) ? [...new Set(chat.channelIds.filter(isSnowflake))].slice(0, MAX_ORACLE_CHANNELS) : [],
      replyToReplies: chat.replyToReplies !== false,
      tone: ORACLE_TONES.includes(chat.tone as OracleTone) ? chat.tone as OracleTone : defaults.chat.tone,
      length: ORACLE_LENGTHS.includes(chat.length as OracleLength) ? chat.length as OracleLength : defaults.chat.length,
      cooldownSeconds: integer(chat.cooldownSeconds, defaults.chat.cooldownSeconds, 0, 3_600),
    },
    prophecy: {
      commandEnabled: prophecy.commandEnabled !== false,
      dailyLimit: integer(prophecy.dailyLimit, defaults.prophecy.dailyLimit, 1, 50),
      daily: {
        enabled: daily.enabled === true,
        channelId: isSnowflake(daily.channelId) ? daily.channelId : "",
        hour: integer(daily.hour, defaults.prophecy.daily.hour, 0, 23),
        timeZone: isValidTimeZone(daily.timeZone) ? daily.timeZone : defaults.prophecy.daily.timeZone,
      },
    },
  };
}

const cachedByGuild = new Map<string, OracleSettings>();

const loading = new Set<string>();

export function getOracleSettings(guildId: string | null | undefined): OracleSettings {
  if (!guildId) return DEFAULT_ORACLE_SETTINGS;
  const cached = cachedByGuild.get(guildId);
  if (cached) return cached;
  // A server not loaded at startup (a new one, or another start path) reads its settings in the background.
  if (!loading.has(guildId) && /^\d{5,25}$/.test(guildId)) {
    loading.add(guildId);
    void initOracleSettings(guildId).catch(() => undefined).finally(() => loading.delete(guildId));
  }
  return DEFAULT_ORACLE_SETTINGS;
}

export async function initOracleSettings(guildId: string): Promise<void> {
  const settings = normalizeOracleSettings(await loadOracleSettings(guildId));
  // A save that landed meanwhile wins over the value read before it.
  if (!cachedByGuild.has(guildId)) cachedByGuild.set(guildId, settings);
}

/** Saves the settings and uses them right away. */
export async function setOracleSettings(guildId: string, value: unknown): Promise<OracleSettings> {
  const settings = normalizeOracleSettings(value);
  await saveOracleSettings(guildId, settings);
  cachedByGuild.set(guildId, settings);
  return settings;
}

/** /stopai and /startai switch the same setting the panel shows. */
export async function setOracleEnabled(guildId: string, enabled: boolean): Promise<void> {
  await setOracleSettings(guildId, { ...getOracleSettings(guildId), enabled });
}

/** The Oracle answers in a channel when the list is empty, or holds the channel or its parent (a category or the channel of a thread). */
export function oracleChatAllowedIn(settings: OracleSettings, channelId: string, parentId?: string | null, grandParentId?: string | null): boolean {
  const allowed = settings.chat.channelIds;
  if (!allowed.length) return true;
  return [channelId, parentId, grandParentId].some((id) => Boolean(id) && allowed.includes(id!));
}

const TONE_INSTRUCTIONS: Record<OracleTone, string | null> = {
  implicit: null,
  mistic: "Tonul ales de server are întâietate față de starea ta de spirit: mistic și solemn, ca un oracol vechi, cu imagini de cenușă, foc și destin, fără să devii neclar.",
  prietenos: "Tonul ales de server are întâietate față de starea ta de spirit: cald și prietenos, ca un aliat apropiat; încurajezi și explici simplu.",
  sobru: "Tonul ales de server are întâietate față de starea ta de spirit: sobru și la obiect; fără glume și fără podoabe, rămânând în personaj.",
  jucaus: "Tonul ales de server are întâietate față de starea ta de spirit: jucăuș și ironic, cu umor medieval blând; nu jignești pe nimeni.",
};

const LENGTH_INSTRUCTIONS: Record<OracleLength, string | null> = {
  scurt: "Lungimea aleasă de server are întâietate: o singură propoziție, cel mult două.",
  mediu: null,
  lung: "Lungimea aleasă de server are întâietate: când întrebarea o cere, un paragraf de cinci până la opt propoziții.",
};

/** Extra system instruction for the chosen tone and length, or null when both are the defaults. */
export function oracleStyleInstruction(settings: OracleSettings): string | null {
  const lines = [TONE_INSTRUCTIONS[settings.chat.tone], LENGTH_INSTRUCTIONS[settings.chat.length]].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

/** The local day ("YYYY-MM-DD") and hour in a time zone. */
export function localDayAndHour(now: Date, timeZone: string): { day: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const prophecyUses = new Map<string, { day: string; count: number }>();

/** Personal prophecies a member may still ask for today (counted per server, reset at local midnight). */
export function prophecyUsesLeft(guildId: string, userId: string, settings: OracleSettings, now = new Date()): number {
  const { day } = localDayAndHour(now, settings.prophecy.daily.timeZone);
  const used = prophecyUses.get(`${guildId}:${userId}`);
  return Math.max(0, settings.prophecy.dailyLimit - (used?.day === day ? used.count : 0));
}

export function recordProphecyUse(guildId: string, userId: string, settings: OracleSettings, now = new Date()): void {
  const { day } = localDayAndHour(now, settings.prophecy.daily.timeZone);
  const key = `${guildId}:${userId}`;
  const used = prophecyUses.get(key);
  prophecyUses.set(key, { day, count: used?.day === day ? used.count + 1 : 1 });
}
