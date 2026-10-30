/**
 * Logica paginii Setări bot, fără React: modulele grupului (Acces,
 * Notificări, Mesaje în privat, Bun venit și plecare), valorile implicite,
 * previzualizările, rezumatele din meniu și verificările de dinainte de salvare.
 *
 * Primele trei module scriu în setările de moderare (permissions, embeds,
 * sanctionDm din api-server/src/moderation/config.ts); al patrulea în setările
 * botului (gameplayConfig.memberMessages). Pagina le ține în două ciorne și le
 * salvează pe amândouă din aceeași bară.
 */
import { isPublicGifUrl, isPublicHttpsUrl } from "../../../lib/embed-url-validation";
import { SETTINGS_MODULE_ROUTES, cleanPath, countLabel, deepEqual, getAt, isDiscordId } from "./model";

export { SETTINGS_ROUTE, isSettingsRoute } from "./model";

/* ------------------------------------------------------------------ */
/* Modulele grupului                                                   */
/* ------------------------------------------------------------------ */

export type SettingsModuleId = keyof typeof SETTINGS_MODULE_ROUTES;

export type SettingsModuleDef = {
  id: SettingsModuleId;
  route: string;
  short: string;
  title: string;
  description: string;
  /** Which settings the module edits: the moderation ones, or the bot's. */
  source: "config" | "bot";
  /** What the module edits; a change marks it unsaved in the menu. */
  path: string;
};

export const SETTINGS_MODULES: readonly SettingsModuleDef[] = [
  {
    id: "access", route: SETTINGS_MODULE_ROUTES.access, short: "Acces staff", title: "Acces staff", source: "config", path: "permissions",
    description: "Cine poate deschide panoul pentru cazuri și acțiuni manuale și ce roluri sunt staff-ul serverului.",
  },
  {
    id: "notices", route: SETTINGS_MODULE_ROUTES.notices, short: "Notificări", title: "Notificările de moderare", source: "config", path: "embeds",
    description: "Cum arată mesajele pe care botul le trimite în canalele de jurnal și de audit: forma, culoarea, textul și imaginile.",
  },
  {
    id: "dm", route: SETTINGS_MODULE_ROUTES.dm, short: "Mesaje în privat", title: "Mesaje în privat", source: "config", path: "sanctionDm",
    description: "Un mesaj în privat pentru membrul sancționat: ce a primit, ID-ul cazului și cum poate contesta.",
  },
  {
    id: "welcome", route: SETTINGS_MODULE_ROUTES.welcome, short: "Bun venit și plecare", title: "Bun venit și plecare", source: "bot",
    path: "gameplayConfig.memberMessages",
    description: "Un mesaj scris de AI în canalul ales, când intră sau pleacă cineva.",
  },
];

export function settingsModuleForRoute(path: string): SettingsModuleDef {
  const clean = cleanPath(path);
  return SETTINGS_MODULES.find((module) => module.route === clean) ?? SETTINGS_MODULES[0]!;
}

/** The moderation settings this page saves (one section per module, so the bar names each once). */
export const SETTINGS_SECTIONS = [
  { key: "permissions", label: "Acces staff" },
  { key: "embeds", label: "Notificări" },
  { key: "sanctionDm", label: "Mesaje în privat" },
] as const;

export function isSettingsModuleChanged(module: SettingsModuleDef, saved: any, draft: any): boolean {
  if (!saved || !draft) return false;
  const parts = module.path.split(".");
  return !deepEqual(getAt(saved, parts), getAt(draft, parts));
}

/** The bot's settings this page edits that differ from what is saved. */
export function changedWelcomeParts(saved: any, draft: any): Array<{ key: string; label: string }> {
  const module = SETTINGS_MODULES.find((item) => item.id === "welcome")!;
  return isSettingsModuleChanged(module, saved, draft) ? [{ key: "welcome", label: module.short }] : [];
}

/* ------------------------------------------------------------------ */
/* Acces                                                               */
/* ------------------------------------------------------------------ */

export function permissionsOf(config: any): { staffRoleIds: string[]; allowManageGuild: boolean } {
  const permissions = config?.permissions ?? {};
  return {
    staffRoleIds: Array.isArray(permissions.staffRoleIds) ? permissions.staffRoleIds : [],
    allowManageGuild: permissions.allowManageGuild !== false,
  };
}

/* ------------------------------------------------------------------ */
/* Notificări                                                          */
/* ------------------------------------------------------------------ */

export type EmbedSettings = {
  enabled: boolean; color: string; iconUrl: string | null; titleTemplate: string; descriptionTemplate: string;
  style: "plain" | "compact" | "detailed"; animations: boolean; animationUrl: string | null;
};

export const DEFAULT_EMBEDS: EmbedSettings = {
  enabled: false, color: "#5865F2", iconUrl: null, titleTemplate: "Moderation action", descriptionTemplate: "{action}: {reason}",
  style: "plain", animations: false, animationUrl: null,
};

export function embedsOf(config: any): EmbedSettings {
  return { ...DEFAULT_EMBEDS, ...(config?.embeds ?? {}) };
}

export const EMBED_STYLES: ReadonlyArray<readonly [EmbedSettings["style"], string, string]> = [
  ["plain", "Simplu", "Doar titlul și textul."],
  ["compact", "Compact", "Cu subsolul „Moderare”."],
  ["detailed", "Detaliat", "Cu data și ora din Discord."],
];

export const COLOR_PRESETS: ReadonlyArray<readonly [string, string]> = [
  ["#5865F2", "Discord"], ["#FF6B3D", "Jar"], ["#E2B467", "Aur"], ["#3DDC84", "Verde"], ["#FF5F6B", "Roșu"], ["#B28CFF", "Violet"],
];

export const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

/** The values a notification fills in, as the bot does (engine.ts, buildEmbed). */
export const TEMPLATE_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ["action", "Acțiunea"], ["reason", "Motivul"], ["member", "Membrul"], ["member_name", "Numele membrului"], ["moderator", "Moderatorul"],
  ["channel", "Canalul"], ["duration", "Durata"], ["guild", "Serverul"], ["time", "Ora"], ["time_relative", "Acum cât timp"],
];

export const SAMPLE_VALUES: Record<string, string> = {
  action: "Timeout aplicat", reason: "Spam: 6 mesaje în 5 secunde", guild: "Regatul Cenușii",
  member: "@Bogdan", member_mention: "@Bogdan", member_name: "Bogdan", username: "bogdan", member_id: "1000000000000000005",
  moderator: "@Oracolul Cenușii", moderator_mention: "@Oracolul Cenușii", moderator_name: "Oracolul Cenușii", moderator_username: "oracolul",
  moderator_id: "1000000000000000001", channel: "#general", channel_name: "general", channel_id: "1000000000000000002",
  duration: "10 minute", timestamp: "azi la 21:30", timestamp_relative: "acum 1 minut", time: "azi la 21:30", time_relative: "acum 1 minut",
};

export function renderTemplate(template: string, values: Record<string, string> = SAMPLE_VALUES): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match);
}

/* ------------------------------------------------------------------ */
/* Mesaje în privat                                                    */
/* ------------------------------------------------------------------ */

export type SanctionKind = "warn" | "mute" | "kick" | "ban";

export type DmSettings = {
  enabled: boolean; actions: SanctionKind[]; automatic: boolean; showReason: boolean; showModerator: boolean;
  appealText: string; removedAppealText: string; appealUrl: string | null;
};

export const DEFAULT_APPEAL_TEXT = "Dacă vrei să contești, deschide pe {guild} un tichet de contestație și scrie ID-ul cazului de mai sus.";
export const DEFAULT_REMOVED_APPEAL_TEXT = "Dacă vrei să contești, scrie-i unui administrator al serverului {guild} și dă-i ID-ul cazului de mai sus.";

/** The bot's defaults (moderation/config.ts): off, for every sanction. */
export const DEFAULT_DM: DmSettings = {
  enabled: false, actions: ["warn", "mute", "kick", "ban"], automatic: true, showReason: true, showModerator: false,
  appealText: DEFAULT_APPEAL_TEXT, removedAppealText: DEFAULT_REMOVED_APPEAL_TEXT, appealUrl: null,
};

export function dmOf(config: any): DmSettings {
  return { ...DEFAULT_DM, ...(config?.sanctionDm ?? {}) };
}

export const SANCTIONS: ReadonlyArray<readonly [SanctionKind, string]> = [["warn", "Avertisment"], ["mute", "Timeout"], ["kick", "Kick"], ["ban", "Ban"]];

const DM_TITLES: Record<SanctionKind, string> = {
  warn: "⚠️ Ai primit un avertisment", mute: "🔇 Ai primit timeout", kick: "🚪 Ai fost scos de pe server", ban: "⛔ Ai fost banat",
};

/** The private message the bot sends (bot/moderation/sanction-dm.ts), with example values. */
export function dmPreview(config: any, type: SanctionKind, guildName: string) {
  const dm = dmOf(config);
  const caseId = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f809a1b";
  const fields: Array<{ name: string; value: string }> = [];
  if (dm.showReason) fields.push({ name: "Motiv", value: "Spam: 6 mesaje în 5 secunde" });
  if (type === "mute") fields.push({ name: "Durată", value: "10 minute, până la 21:40" });
  if (dm.showModerator) fields.push({ name: "Dată de", value: "Ana (sau „Moderarea automată”)" });
  fields.push({ name: "ID-ul cazului", value: caseId });
  const appeal = (type === "kick" || type === "ban" ? dm.removedAppealText : dm.appealText)
    .replace(/\{guild\}/gi, guildName).replace(/\{case\}/gi, caseId).trim();
  if (appeal) fields.push({ name: "Contestație", value: appeal });
  return { title: DM_TITLES[type], description: `Pe serverul ${guildName}.`, fields, appealUrl: dm.appealUrl };
}

/* ------------------------------------------------------------------ */
/* Bun venit și plecare                                                */
/* ------------------------------------------------------------------ */

export type MemberMessageStyle = "medieval" | "normal" | "fantasy" | "sci_fi" | "humorous" | "custom";
export type MemberMessages = { welcomeEnabled: boolean; leaveEnabled: boolean; channelId: string; style: MemberMessageStyle; customStyle: string };

export const DEFAULT_MEMBER_MESSAGES: MemberMessages = { welcomeEnabled: false, leaveEnabled: false, channelId: "", style: "normal", customStyle: "" };
export const MAX_CUSTOM_STYLE = 180;

export function memberMessagesOf(config: any): MemberMessages {
  return { ...DEFAULT_MEMBER_MESSAGES, ...(config?.gameplayConfig?.memberMessages ?? {}) };
}

/** The styles the bot knows (bot/member-messages.ts), with an example written by hand for the preview. */
export const MEMBER_STYLES: ReadonlyArray<{ id: MemberMessageStyle; label: string; text: string; welcome: string; leave: string }> = [
  { id: "normal", label: "Normal", text: "Natural, modern și prietenos.", welcome: "bine ai venit! Ne bucurăm că ești aici, fă-te comod.", leave: "a plecat. Îi mulțumim pentru timpul petrecut cu noi." },
  { id: "medieval", label: "Medieval", text: "Ca un vestitor dintr-un regat vechi, dar clar.", welcome: "porțile cetății se deschid pentru tine! Fii binevenit în Regat.", leave: "și-a luat bocceaua și a pornit la drum. Drum bun, călătorule!" },
  { id: "fantasy", label: "Fantasy", text: "Poveste cu magie și aventură, ușor de înțeles.", welcome: "un nou erou a pășit prin portal. Aventura abia începe!", leave: "a dispărut într-o ceață fermecată. Fie ca drumul să-i fie luminos." },
  { id: "sci_fi", label: "Sci-fi", text: "Futurist, prietenos și ușor de înțeles.", welcome: "andocare reușită! Bine ai venit la bordul stației.", leave: "a părăsit stația. Semnalul rămâne deschis oricând." },
  { id: "humorous", label: "Amuzant", text: "Cu umor binevoitor, fără ironii răutăcioase.", welcome: "a apărut! Ascundeți fursecurile, avem un membru nou.", leave: "a ieșit pe ușă. A uitat să stingă lumina, dar îl iertăm." },
  { id: "custom", label: "Personalizat", text: "Descrii tu tonul, în câteva cuvinte.", welcome: "", leave: "" },
];

/* ------------------------------------------------------------------ */
/* Meniul și salvarea                                                   */
/* ------------------------------------------------------------------ */

export function settingsModuleSummary(id: SettingsModuleId, config: any, botConfig: any): string {
  switch (id) {
    case "access": {
      const { staffRoleIds, allowManageGuild } = permissionsOf(config);
      return `${countLabel(staffRoleIds.length, "rol staff", "roluri staff")}${allowManageGuild ? " · Manage Server" : ""}`;
    }
    case "notices": {
      const embeds = embedsOf(config);
      return embeds.enabled ? `embed · ${EMBED_STYLES.find(([style]) => style === embeds.style)?.[1].toLowerCase() ?? "simplu"}` : "text simplu";
    }
    case "dm": {
      const dm = dmOf(config);
      return dm.enabled ? `${countLabel(dm.actions.length, "sancțiune", "sancțiuni")}${dm.automatic ? " · și automate" : ""}` : "oprite";
    }
    case "welcome": {
      if (!botConfig) return "se încarcă…";
      const messages = memberMessagesOf(botConfig);
      if (messages.welcomeEnabled && messages.leaveEnabled) return "la intrare și la plecare";
      return messages.welcomeEnabled ? "doar la intrare" : messages.leaveEnabled ? "doar la plecare" : "oprite";
    }
  }
}

/** The menu's light: the module does something on the server right now. */
export function isSettingsModuleOn(id: SettingsModuleId, config: any, botConfig: any): boolean {
  switch (id) {
    case "access": return permissionsOf(config).staffRoleIds.length > 0 || permissionsOf(config).allowManageGuild;
    case "notices": return true;
    case "dm": return dmOf(config).enabled && dmOf(config).actions.length > 0;
    case "welcome": {
      const messages = memberMessagesOf(botConfig);
      return Boolean(botConfig) && (messages.welcomeEnabled || messages.leaveEnabled);
    }
  }
}

/** First problem in the moderation settings about to be sent, or null. */
export function settingsDraftError(config: any, keys: readonly string[] = SETTINGS_SECTIONS.map((section) => section.key)): string | null {
  if (keys.includes("permissions")) {
    const { staffRoleIds } = permissionsOf(config);
    const bad = staffRoleIds.find((id) => !isDiscordId(String(id)));
    if (bad !== undefined) return `Acces staff — „${bad}” nu este un ID Discord.`;
    if (staffRoleIds.length > 100) return "Acces staff — Poți alege cel mult 100 de roluri.";
  }
  if (keys.includes("embeds")) {
    const embeds = embedsOf(config);
    if (!isHexColor(embeds.color)) return "Notificări — Culoarea are forma #RRGGBB.";
    if (embeds.iconUrl && !isPublicHttpsUrl(embeds.iconUrl)) return "Notificări — Iconul trebuie să fie un link HTTPS public.";
    if (embeds.animations && !embeds.animationUrl) return "Notificări — Pentru animație, adaugă linkul HTTPS al unui fișier .gif.";
    if (embeds.animationUrl && !isPublicGifUrl(embeds.animationUrl)) return "Notificări — Animația trebuie să fie un link HTTPS public către un fișier .gif.";
    if (embeds.titleTemplate.length > 200) return "Notificări — Titlul are cel mult 200 de caractere.";
    if (embeds.descriptionTemplate.length > 2_000) return "Notificări — Textul are cel mult 2000 de caractere.";
  }
  if (keys.includes("sanctionDm")) {
    const dm = dmOf(config);
    if (dm.enabled && !dm.actions.length) return "Mesaje în privat — Alege cel puțin o sancțiune sau oprește mesajele.";
    if (dm.appealText.trim().length > 1_000 || dm.removedAppealText.trim().length > 1_000) return "Mesaje în privat — Textul contestației are cel mult 1000 de caractere.";
    if (dm.appealUrl && !isPublicHttpsUrl(dm.appealUrl)) return "Mesaje în privat — Linkul de contestație trebuie să fie HTTPS public.";
  }
  return null;
}

/** First problem in the bot settings about to be sent, or null. */
export function welcomeDraftError(botConfig: any): string | null {
  const messages = memberMessagesOf(botConfig);
  if (messages.channelId && !isDiscordId(messages.channelId)) return `Bun venit și plecare — „${messages.channelId}” nu este un ID Discord.`;
  if ((messages.welcomeEnabled || messages.leaveEnabled) && !messages.channelId) return "Bun venit și plecare — Alege canalul mesajelor.";
  if (messages.customStyle.trim().length > MAX_CUSTOM_STYLE) return `Bun venit și plecare — Tonul personalizat are cel mult ${MAX_CUSTOM_STYLE} de caractere.`;
  return null;
}
