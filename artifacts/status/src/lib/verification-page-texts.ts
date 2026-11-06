/**
 * Textele paginii de verificare de pe site. Aceleași valori de bază și limite ca
 * botul (api-server/src/bot/verification.ts, DEFAULT_VERIFICATION_PAGE), ca ce
 * scrii în panou să fie exact ce vede membrul.
 */
export interface VerificationPageTexts {
  title: string;
  lead: string;
  sliderLabel: string;
  ctaLabel: string;
  successTitle: string;
  successText: string;
  welcomeLabel: string;
  runesEnabled: boolean;
  runesTitle: string;
  runesText: string;
}

export type VerificationPageTextKey = Exclude<keyof VerificationPageTexts, "runesEnabled">;

export const DEFAULT_VERIFICATION_PAGE: VerificationPageTexts = {
  title: "Verifică-ți accesul",
  lead: "Pentru a confirma verificarea, glisează marcajul până la capătul traseului. Biletul a fost emis de Discord și va fi folosit o singură dată pentru acest pas.",
  sliderLabel: "Aprinde flacăra",
  ctaLabel: "Finalizează verificarea",
  successTitle: "Verificarea a fost finalizată.",
  successText: "Poți reveni acum în Discord.",
  welcomeLabel: "Bun venit în Regatul Cenușii",
  runesEnabled: true,
  runesTitle: "Trage-ți runa",
  runesText: "Alege o carte. Oracolul îți spune cine ești în regat.",
};

/** Each text with its name in the panel and its limit, in the order the page shows them. */
export const VERIFICATION_PAGE_FIELDS: ReadonlyArray<{ key: VerificationPageTextKey; label: string; max: number; multiline?: boolean; hint?: string; group: "before" | "after" }> = [
  { key: "title", label: "Titlul", max: 80, group: "before" },
  { key: "lead", label: "Textul de sub titlu", max: 500, multiline: true, group: "before", hint: "Spune-i membrului ce are de făcut." },
  { key: "sliderLabel", label: "Eticheta glisorului", max: 40, group: "before" },
  { key: "ctaLabel", label: "Butonul de final", max: 40, group: "before" },
  { key: "successTitle", label: "Titlul după verificare", max: 120, group: "after" },
  { key: "successText", label: "Textul după verificare", max: 300, multiline: true, group: "after" },
  { key: "welcomeLabel", label: "Textul de sub pecete", max: 60, group: "after", hint: "Apare sub cercul de rune care se aprinde." },
  { key: "runesTitle", label: "Titlul jocului cu rune", max: 60, group: "after" },
  { key: "runesText", label: "Textul jocului cu rune", max: 200, group: "after" },
];

export function verificationPageOf(value: unknown): VerificationPageTexts {
  const source = value && typeof value === "object" ? value as Partial<Record<keyof VerificationPageTexts, unknown>> : {};
  const page = { ...DEFAULT_VERIFICATION_PAGE };
  for (const field of VERIFICATION_PAGE_FIELDS) {
    const text = source[field.key];
    if (typeof text === "string" && text.trim()) page[field.key] = text.slice(0, field.max);
  }
  page.runesEnabled = source.runesEnabled !== false;
  return page;
}

/** The first text that the server would refuse, or null. */
export function verificationPageError(value: unknown): string | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  for (const field of VERIFICATION_PAGE_FIELDS) {
    const text = String(source[field.key] ?? "").trim();
    if (!text) return `${field.label} nu poate fi gol.`;
    if (text.length > field.max) return `${field.label} are ${text.length} de caractere; cel mult ${field.max}.`;
  }
  return null;
}
