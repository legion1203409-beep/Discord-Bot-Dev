/**
 * Logica pură a paginii Judecătorului AI: categoriile, ce bife folosește o
 * categorie (ale ei sau cele generale), sensibilitatea pe categorie și
 * verificările dinainte de salvare.
 *
 * Oglinda de pe server este aiRuleForCategory din api-server/src/bot/moderation/engine.ts:
 * acțiunea și ștergerea cad pe cele generale câmp cu câmp; avertismentul, anunțul
 * pentru staff și durata mute-ului vin din categorie doar după ce aceasta și-a ales
 * acțiunile proprii.
 */
import { describeTicks, isDiscordId, isValidMuteMinutes, withTickFields, type RuleLike } from "./model";

export { isDiscordId };

export type AiCategoryKey =
  | "toxicity" | "profanity" | "attacks" | "bullying" | "intelligentSpam" | "trolling" | "scams" | "threats" | "deceptiveLinks";

export const AI_CATEGORIES: ReadonlyArray<{ key: AiCategoryKey; label: string; hint: string }> = [
  { key: "toxicity", label: "Toxicitate", hint: "Limbaj ostil sau abuziv." },
  { key: "profanity", label: "Limbaj vulgar", hint: "Înjurături îndreptate către alte persoane." },
  { key: "attacks", label: "Atacuri", hint: "Insulte și atacuri personale." },
  { key: "bullying", label: "Hărțuire", hint: "Umilirea sau hărțuirea țintită a cuiva." },
  { key: "intelligentSpam", label: "Spam inteligent", hint: "Promovare nedorită mascată în conversație." },
  { key: "trolling", label: "Trolling", hint: "Provocări intenționate și dăunătoare." },
  { key: "scams", label: "Fraude", hint: "Oferte înșelătoare și încercări de a fura bani sau conturi." },
  { key: "threats", label: "Amenințări", hint: "Amenințări credibile îndreptate către persoane." },
  { key: "deceptiveLinks", label: "Linkuri înșelătoare", hint: "Phishing și linkuri care imită servicii cunoscute; un link necunoscut nu e, singur, o dovadă." },
];

/** The parts of the configuration this page saves. */
export const AI_SECTIONS = [
  { key: "ai", label: "Judecătorul AI" },
  { key: "protection.enabled", label: "Protecția serverului" },
] as const;

export const AI_SENSITIVITIES = [["low", "Scăzută"], ["medium", "Medie"], ["high", "Ridicată"]] as const;
export const AI_CATEGORY_SENSITIVITIES = [["inherit", "Ca setarea generală"], ...AI_SENSITIVITIES] as const;
export const AI_TONES = [["serious", "Serios"], ["calm", "Calm"], ["strict", "Strict"]] as const;
const SENSITIVITY_LABEL: Record<string, string> = Object.fromEntries(AI_SENSITIVITIES);

const MAX_EXCEPTIONS = 100;
const TICK_KEYS = ["action", "deleteMessage", "warnMember", "alertStaff", "muteMinutes"] as const;

type Override = Record<string, any>;
const overrideOf = (ai: any, key: AiCategoryKey): Override => ai?.categorySettings?.[key] ?? {};

/** The category chose its own actions (the panel always stores both `action` and `deleteMessage` then). */
export function aiCategoryHasOwnActions(ai: any, key: AiCategoryKey): boolean {
  const override = overrideOf(ai, key);
  return override.action !== undefined || override.deleteMessage !== undefined;
}

/** The ticks a category acts with: its own, or the general ones. */
export function aiCategoryRule(ai: any, key: AiCategoryKey): RuleLike {
  const override = overrideOf(ai, key);
  const extras = aiCategoryHasOwnActions(ai, key) ? override : (ai ?? {});
  const rule: RuleLike = {
    action: override.action ?? ai?.action ?? "none",
    deleteMessage: override.deleteMessage ?? ai?.deleteMessage ?? false,
  };
  if (extras.warnMember === true) rule.warnMember = true;
  if (extras.alertStaff === true) rule.alertStaff = true;
  if (extras.muteMinutes !== undefined) rule.muteMinutes = extras.muteMinutes;
  return rule;
}

/** Stores a category's settings, dropping the entry when nothing is left in it. */
function withOverride<T extends Record<string, any>>(ai: T, key: AiCategoryKey, override: Override): T {
  const settings: Record<string, Override> = { ...(ai.categorySettings ?? {}) };
  if (Object.keys(override).some((name) => override[name] !== undefined)) settings[key] = override;
  else delete settings[key];
  return { ...ai, categorySettings: settings };
}

/**
 * Lets a category follow the general ticks, or gives it its own, starting from
 * exactly what it does now (so switching changes nothing until a tick is changed).
 */
export function setAiCategoryOwn<T extends Record<string, any>>(ai: T, key: AiCategoryKey, own: boolean): T {
  const override: Override = { ...overrideOf(ai, key) };
  if (own) {
    if (aiCategoryHasOwnActions(ai, key)) return ai;
    const rule = aiCategoryRule(ai, key);
    return withOverride(ai, key, withTickFields(override, { ...rule, deleteMessage: rule.deleteMessage === true }));
  }
  for (const name of TICK_KEYS) delete override[name];
  return withOverride(ai, key, override);
}

/** Writes the ticks of a category that has its own actions. */
export function setAiCategoryTicks<T extends Record<string, any>>(ai: T, key: AiCategoryKey, next: RuleLike): T {
  return withOverride(ai, key, withTickFields(overrideOf(ai, key), {
    ...next,
    action: typeof next.action === "string" ? next.action : "none",
    deleteMessage: next.deleteMessage === true,
  }));
}

/** "inherit" removes the category's own sensitivity. */
export function setAiCategorySensitivity<T extends Record<string, any>>(ai: T, key: AiCategoryKey, value: string): T {
  const override: Override = { ...overrideOf(ai, key) };
  if (value === "inherit") delete override.sensitivity;
  else override.sensitivity = value;
  return withOverride(ai, key, override);
}

export function aiEnabledCategoryCount(ai: any): number {
  return AI_CATEGORIES.filter(({ key }) => ai?.categories?.[key] === true).length;
}

/** The line under a category's title. */
export function aiCategorySummary(ai: any, key: AiCategoryKey): string {
  if (ai?.categories?.[key] !== true) return "Oprită";
  const own = aiCategoryHasOwnActions(ai, key);
  const parts = describeTicks(aiCategoryRule(ai, key), "message");
  const actions = parts.length ? parts.join(" + ") : "Doar înregistrare";
  const sensitivity = overrideOf(ai, key).sensitivity;
  return [
    sensitivity ? `Sensibilitate ${SENSITIVITY_LABEL[sensitivity]?.toLocaleLowerCase("ro") ?? sensitivity}` : null,
    own ? actions : `Ca setările generale: ${actions}`,
  ].filter(Boolean).join(" · ");
}

/** True when no enabled category would do anything but record the finding. */
export function aiOnlyRecords(ai: any): boolean {
  return !AI_CATEGORIES.some(({ key }) => ai?.categories?.[key] === true && describeTicks(aiCategoryRule(ai, key), "message").length > 0);
}

/** First problem that would make the server refuse the AI settings, worded for the person, or null. */
export function aiDraftError(config: any, sections?: ReadonlyArray<string>): string | null {
  if (sections && !sections.includes("ai")) return null;
  const ai = config?.ai ?? {};
  const muteError = (where: string) => `${where} — Durata mute-ului (minute): introdu un număr întreg între 1 și 40320.`;
  if (ai.muteMinutes !== undefined && !isValidMuteMinutes(ai.muteMinutes)) return muteError("Judecătorul AI");
  for (const { key, label } of AI_CATEGORIES) {
    const minutes = ai.categorySettings?.[key]?.muteMinutes;
    if (minutes !== undefined && !isValidMuteMinutes(minutes)) return muteError(label);
  }
  for (const [field, name] of [["excludedChannelIds", "Canale exceptate"], ["excludedRoleIds", "Roluri exceptate"]] as const) {
    const ids: unknown = ai[field] ?? [];
    if (!Array.isArray(ids)) continue;
    if (ids.length > MAX_EXCEPTIONS) return `${name}: cel mult ${MAX_EXCEPTIONS}.`;
    const bad = ids.find((id) => typeof id !== "string" || !isDiscordId(id));
    if (bad !== undefined) return `${name}: „${String(bad)}” nu este un ID Discord (5–25 cifre).`;
  }
  return null;
}

