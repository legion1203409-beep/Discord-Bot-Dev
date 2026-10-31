import { normalizeMessageImageUrl } from "./message-media";

export type MemberMessageStyle = "medieval" | "normal" | "fantasy" | "sci_fi" | "humorous" | "custom";

export interface GameplayConfig {
  paused: boolean;
  messages: {
    gamePaused: string;
    oraclePaused: string;
    gamePausedImageUrl: string;
    gamePausedThumbnailUrl: string;
    oraclePausedImageUrl: string;
    oraclePausedThumbnailUrl: string;
  };
  memberMessages: {
    welcomeEnabled: boolean;
    leaveEnabled: boolean;
    channelId: string;
    style: MemberMessageStyle;
    customStyle: string;
  };
  events: {
    eventDurationMinutes: number;
    eventCooldownMinMinutes: number;
    eventCooldownMaxMinutes: number;
    finalBossDurationMinutes: number;
    standaloneBossIntervalMinMinutes: number;
    standaloneBossIntervalMaxMinutes: number;
    standaloneBossDurationMinutes: number;
    battleEventIntervalMinutes: number;
    chestIntervalMinutes: number;
    chestExpireMinutes: number;
  };
  missions: {
    kill_10: { target: number; rewardQty: number };
    rare_3: { target: number; rewardQty: number };
    boss_1: { target: number; rewardQty: number };
  };
  economy: {
    monsterGoldMultiplier: number;
    monsterXpMultiplier: number;
    bossGoldMultiplier: number;
    bossXpMultiplier: number;
  };
  /** Daily streak and achievements (bot/progress.ts). */
  progress: {
    streakEnabled: boolean;
    /** Extra Oboli and XP from the daily chest for each day of the streak after the first. */
    streakBonusPercent: number;
    /** The bonus stops growing after this many days. */
    streakMaxDays: number;
    /** An epic key on every 7th day of the streak. */
    weeklyKey: boolean;
    achievementsEnabled: boolean;
    /** Unlocking an achievement pays its Oboli. */
    achievementRewards: boolean;
  };
  /** Monthly seasons (bot/seasons.ts). */
  seasons: {
    enabled: boolean;
    /** Oboli for the 1st, 2nd and 3rd place. */
    rewards: [number, number, number];
    /** Optional roles for the 1st, 2nd and 3rd place, moved to the new winners each month. */
    roleIds: [string, string, string];
    /** Where the result is announced; empty: Top Ora Umbrelor. */
    channelId: string;
  };
  /** The weekly raid (bot/raid.ts). */
  raid: {
    enabled: boolean;
    /** 1 = Monday … 7 = Sunday, in Romania's time. */
    weekday: number;
    hour: number;
    durationHours: number;
    cooldownMinutes: number;
    hpPerPlayer: number;
    rewardPool: number;
    /** Where the titan appears; empty: Dragonul Stins' channel. */
    channelId: string;
  };
}

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  // New/unconfigured guilds require explicit activation from the dashboard.
  // Persisted legacy configs without this field remain active in normalization.
  paused: true,
  messages: {
    gamePaused: "⏸️ Jocul este oprit momentan. Un administrator îl poate reporni cu `/startjoc`.",
    oraclePaused: "🛑 Oracle AI este oprit momentan. Un administrator îl poate reporni cu `/startai`.",
    gamePausedImageUrl: "",
    gamePausedThumbnailUrl: "",
    oraclePausedImageUrl: "",
    oraclePausedThumbnailUrl: "",
  },
  memberMessages: {
    welcomeEnabled: false,
    leaveEnabled: false,
    channelId: "",
    style: "normal",
    customStyle: "",
  },
  events: {
    eventDurationMinutes: 60,
    eventCooldownMinMinutes: 10,
    eventCooldownMaxMinutes: 120,
    finalBossDurationMinutes: 30,
    standaloneBossIntervalMinMinutes: 30,
    standaloneBossIntervalMaxMinutes: 60,
    standaloneBossDurationMinutes: 60,
    battleEventIntervalMinutes: 7,
    chestIntervalMinutes: 60,
    chestExpireMinutes: 20,
  },
  missions: {
    kill_10: { target: 10, rewardQty: 1 },
    rare_3: { target: 3, rewardQty: 2 },
    boss_1: { target: 1, rewardQty: 1 },
  },
  economy: {
    monsterGoldMultiplier: 1,
    monsterXpMultiplier: 1,
    bossGoldMultiplier: 1,
    bossXpMultiplier: 1,
  },
  progress: {
    streakEnabled: true,
    streakBonusPercent: 10,
    streakMaxDays: 7,
    weeklyKey: true,
    achievementsEnabled: true,
    achievementRewards: true,
  },
  seasons: {
    enabled: true,
    rewards: [10_000, 5_000, 2_500],
    roleIds: ["", "", ""],
    channelId: "",
  },
  raid: {
    enabled: true,
    weekday: 6,
    hour: 18,
    durationHours: 48,
    cooldownMinutes: 20,
    hpPerPlayer: 15_000,
    rewardPool: 50_000,
    channelId: "",
  },
};

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function multiplier(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function message(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 2_000) : fallback;
}

export function normalizeGameplayConfig(value: unknown): GameplayConfig {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const messages = input.messages && typeof input.messages === "object" ? input.messages as Record<string, unknown> : {};
  const memberMessages = input.memberMessages && typeof input.memberMessages === "object"
    ? input.memberMessages as Record<string, unknown>
    : {};
  const events = input.events && typeof input.events === "object" ? input.events as Record<string, unknown> : {};
  const missions = input.missions && typeof input.missions === "object" ? input.missions as Record<string, unknown> : {};
  const economy = input.economy && typeof input.economy === "object" ? input.economy as Record<string, unknown> : {};
  const mission = (key: keyof GameplayConfig["missions"]) => {
    const current = missions[key];
    const defaults = DEFAULT_GAMEPLAY_CONFIG.missions[key];
    const record = current && typeof current === "object" ? current as Record<string, unknown> : {};
    return {
      target: positiveInt(record.target, defaults.target),
      rewardQty: positiveInt(record.rewardQty, defaults.rewardQty),
    };
  };
  const validStyles: MemberMessageStyle[] = ["medieval", "normal", "fantasy", "sci_fi", "humorous", "custom"];
  const style = typeof memberMessages.style === "string" && validStyles.includes(memberMessages.style as MemberMessageStyle)
    ? memberMessages.style as MemberMessageStyle
    : DEFAULT_GAMEPLAY_CONFIG.memberMessages.style;
  const rawChannelId = typeof memberMessages.channelId === "string" ? memberMessages.channelId.trim() : "";

  return {
    paused: input.paused === true,
    messages: {
      gamePaused: message(messages.gamePaused, DEFAULT_GAMEPLAY_CONFIG.messages.gamePaused),
      oraclePaused: message(messages.oraclePaused, DEFAULT_GAMEPLAY_CONFIG.messages.oraclePaused),
      gamePausedImageUrl: normalizeMessageImageUrl(messages.gamePausedImageUrl),
      gamePausedThumbnailUrl: normalizeMessageImageUrl(messages.gamePausedThumbnailUrl),
      oraclePausedImageUrl: normalizeMessageImageUrl(messages.oraclePausedImageUrl),
      oraclePausedThumbnailUrl: normalizeMessageImageUrl(messages.oraclePausedThumbnailUrl),
    },
    memberMessages: {
      welcomeEnabled: memberMessages.welcomeEnabled === true,
      leaveEnabled: memberMessages.leaveEnabled === true,
      channelId: /^\d{5,25}$/.test(rawChannelId) ? rawChannelId : "",
      style,
      customStyle: typeof memberMessages.customStyle === "string" ? memberMessages.customStyle.trim().slice(0, 180) : "",
    },
    events: {
      eventDurationMinutes: positiveInt(events.eventDurationMinutes, DEFAULT_GAMEPLAY_CONFIG.events.eventDurationMinutes),
      eventCooldownMinMinutes: positiveInt(events.eventCooldownMinMinutes, DEFAULT_GAMEPLAY_CONFIG.events.eventCooldownMinMinutes),
      eventCooldownMaxMinutes: positiveInt(events.eventCooldownMaxMinutes, DEFAULT_GAMEPLAY_CONFIG.events.eventCooldownMaxMinutes),
      finalBossDurationMinutes: positiveInt(events.finalBossDurationMinutes, DEFAULT_GAMEPLAY_CONFIG.events.finalBossDurationMinutes),
      standaloneBossIntervalMinMinutes: positiveInt(events.standaloneBossIntervalMinMinutes, DEFAULT_GAMEPLAY_CONFIG.events.standaloneBossIntervalMinMinutes),
      standaloneBossIntervalMaxMinutes: positiveInt(events.standaloneBossIntervalMaxMinutes, DEFAULT_GAMEPLAY_CONFIG.events.standaloneBossIntervalMaxMinutes),
      standaloneBossDurationMinutes: positiveInt(events.standaloneBossDurationMinutes, DEFAULT_GAMEPLAY_CONFIG.events.standaloneBossDurationMinutes),
      battleEventIntervalMinutes: positiveInt(events.battleEventIntervalMinutes, DEFAULT_GAMEPLAY_CONFIG.events.battleEventIntervalMinutes),
      chestIntervalMinutes: positiveInt(events.chestIntervalMinutes, DEFAULT_GAMEPLAY_CONFIG.events.chestIntervalMinutes),
      chestExpireMinutes: positiveInt(events.chestExpireMinutes, DEFAULT_GAMEPLAY_CONFIG.events.chestExpireMinutes),
    },
    missions: {
      kill_10: mission("kill_10"),
      rare_3: mission("rare_3"),
      boss_1: mission("boss_1"),
    },
    economy: {
      monsterGoldMultiplier: multiplier(economy.monsterGoldMultiplier, DEFAULT_GAMEPLAY_CONFIG.economy.monsterGoldMultiplier),
      monsterXpMultiplier: multiplier(economy.monsterXpMultiplier, DEFAULT_GAMEPLAY_CONFIG.economy.monsterXpMultiplier),
      bossGoldMultiplier: multiplier(economy.bossGoldMultiplier, DEFAULT_GAMEPLAY_CONFIG.economy.bossGoldMultiplier),
      bossXpMultiplier: multiplier(economy.bossXpMultiplier, DEFAULT_GAMEPLAY_CONFIG.economy.bossXpMultiplier),
    },
    progress: normalizeProgress(input.progress),
    seasons: normalizeSeasons(input.seasons),
    raid: normalizeRaid(input.raid),
  };
}

function normalizeRaid(value: unknown): GameplayConfig["raid"] {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const defaults = DEFAULT_GAMEPLAY_CONFIG.raid;
  const channel = typeof input.channelId === "string" && /^\d{5,25}$/.test(input.channelId.trim()) ? input.channelId.trim() : "";
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    weekday: boundedInt(input.weekday, defaults.weekday, 1, 7),
    hour: boundedInt(input.hour, defaults.hour, 0, 23),
    durationHours: boundedInt(input.durationHours, defaults.durationHours, 1, 144),
    cooldownMinutes: boundedInt(input.cooldownMinutes, defaults.cooldownMinutes, 1, 1_440),
    hpPerPlayer: boundedInt(input.hpPerPlayer, defaults.hpPerPlayer, 100, 10_000_000),
    rewardPool: boundedInt(input.rewardPool, defaults.rewardPool, 0, 10_000_000),
    channelId: channel,
  };
}

function normalizeSeasons(value: unknown): GameplayConfig["seasons"] {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const defaults = DEFAULT_GAMEPLAY_CONFIG.seasons;
  const rewards = Array.isArray(input.rewards) ? input.rewards : [];
  const roles = Array.isArray(input.roleIds) ? input.roleIds : [];
  const id = (raw: unknown) => typeof raw === "string" && /^\d{5,25}$/.test(raw.trim()) ? raw.trim() : "";
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    rewards: [0, 1, 2].map((index) => boundedInt(rewards[index], defaults.rewards[index]!, 0, 1_000_000)) as [number, number, number],
    roleIds: [0, 1, 2].map((index) => id(roles[index])) as [string, string, string],
    channelId: id(input.channelId),
  };
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

function normalizeProgress(value: unknown): GameplayConfig["progress"] {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const defaults = DEFAULT_GAMEPLAY_CONFIG.progress;
  const flag = (key: keyof typeof defaults) => typeof input[key] === "boolean" ? input[key] as boolean : defaults[key] as boolean;
  return {
    streakEnabled: flag("streakEnabled"),
    streakBonusPercent: boundedInt(input.streakBonusPercent, defaults.streakBonusPercent, 0, 100),
    streakMaxDays: boundedInt(input.streakMaxDays, defaults.streakMaxDays, 1, 30),
    weeklyKey: flag("weeklyKey"),
    achievementsEnabled: flag("achievementsEnabled"),
    achievementRewards: flag("achievementRewards"),
  };
}