export interface GameplayConfig {
  paused: boolean;
  messages: {
    gamePaused: string;
    oraclePaused: string;
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
}

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  paused: false,
  messages: {
    gamePaused: "⏸️ Jocul este oprit momentan. Un administrator îl poate reporni cu `/startjoc`.",
    oraclePaused: "🛑 Oracle AI este oprit momentan. Un administrator îl poate reporni cu `/startai`.",
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

  return {
    paused: input.paused === true,
    messages: {
      gamePaused: message(messages.gamePaused, DEFAULT_GAMEPLAY_CONFIG.messages.gamePaused),
      oraclePaused: message(messages.oraclePaused, DEFAULT_GAMEPLAY_CONFIG.messages.oraclePaused),
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
  };
}