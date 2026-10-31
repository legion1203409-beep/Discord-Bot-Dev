/**
 * Logica paginii Jocul, fără React: modulele (Stare, Canale, Evenimente,
 * Misiuni, Economie), rezumatele din meniu și verificările de dinainte de
 * salvare. Totul e în setările botului: channels (destinațiile jocului, ca la
 * /setcanal) și gameplayConfig (api-server/src/bot/gameplay-config.ts, cu
 * limitele din moderation/router.ts → botControlSchema).
 */
import { GAME_MODULE_ROUTES, cleanPath, deepEqual, getAt, isDiscordId, isValidInteger } from "./model";

export { GAME_ROUTE, isGameRoute } from "./model";

export type GameModuleId = keyof typeof GAME_MODULE_ROUTES;

export type GameModuleDef = { id: GameModuleId; route: string; short: string; title: string; description: string; paths: readonly string[] };

export const GAME_MODULES: readonly GameModuleDef[] = [
  {
    id: "state", route: GAME_MODULE_ROUTES.state, short: "Stare și pauză", title: "Starea jocului",
    description: "Pornește sau oprește jocul pe server (ca /startjoc și /stopjoc) și ce scrie botul cât e oprit.",
    // Pausing is applied at once through its own route (/gameplay-state), not with the draft.
    paths: ["gameplayConfig.messages.gamePaused", "gameplayConfig.messages.gamePausedImageUrl", "gameplayConfig.messages.gamePausedThumbnailUrl"],
  },
  {
    id: "channels", route: GAME_MODULE_ROUTES.channels, short: "Canale", title: "Canalele jocului",
    description: "Unde postează botul fiecare activitate a jocului (ca /setcanal). Fără canal, activitatea aceea nu apare.",
    paths: ["channels"],
  },
  {
    id: "events", route: GAME_MODULE_ROUTES.events, short: "Evenimente", title: "Evenimente, boși și cufere",
    description: "Cât durează și cât de des vin Ora Umbrelor, Dragonul Stins, evenimentele de luptă și cuferele.",
    paths: ["gameplayConfig.events"],
  },
  {
    id: "missions", route: GAME_MODULE_ROUTES.missions, short: "Misiuni", title: "Misiunile zilnice",
    description: "Cât de grele sunt cele trei misiuni zilnice din /misiuni și câte materiale dau la final.",
    paths: ["gameplayConfig.missions"],
  },
  {
    id: "economy", route: GAME_MODULE_ROUTES.economy, short: "Economie", title: "Economia jocului",
    description: "Câți Oboli și cât XP dau monștrii și boșii. 1× e valoarea de bază; 2× dublează, 0,5× înjumătățește.",
    paths: ["gameplayConfig.economy"],
  },
  {
    id: "progress", route: GAME_MODULE_ROUTES.progress, short: "Serii și realizări", title: "Serii zilnice și realizări",
    description: "Seria crește cu fiecare zi la rând în care un jucător deschide Cufărul Vegherii și mărește cufărul. Realizările sunt insigne pentru fapte adunate în timp, văzute cu /realizari.",
    paths: ["gameplayConfig.progress"],
  },
  {
    id: "seasons", route: GAME_MODULE_ROUTES.seasons, short: "Sezoane", title: "Sezoanele lunare",
    description: "Un clasament care pornește de la zero în fiecare lună (/sezon). La final, primii trei primesc Oboli, un titlu de onoare și, dacă alegi, un rol.",
    paths: ["gameplayConfig.seasons"],
  },
  {
    id: "raid", route: GAME_MODULE_ROUTES.raid, short: "Raid", title: "Raidul săptămânal",
    description: "O dată pe săptămână apare un titan pe care tot serverul îl bate împreună (/raid). Prada se împarte după daune: toată dacă titanul cade, un sfert dacă scapă.",
    paths: ["gameplayConfig.raid"],
  },
  {
    id: "duels", route: GAME_MODULE_ROUTES.duels, short: "Dueluri", title: "Duelurile",
    description: "Jucătorii se provoacă cu /duel, cu sau fără pariu în Oboli. Lupta se joacă din statisticile fiecăruia, iar /topduel arată clasamentul (rating Elo).",
    paths: ["gameplayConfig.duels"],
  },
  {
    id: "expeditions", route: GAME_MODULE_ROUTES.expeditions, short: "Expediții", title: "Expedițiile companionilor",
    description: "Jucătorii cu companion îl trimit 1, 4 sau 8 ore (/expeditie) și adună Oboli și materiale când se întoarce. Mai mult cu cât drumul e mai lung și companionul mai antrenat.",
    paths: ["gameplayConfig.expeditions"],
  },
  {
    id: "guilds", route: GAME_MODULE_ROUTES.guilds, short: "Bresle", title: "Breslele",
    description: "Grupuri de jucători cu nume, etichetă, lider, ofițeri și o cămară comună (/breasla). Punctele unei bresle sunt punctele de sezon ale membrilor, deci clasamentul merge cu sezonul.",
    paths: ["gameplayConfig.guilds"],
  },
];

export function gameModuleForRoute(path: string): GameModuleDef {
  const clean = cleanPath(path);
  return GAME_MODULES.find((module) => module.route === clean) ?? GAME_MODULES[0]!;
}

export function isGameModuleChanged(module: Pick<GameModuleDef, "paths">, saved: any, draft: any): boolean {
  if (!saved || !draft) return false;
  return module.paths.some((path) => !deepEqual(getAt(saved, path.split(".")), getAt(draft, path.split("."))));
}

export function changedGameParts(saved: any, draft: any): Array<{ key: string; label: string }> {
  if (!saved || !draft) return [];
  return GAME_MODULES.filter((module) => isGameModuleChanged(module, saved, draft)).map((module) => ({ key: module.id, label: module.short }));
}

/* ------------------------------------------------------------------ */
/* Canale                                                              */
/* ------------------------------------------------------------------ */

export type GameChannelKey = "main" | "event" | "boss" | "trader" | "eventTop" | "bossTop" | "council" | "fratia";

export const GAME_CHANNELS: ReadonlyArray<{ key: GameChannelKey; label: string; hint: string; group: "play" | "tops" | "community" }> = [
  { key: "event", label: "Ora Umbrelor", hint: "Evenimentul cu valuri de monștri și boss-ul final.", group: "play" },
  { key: "boss", label: "Dragonul Stins", hint: "Boșii care apar singuri între evenimente.", group: "play" },
  { key: "main", label: "Cufere", hint: "Cuferele care apar din când în când pentru cine apasă primul.", group: "play" },
  { key: "trader", label: "Negustorul (Forja Cenușii)", hint: "Negustorul și ofertele lui.", group: "play" },
  { key: "eventTop", label: "Top Ora Umbrelor", hint: "Clasamentul de după fiecare Oră a Umbrelor.", group: "tops" },
  { key: "bossTop", label: "Top Dragonul Stins", hint: "Clasamentul de după fiecare boss.", group: "tops" },
  { key: "council", label: "Consiliul Umbrelor", hint: "Unde se adună Consiliul Oracolului.", group: "community" },
  { key: "fratia", label: "Chivotul Frăției", hint: "Votul comunității din /fratie.", group: "community" },
];

export function gameChannelCount(config: any): number {
  return GAME_CHANNELS.filter((channel) => Boolean(config?.channels?.[channel.key])).length;
}

/* ------------------------------------------------------------------ */
/* Evenimente                                                          */
/* ------------------------------------------------------------------ */

export type EventKey =
  | "eventDurationMinutes" | "eventCooldownMinMinutes" | "eventCooldownMaxMinutes" | "finalBossDurationMinutes"
  | "standaloneBossIntervalMinMinutes" | "standaloneBossIntervalMaxMinutes" | "standaloneBossDurationMinutes"
  | "battleEventIntervalMinutes" | "chestIntervalMinutes" | "chestExpireMinutes";

export const DEFAULT_EVENTS: Record<EventKey, number> = {
  eventDurationMinutes: 60, eventCooldownMinMinutes: 10, eventCooldownMaxMinutes: 120, finalBossDurationMinutes: 30,
  standaloneBossIntervalMinMinutes: 30, standaloneBossIntervalMaxMinutes: 60, standaloneBossDurationMinutes: 60,
  battleEventIntervalMinutes: 7, chestIntervalMinutes: 60, chestExpireMinutes: 20,
};

export const EVENT_FIELDS: ReadonlyArray<{ group: string; fields: ReadonlyArray<{ key: EventKey; label: string; hint?: string; max: number }> }> = [
  {
    group: "Ora Umbrelor", fields: [
      { key: "eventDurationMinutes", label: "Cât durează", max: 1_440 },
      { key: "finalBossDurationMinutes", label: "Cât durează boss-ul final", max: 1_440 },
      { key: "eventCooldownMinMinutes", label: "Pauza dintre evenimente, cel puțin", hint: "Botul alege la întâmplare o pauză între minim și maxim.", max: 1_440 },
      { key: "eventCooldownMaxMinutes", label: "Pauza dintre evenimente, cel mult", max: 1_440 },
    ],
  },
  {
    group: "Dragonul Stins", fields: [
      { key: "standaloneBossDurationMinutes", label: "Cât durează", max: 1_440 },
      { key: "standaloneBossIntervalMinMinutes", label: "Vine după cel puțin", max: 1_440 },
      { key: "standaloneBossIntervalMaxMinutes", label: "Vine după cel mult", max: 1_440 },
    ],
  },
  {
    group: "Luptă și cufere", fields: [
      { key: "battleEventIntervalMinutes", label: "Un eveniment de luptă la fiecare", hint: "Efectele care schimbă lupta pentru toți (furtuni, binecuvântări).", max: 1_440 },
      { key: "chestIntervalMinutes", label: "Un cufăr la fiecare", max: 1_440 },
      { key: "chestExpireMinutes", label: "Cufărul dispare după", max: 120 },
    ],
  },
];

export function eventsOf(config: any): Record<EventKey, number> {
  return { ...DEFAULT_EVENTS, ...(config?.gameplayConfig?.events ?? {}) };
}

/** „1 oră și 30 de minute”, „45 de minute”. */
export function minutesText(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const part = (value: number, one: string, many: string) => value === 1 ? `1 ${one}` : `${value}${value >= 20 ? " de" : ""} ${many}`;
  if (!hours) return part(rest, "minut", "minute");
  return rest ? `${part(hours, "oră", "ore")} și ${part(rest, "minut", "minute")}` : part(hours, "oră", "ore");
}

/** How many events of each kind a day holds, on average, with these settings. */
export function eventsPerDay(events: Record<EventKey, number>): { shadowHour: number; dragon: number; chests: number } {
  const shadowCycle = events.eventDurationMinutes + (events.eventCooldownMinMinutes + events.eventCooldownMaxMinutes) / 2;
  const dragonCycle = events.standaloneBossDurationMinutes + (events.standaloneBossIntervalMinMinutes + events.standaloneBossIntervalMaxMinutes) / 2;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    shadowHour: round(shadowCycle > 0 ? 1_440 / shadowCycle : 0),
    dragon: round(dragonCycle > 0 ? 1_440 / dragonCycle : 0),
    chests: round(events.chestIntervalMinutes > 0 ? 1_440 / events.chestIntervalMinutes : 0),
  };
}

/* ------------------------------------------------------------------ */
/* Misiuni                                                             */
/* ------------------------------------------------------------------ */

export type MissionKey = "kill_10" | "rare_3" | "boss_1";

/** The three daily missions, as bot/survival.ts → DAILY_QUESTS describes them. */
export const MISSIONS: ReadonlyArray<{ key: MissionKey; label: string; verb: string; reward: string; defaults: { target: number; rewardQty: number } }> = [
  { key: "kill_10", label: "⚔️ Ucide monștri", verb: "monștri în Ora Umbrelor", reward: "🐉 Coamă de Dragon", defaults: { target: 10, rewardQty: 1 } },
  { key: "rare_3", label: "💠 Vânează monștri rari", verb: "monștri rari sau mai buni", reward: "💠 Solz Spectral", defaults: { target: 3, rewardQty: 2 } },
  { key: "boss_1", label: "🐲 Răpune un mini-boss", verb: "mini-boși", reward: "💎 Cristal de Abis", defaults: { target: 1, rewardQty: 1 } },
];

export function missionOf(config: any, key: MissionKey): { target: number; rewardQty: number } {
  const defaults = MISSIONS.find((mission) => mission.key === key)!.defaults;
  return { ...defaults, ...(config?.gameplayConfig?.missions?.[key] ?? {}) };
}

/* ------------------------------------------------------------------ */
/* Economie                                                            */
/* ------------------------------------------------------------------ */

export type EconomyKey = "monsterGoldMultiplier" | "monsterXpMultiplier" | "bossGoldMultiplier" | "bossXpMultiplier";

export const ECONOMY_FIELDS: ReadonlyArray<{ key: EconomyKey; label: string; who: "monster" | "boss"; what: "gold" | "xp" }> = [
  { key: "monsterGoldMultiplier", label: "Oboli de la monștri", who: "monster", what: "gold" },
  { key: "monsterXpMultiplier", label: "XP de la monștri", who: "monster", what: "xp" },
  { key: "bossGoldMultiplier", label: "Oboli de la boși", who: "boss", what: "gold" },
  { key: "bossXpMultiplier", label: "XP de la boși", who: "boss", what: "xp" },
];

export const MIN_MULTIPLIER = 0.1;
export const MAX_MULTIPLIER = 10;
export const MULTIPLIER_PRESETS = [0.5, 1, 1.5, 2, 3] as const;

export function economyOf(config: any): Record<EconomyKey, number> {
  return { monsterGoldMultiplier: 1, monsterXpMultiplier: 1, bossGoldMultiplier: 1, bossXpMultiplier: 1, ...(config?.gameplayConfig?.economy ?? {}) };
}

export function isValidMultiplier(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_MULTIPLIER && value <= MAX_MULTIPLIER;
}

export function multiplierText(value: number): string {
  return `${value.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}×`;
}

/** „Weekend dublu” etc.: whether every multiplier equals the given value. */
export function allMultipliersAre(config: any, value: number): boolean {
  const economy = economyOf(config);
  return ECONOMY_FIELDS.every((field) => economy[field.key] === value);
}

/* ------------------------------------------------------------------ */
/* Serii și realizări                                                  */
/* ------------------------------------------------------------------ */

export type ProgressSettings = {
  streakEnabled: boolean; streakBonusPercent: number; streakMaxDays: number; weeklyKey: boolean; achievementsEnabled: boolean; achievementRewards: boolean;
};

export const DEFAULT_PROGRESS: ProgressSettings = {
  streakEnabled: true, streakBonusPercent: 10, streakMaxDays: 7, weeklyKey: true, achievementsEnabled: true, achievementRewards: true,
};

export function progressOf(config: any): ProgressSettings {
  return { ...DEFAULT_PROGRESS, ...(config?.gameplayConfig?.progress ?? {}) };
}

/** The extra on the daily chest on each day of a streak, as the bot computes it (bot/progress.ts). */
export function streakLadder(settings: Pick<ProgressSettings, "streakBonusPercent" | "streakMaxDays">, days = 7): number[] {
  return Array.from({ length: days }, (_, index) => Math.max(0, Math.min(index + 1, settings.streakMaxDays) - 1) * settings.streakBonusPercent);
}

/** The achievements the bot knows (bot/progress.ts → ACHIEVEMENTS), for the panel's list. */
export const ACHIEVEMENT_LIST: ReadonlyArray<{ emoji: string; name: string; description: string; reward: number }> = [
  { emoji: "⚔️", name: "Prima Vânătoare", description: "100 de monștri", reward: 300 },
  { emoji: "🗡️", name: "Secerătorul", description: "1.000 de monștri", reward: 1_500 },
  { emoji: "💀", name: "Flagelul Umbrelor", description: "10.000 de monștri", reward: 8_000 },
  { emoji: "🐉", name: "Vânător de Dragoni", description: "10 bătălii cu boși", reward: 500 },
  { emoji: "🔥", name: "Ucigașul de Titani", description: "100 de bătălii cu boși", reward: 4_000 },
  { emoji: "📜", name: "Ucenicul Misiunilor", description: "10 misiuni", reward: 400 },
  { emoji: "📚", name: "Cronicarul Regatului", description: "100 de misiuni", reward: 3_000 },
  { emoji: "🗝️", name: "Purtătorul de Chei", description: "25 de chei", reward: 600 },
  { emoji: "🔐", name: "Paznicul Porților", description: "250 de chei", reward: 5_000 },
  { emoji: "💬", name: "Glasul Cetății", description: "500 de mesaje", reward: 300 },
  { emoji: "📯", name: "Vestitorul", description: "5.000 de mesaje", reward: 2_000 },
  { emoji: "🕯️", name: "Veghetorul", description: "7 cufere zilnice", reward: 400 },
  { emoji: "🏮", name: "Flacăra Neclintită", description: "30 de cufere zilnice", reward: 2_500 },
  { emoji: "🔥", name: "O Săptămână de Foc", description: "o serie de 7 zile", reward: 800 },
  { emoji: "☄️", name: "Neînfrânt", description: "o serie de 30 de zile", reward: 6_000 },
];

/* ------------------------------------------------------------------ */
/* Sezoane                                                             */
/* ------------------------------------------------------------------ */

export type SeasonSettings = { enabled: boolean; rewards: [number, number, number]; roleIds: [string, string, string]; channelId: string };

export const DEFAULT_SEASONS: SeasonSettings = { enabled: true, rewards: [10_000, 5_000, 2_500], roleIds: ["", "", ""], channelId: "" };

export function seasonsOf(config: any): SeasonSettings {
  const value = config?.gameplayConfig?.seasons ?? {};
  return {
    enabled: value.enabled !== false,
    rewards: Array.isArray(value.rewards) && value.rewards.length === 3 ? value.rewards : DEFAULT_SEASONS.rewards,
    roleIds: Array.isArray(value.roleIds) && value.roleIds.length === 3 ? value.roleIds : DEFAULT_SEASONS.roleIds,
    channelId: typeof value.channelId === "string" ? value.channelId : "",
  };
}

/** Season points per deed, as bot/seasons.ts → SEASON_POINTS gives them. */
export const SEASON_POINT_LIST: ReadonlyArray<readonly [string, number]> = [
  ["⚔️ Un monstru răpus", 1], ["🐉 O bătălie cu un boss", 5], ["📜 O misiune zilnică", 3], ["🗝️ O cheie", 2], ["🕯️ Cufărul zilnic deschis", 3], ["💬 Mesajele", 0],
];

export const PLACES = ["🥇 Locul 1", "🥈 Locul 2", "🥉 Locul 3"] as const;

/* ------------------------------------------------------------------ */
/* Bresle                                                              */
/* ------------------------------------------------------------------ */

export type GuildSettings = { enabled: boolean; createCost: number; maxMembers: number };

export const DEFAULT_GUILDS: GuildSettings = { enabled: true, createCost: 5_000, maxMembers: 20 };

export function guildsOf(config: any): GuildSettings {
  return { ...DEFAULT_GUILDS, ...(config?.gameplayConfig?.guilds ?? {}) };
}

/* ------------------------------------------------------------------ */
/* Expediții                                                           */
/* ------------------------------------------------------------------ */

export type ExpeditionSettings = { enabled: boolean; goldPerHour: number; speed: number };

export const DEFAULT_EXPEDITIONS: ExpeditionSettings = { enabled: true, goldPerHour: 120, speed: 1 };

export function expeditionsOf(config: any): ExpeditionSettings {
  return { ...DEFAULT_EXPEDITIONS, ...(config?.gameplayConfig?.expeditions ?? {}) };
}

/** Oboli brought back, as bot/expeditions.ts → expeditionLoot computes them (without the ±10% luck). */
export function expeditionGold(hours: number, companionLevel: number, goldPerHour: number): number {
  return Math.round(goldPerHour * hours * (1 + Math.min(20, Math.max(1, companionLevel) - 1) * 0.1));
}

/* ------------------------------------------------------------------ */
/* Dueluri                                                             */
/* ------------------------------------------------------------------ */

export type DuelSettings = { enabled: boolean; maxBet: number; cooldownSeconds: number; taxPercent: number };

export const DEFAULT_DUELS: DuelSettings = { enabled: true, maxBet: 5_000, cooldownSeconds: 120, taxPercent: 5 };

export function duelsOf(config: any): DuelSettings {
  return { ...DEFAULT_DUELS, ...(config?.gameplayConfig?.duels ?? {}) };
}

/** What the winner takes for a bet, as bot/duels.ts → duelPayout computes it. */
export function duelPayout(bet: number, taxPercent: number): number {
  return Math.floor(bet * 2 * (1 - taxPercent / 100));
}

/* ------------------------------------------------------------------ */
/* Raid                                                                */
/* ------------------------------------------------------------------ */

export type RaidSettings = {
  enabled: boolean; weekday: number; hour: number; durationHours: number; cooldownMinutes: number; hpPerPlayer: number; rewardPool: number; channelId: string;
};

export const DEFAULT_RAID: RaidSettings = {
  enabled: true, weekday: 6, hour: 18, durationHours: 48, cooldownMinutes: 20, hpPerPlayer: 15_000, rewardPool: 50_000, channelId: "",
};

export const RAID_WEEKDAYS: ReadonlyArray<readonly [number, string]> = [[1, "Luni"], [2, "Marți"], [3, "Miercuri"], [4, "Joi"], [5, "Vineri"], [6, "Sâmbătă"], [7, "Duminică"]];

export function raidOf(config: any): RaidSettings {
  return { ...DEFAULT_RAID, ...(config?.gameplayConfig?.raid ?? {}) };
}

/** „Sâmbătă 18:00 → luni 18:00”. */
export function raidWindowText(raid: Pick<RaidSettings, "weekday" | "hour" | "durationHours">): string {
  const startHours = (raid.weekday - 1) * 24 + raid.hour;
  const end = (startHours + raid.durationHours) % (7 * 24);
  const day = (hours: number) => RAID_WEEKDAYS[Math.floor(hours / 24)]![1];
  const clock = (hours: number) => `${String(hours % 24).padStart(2, "0")}:00`;
  return `${day(startHours)} ${clock(startHours)} → ${day(end).toLowerCase()} ${clock(end)}`;
}

/* ------------------------------------------------------------------ */
/* Meniul și verificări                                                */
/* ------------------------------------------------------------------ */

export function gameModuleSummary(id: GameModuleId, config: any): string {
  switch (id) {
    case "state": return config?.gameplayConfig?.paused === false ? "Jocul rulează" : "Jocul e oprit";
    case "channels": return `${gameChannelCount(config)} din ${GAME_CHANNELS.length} canale alese`;
    case "events": {
      const perDay = eventsPerDay(eventsOf(config));
      return `~${perDay.shadowHour.toLocaleString("ro-RO")} Ore ale Umbrelor pe zi`;
    }
    case "missions": return MISSIONS.map((mission) => missionOf(config, mission.key).target).join(" · ");
    case "economy": {
      const economy = economyOf(config);
      return allMultipliersAre(config, 1) ? "Valorile de bază" : ECONOMY_FIELDS.map((field) => multiplierText(economy[field.key])).join(" · ");
    }
    case "guilds": {
      const guilds = guildsOf(config);
      return guilds.enabled ? `${guilds.maxMembers} membri · ${guilds.createCost.toLocaleString("ro-RO")} Oboli` : "Oprite";
    }
    case "expeditions": {
      const expeditions = expeditionsOf(config);
      return expeditions.enabled ? `${expeditions.goldPerHour} Oboli pe oră${expeditions.speed > 1 ? ` · de ${expeditions.speed}× mai repede` : ""}` : "Oprite";
    }
    case "duels": {
      const duels = duelsOf(config);
      return duels.enabled ? (duels.maxBet ? `pariu până la ${duels.maxBet.toLocaleString("ro-RO")}` : "fără pariuri") : "Oprite";
    }
    case "raid": {
      const raid = raidOf(config);
      return raid.enabled ? raidWindowText(raid) : "Oprit";
    }
    case "seasons": {
      const seasons = seasonsOf(config);
      return seasons.enabled ? `🥇 ${seasons.rewards[0].toLocaleString("ro-RO")} Oboli` : "Oprite";
    }
    case "progress": {
      const progress = progressOf(config);
      const parts = [progress.streakEnabled ? `serie până la +${streakLadder(progress, progress.streakMaxDays).at(-1)}%` : null, progress.achievementsEnabled ? "realizări" : null].filter(Boolean);
      return parts.length ? parts.join(" · ") : "Oprite";
    }
  }
}

export function isGameModuleOn(id: GameModuleId, config: any): boolean {
  if (id === "state") return config?.gameplayConfig?.paused === false;
  if (id === "channels") return gameChannelCount(config) > 0;
  if (id === "guilds") return config?.gameplayConfig?.paused === false && guildsOf(config).enabled;
  if (id === "expeditions") return config?.gameplayConfig?.paused === false && expeditionsOf(config).enabled;
  if (id === "duels") return config?.gameplayConfig?.paused === false && duelsOf(config).enabled;
  if (id === "raid") return config?.gameplayConfig?.paused === false && raidOf(config).enabled;
  if (id === "seasons") return config?.gameplayConfig?.paused === false && seasonsOf(config).enabled;
  if (id === "progress") return config?.gameplayConfig?.paused === false && (progressOf(config).streakEnabled || progressOf(config).achievementsEnabled);
  return config?.gameplayConfig?.paused === false;
}

export function gameDraftError(config: any): string | null {
  const messages = config?.gameplayConfig?.messages;
  if (messages && typeof messages.gamePaused === "string" && !messages.gamePaused.trim()) return "Stare — Mesajul cât jocul e oprit nu poate fi gol.";
  if (messages && typeof messages.gamePaused === "string" && messages.gamePaused.length > 2_000) return "Stare — Mesajul cât jocul e oprit are cel mult 2000 de caractere.";
  for (const channel of GAME_CHANNELS) {
    const value = config?.channels?.[channel.key];
    if (value && !isDiscordId(value)) return `Canale — ${channel.label}: „${value}” nu este un ID de canal.`;
  }
  const events = eventsOf(config);
  for (const group of EVENT_FIELDS) {
    for (const field of group.fields) {
      if (!isValidInteger(events[field.key], 1, field.max)) return `Evenimente — ${group.group}, ${field.label}: un număr întreg de minute între 1 și ${field.max}.`;
    }
  }
  if (events.eventCooldownMaxMinutes < events.eventCooldownMinMinutes) return "Evenimente — Ora Umbrelor: pauza maximă trebuie să fie cel puțin cât cea minimă.";
  if (events.standaloneBossIntervalMaxMinutes < events.standaloneBossIntervalMinMinutes) return "Evenimente — Dragonul Stins: intervalul maxim trebuie să fie cel puțin cât cel minim.";
  for (const mission of MISSIONS) {
    const value = missionOf(config, mission.key);
    if (!isValidInteger(value.target, 1, 10_000)) return `Misiuni — ${mission.label}: ținta e un număr întreg între 1 și 10000.`;
    if (!isValidInteger(value.rewardQty, 1, 100)) return `Misiuni — ${mission.label}: recompensa e un număr întreg între 1 și 100.`;
  }
  const progress = progressOf(config);
  if (!isValidInteger(progress.streakBonusPercent, 0, 100)) return "Serii — Bonusul pe zi e un număr întreg între 0 și 100.";
  if (!isValidInteger(progress.streakMaxDays, 1, 30)) return "Serii — Bonusul crește până în ziua: un număr întreg între 1 și 30.";
  const seasons = seasonsOf(config);
  for (const [index, gold] of seasons.rewards.entries()) {
    if (!isValidInteger(gold, 0, 1_000_000)) return `Sezoane — ${PLACES[index]}: Oboli, un număr întreg între 0 și 1000000.`;
  }
  for (const [index, roleId] of seasons.roleIds.entries()) {
    if (roleId && !isDiscordId(roleId)) return `Sezoane — ${PLACES[index]}: „${roleId}” nu este un ID de rol.`;
  }
  if (seasons.channelId && !isDiscordId(seasons.channelId)) return `Sezoane — „${seasons.channelId}” nu este un ID de canal.`;
  const guilds = guildsOf(config);
  if (!isValidInteger(guilds.createCost, 0, 10_000_000)) return "Bresle — Costul unei bresle noi: un număr întreg între 0 și 10000000.";
  if (!isValidInteger(guilds.maxMembers, 2, 200)) return "Bresle — Membri cel mult: un număr întreg între 2 și 200.";
  const expeditions = expeditionsOf(config);
  if (!isValidInteger(expeditions.goldPerHour, 0, 100_000)) return "Expediții — Oboli pe oră: un număr întreg între 0 și 100000.";
  if (!isValidInteger(expeditions.speed, 1, 4)) return "Expediții — Viteza: între 1× și 4×.";
  const duels = duelsOf(config);
  if (!isValidInteger(duels.maxBet, 0, 1_000_000)) return "Dueluri — Pariul maxim: un număr întreg între 0 și 1000000.";
  if (!isValidInteger(duels.cooldownSeconds, 0, 86_400)) return "Dueluri — Pauza dintre dueluri: un număr întreg de secunde între 0 și 86400.";
  if (!isValidInteger(duels.taxPercent, 0, 50)) return "Dueluri — Taxa: un număr întreg între 0 și 50.";
  const raid = raidOf(config);
  const raidLimits: Array<[keyof RaidSettings, string, number, number]> = [
    ["weekday", "Ziua", 1, 7], ["hour", "Ora", 0, 23], ["durationHours", "Cât stă", 1, 144], ["cooldownMinutes", "Pauza dintre lovituri", 1, 1_440],
    ["hpPerPlayer", "Viață pe jucător activ", 100, 10_000_000], ["rewardPool", "Prada", 0, 10_000_000],
  ];
  for (const [key, label, min, max] of raidLimits) {
    if (!isValidInteger(raid[key], min, max)) return `Raid — ${label}: un număr întreg între ${min} și ${max}.`;
  }
  if (raid.channelId && !isDiscordId(raid.channelId)) return `Raid — „${raid.channelId}” nu este un ID de canal.`;
  const economy = economyOf(config);
  for (const field of ECONOMY_FIELDS) {
    if (!isValidMultiplier(economy[field.key])) return `Economie — ${field.label}: între ${MIN_MULTIPLIER} și ${MAX_MULTIPLIER}.`;
  }
  return null;
}
