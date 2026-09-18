import { loadGameplayConfig, saveGameplayConfig } from "./db";
import {
  DEFAULT_GAMEPLAY_CONFIG,
  normalizeGameplayConfig,
  type GameplayConfig,
} from "./gameplay-config";

const cachedByGuild = new Map<string, GameplayConfig>();

export async function initGameplayConfig(guildId: string): Promise<void> {
  const stored = await loadGameplayConfig(guildId);
  cachedByGuild.set(guildId, normalizeGameplayConfig(stored ?? DEFAULT_GAMEPLAY_CONFIG));
}

export function getGameplayConfig(guildId: string): GameplayConfig {
  return cachedByGuild.get(guildId) ?? DEFAULT_GAMEPLAY_CONFIG;
}

export async function saveGuildGameplayConfig(guildId: string, value: unknown): Promise<GameplayConfig> {
  const config = normalizeGameplayConfig(value);
  await saveGameplayConfig(guildId, config);
  cachedByGuild.set(guildId, config);
  return config;
}

export { DEFAULT_GAMEPLAY_CONFIG };
export type { GameplayConfig };