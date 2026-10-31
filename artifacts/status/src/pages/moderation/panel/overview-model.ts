/**
 * Logica paginii Privire generală (/moderare), fără React: modulele de
 * protecție cu starea lor, ce trebuie verificat acum pe server și harta
 * paginilor panoului, fiecare cu starea ei.
 *
 * Comutatoarele de aici trimit PUT /guilds/:id/protection-toggle (api-server
 * moderation/router.ts), care schimbă doar cheia aleasă, sub lacăt, ca să nu se
 * ciocnească cu o salvare din altă pagină.
 */
import type { IconName } from "./fields";
import { countLabel } from "./model";
import { BOT_CHECKS } from "./control-model";

export type ToggleKey = "protection" | "autoMod" | "wordFilter" | "linkBlock" | "antiRaid" | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai";

export type ProtectionCard = {
  key: Exclude<ToggleKey, "protection">;
  label: string;
  description: string;
  route: string;
  icon: IconName;
  /** Where its switch is in the configuration. */
  path: readonly string[];
  /** A rule of AutoMod: it works only while AutoMod is on. */
  parent?: "autoMod";
};

export const PROTECTION_CARDS: readonly ProtectionCard[] = [
  { key: "autoMod", label: "AutoMod", description: "Filtrele de mesaje și regulile AutoMod din Discord.", route: "/automod", icon: "shield", path: ["autoMod"] },
  { key: "wordFilter", label: "Filtru cuvinte", description: "Cuvintele interzise și ce face botul când apar.", route: "/automod", icon: "msgx", path: ["autoMod", "wordFilter"], parent: "autoMod" },
  { key: "linkBlock", label: "Blocare linkuri", description: "Linkurile interzise și răspunsul la ele.", route: "/automod", icon: "slash", path: ["autoMod", "linkBlock"], parent: "autoMod" },
  { key: "antiRaid", label: "Anti-Raid", description: "Valuri de intrări și conturi prea noi.", route: "/anti-raid", icon: "raid", path: ["antiRaid"] },
  { key: "antiSpam", label: "Anti-Spam", description: "Mesaje, editări, mențiuni și emoji repetate.", route: "/anti-spam", icon: "waves", path: ["antiSpam"] },
  { key: "antiFlood", label: "Anti-Flood", description: "Mesaje lungi și șiruri de caractere.", route: "/anti-flood", icon: "stairs", path: ["antiFlood"] },
  { key: "suspiciousBehavior", label: "Comportament suspect", description: "Alerte pentru activitate neobișnuită.", route: "/comportament-suspect", icon: "scan", path: ["suspiciousBehavior"] },
  { key: "ai", label: "Moderare AI", description: "Judecătorul AI citește mesajele și propune sancțiuni.", route: "/ai", icon: "scale", path: ["ai"] },
];

function at(config: any, path: readonly string[]): any {
  return path.reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), config);
}

export function protectionOn(config: any): boolean {
  return Boolean(config?.protection?.enabled);
}

export function cardEnabled(config: any, card: ProtectionCard): boolean {
  return Boolean(at(config, card.path)?.enabled);
}

export type CardState = { tone: "on" | "paused" | "off"; text: string };

/** What a module does right now: its own switch, under AutoMod's and the global one. */
export function cardState(config: any, card: ProtectionCard): CardState {
  if (!cardEnabled(config, card)) return { tone: "off", text: "Oprit" };
  if (!protectionOn(config)) return { tone: "paused", text: "Configurat · protecția globală oprită" };
  if (card.parent && !config?.[card.parent]?.enabled) return { tone: "paused", text: "Configurat · AutoMod oprit" };
  return { tone: "on", text: "Activ" };
}

export function activeCards(config: any): number {
  return PROTECTION_CARDS.filter((card) => cardState(config, card).tone === "on").length;
}

/** The configuration with one switch changed, as the server will save it; for showing the change before the answer comes. */
export function withToggle(config: any, key: ToggleKey, enabled: boolean): any {
  if (!config) return config;
  const path = key === "protection" ? ["protection"] : PROTECTION_CARDS.find((card) => card.key === key)!.path;
  const next = structuredClone(config);
  let target = next;
  for (const part of path) {
    target[part] = target[part] && typeof target[part] === "object" ? target[part] : {};
    target = target[part];
  }
  target.enabled = enabled;
  return next;
}

/* ------------------------------------------------------------------ */
/* De verificat acum                                                   */
/* ------------------------------------------------------------------ */

export type Attention = { key: string; tone: "bad" | "warn" | "plain"; text: string; href: string; cta: string };

export type AttentionInput = {
  config: any;
  /** The bot-control settings (daily report, verification, Oracle); null when they did not load. */
  bot?: any;
  capabilities?: Record<string, boolean | undefined> | null;
  openCases?: number | null;
  unconfirmed?: number | null;
};

/** What needs a look on the server, the most urgent first; empty when all is well. */
export function attentionItems({ config, bot, capabilities, openCases, unconfirmed }: AttentionInput): Attention[] {
  const items: Attention[] = [];
  if (capabilities?.online === false) {
    items.push({ key: "offline", tone: "bad", text: "Botul e offline: nu moderează și nu răspunde la comenzi până revine.", href: "/control/bot", cta: "Botul pe server" });
  }
  if (unconfirmed) {
    items.push({
      key: "ledger", tone: "bad", href: "/audit", cta: "De verificat",
      text: `${countLabel(unconfirmed, "acțiune nu e confirmată", "acțiuni nu sunt confirmate")} de Discord. Verifică-le înainte să le dai din nou.`,
    });
  }
  if (config && !protectionOn(config)) {
    items.push({ key: "protection", tone: "warn", text: "Protecția automată e oprită: modulele își păstrează setările, dar nu prind nimic.", href: "/protectie", cta: "Protecție" });
  }
  const missing = capabilities && capabilities.online !== false
    ? BOT_CHECKS.filter((check) => capabilities[check.key] === false).map((check) => check.label)
    : [];
  if (missing.length) {
    items.push({
      key: "permissions", tone: "warn", href: "/control/bot", cta: "Permisiuni",
      text: `Botului îi ${missing.length === 1 ? "lipsește" : "lipsesc"} ${missing.join(", ")}.`,
    });
  }
  if (openCases) {
    items.push({ key: "cases", tone: "plain", text: `${countLabel(openCases, "caz deschis așteaptă", "cazuri deschise așteaptă")} să fie închise.`, href: "/cazuri", cta: "Cazuri" });
  }
  if (config && config.audit?.enabled === false) {
    items.push({ key: "audit", tone: "plain", text: "Auditul e oprit: acțiunile de moderare nu se mai scriu în jurnal.", href: "/jurnale/audit", cta: "Audit" });
  }
  if (config && !config.manualTools?.enabled) {
    items.push({ key: "commands", tone: "plain", text: "Comenzile staff-ului sunt oprite, în Discord și în panou.", href: "/sanctiuni/comenzi", cta: "Comenzi" });
  }
  if (bot && !bot.dailyStats?.channelId) {
    items.push({ key: "daily", tone: "plain", text: "Raportul zilnic nu are canal, deci nu se postează.", href: "/control/raport", cta: "Raport zilnic" });
  }
  if (bot?.verification?.enabled && !bot.verification.channelId) {
    items.push({ key: "verification", tone: "warn", text: "Verificarea e pornită, dar nu are canal pentru panou.", href: "/verificare", cta: "Verificare" });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Harta paginilor                                                     */
/* ------------------------------------------------------------------ */

export type MapLink = { title: string; href: string; state: string; tone: "on" | "paused" | "off" | "info" };
export type MapGroup = { key: string; title: string; icon: IconName; links: MapLink[] };

const onOff = (on: boolean | undefined, onText = "Pornit", offText = "Oprit"): Pick<MapLink, "state" | "tone"> =>
  on === undefined ? { state: "Setări", tone: "info" } : { state: on ? onText : offText, tone: on ? "on" : "off" };

/** Every page of the panel, by area, with what is on. */
export function pageMap(config: any, bot: any): MapGroup[] {
  const known = (value: unknown) => (bot ? Boolean(value) : undefined);
  return [
    {
      key: "moderation", title: "Moderare", icon: "gavel",
      links: [
        { title: "Sancțiuni", href: "/sanctiuni", ...onOff(config ? Boolean(config.escalation?.enabled) : undefined, "Escaladare pornită", "Fără escaladare") },
        { title: "Comenzi", href: "/comenzi", ...onOff(config ? Boolean(config.manualTools?.enabled) : undefined, "Pornite", "Oprite") },
        { title: "Cazuri și audit", href: "/cazuri", state: "Listă", tone: "info" },
        { title: "Jurnale", href: "/jurnale", ...onOff(config ? Boolean(config.activityLog?.enabled) : undefined, "Jurnale pornite", "Jurnale oprite") },
        { title: "Mesaje de moderare", href: "/config/mesaje", state: "Texte", tone: "info" },
      ],
    },
    {
      key: "members", title: "Membri", icon: "users",
      links: [
        { title: "Verificare", href: "/verificare", ...onOff(known(bot?.verification?.enabled)) },
        { title: "Tichete", href: "/tichete", state: "Fluxuri", tone: "info" },
        { title: "Bun venit", href: "/setari/bun-venit", ...onOff(known(bot?.gameplayConfig?.memberMessages?.welcomeEnabled)) },
        { title: "Ranguri de activitate", href: "/ranguri-activitate", state: "Ranguri", tone: "info" },
      ],
    },
    {
      key: "bot", title: "Botul", icon: "bot",
      links: [
        { title: "Oracolul", href: "/oracol", ...onOff(bot ? bot.oracle?.enabled !== false : undefined) },
        { title: "Invitații", href: "/control/invitatii", ...onOff(known(bot?.inviteTracking?.enabled), "Urmărite", "Oprite") },
        { title: "Raport zilnic", href: "/control/raport", ...onOff(bot ? Boolean(bot.dailyStats?.channelId) : undefined, "Se postează", "Fără canal") },
        { title: "Canale și acces", href: "/control/canale", state: "Canale", tone: "info" },
        { title: "Setări bot", href: "/setari", state: "Acces staff", tone: "info" },
      ],
    },
    {
      key: "setup", title: "Pornire", icon: "star",
      links: [
        { title: "Pornire server", href: "/pornire-server", state: "Ghid", tone: "info" },
        { title: "Toate modulele", href: "/config", state: "Listă", tone: "info" },
      ],
    },
  ];
}
