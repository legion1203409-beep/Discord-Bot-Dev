import { loadChannelConfig, saveChannelConfig, type ChannelConfig } from "./db";

// Default channel IDs — used as fallback when no custom config is stored.
// These defaults are only meaningful for the original guild; new guilds should
// always configure their own channels via /setcanal.
const DEFAULT_CHANNELS: Required<ChannelConfig> = {
  main:       "1382042144717410385",
  event:      "1521185682200989726",
  boss:       "1521186913476673556",
  trader:     "1521418965732036628",
  eventTop:   "1521185741961695434",
  bossTop:    "1521186981525327993",
  council:    "",
  fratia:     "",
};

const ORIGINAL_GUILD_ID = "1382035307607883816";

// Per-guild channel config cache. Populated lazily on first getChannel call.
const cachedByGuild = new Map<string, ChannelConfig | null>();

/** Load the persisted channel configuration for a guild into the cache. */
export async function initChannelConfig(guildId: string): Promise<void> {
  const cfg = await loadChannelConfig(guildId);
  cachedByGuild.set(guildId, cfg);
}

/**
 * Get the configured channel ID for a type.
 * A missing value may use the original guild's legacy defaults; an explicit
 * empty string means the owner has disabled this destination. Callers should
 * use a truthy guard before sending so both null and an explicit clear skip.
 */
export function getChannel(type: keyof ChannelConfig, guildId: string): string | null {
  const cached = cachedByGuild.get(guildId);
  if (cached && Object.prototype.hasOwnProperty.call(cached, type)) {
    return cached[type] ?? "";
  }
  // Community votes require their own explicitly configured destination.
  // Apply hardcoded defaults only for the original guild.
  if (guildId === ORIGINAL_GUILD_ID) return DEFAULT_CHANNELS[type];
  // Other guilds must configure channels via /setcanal before the bot acts.
  return null;
}

/** Set a single channel for a guild and persist immediately. */
export async function setChannel(guildId: string, type: keyof ChannelConfig, channelId: string): Promise<void> {
  const cfg: ChannelConfig = { ...(cachedByGuild.get(guildId) ?? {}), [type]: channelId };
  await saveChannelConfig(guildId, cfg);
  cachedByGuild.set(guildId, cfg);
}

/** Return the full current configuration for a guild (defaults merged in). */
export function getAllChannels(guildId: string): Required<ChannelConfig> {
  return Object.fromEntries(
    (Object.keys(DEFAULT_CHANNELS) as Array<keyof ChannelConfig>)
      .map((type) => [type, getChannel(type, guildId) ?? ""]),
  ) as Required<ChannelConfig>;
}

/**
 * Returns true when at least one effective destination is available. The
 * original guild's legacy defaults count only when they were not explicitly cleared.
 */
export function hasAnyChannelConfigured(guildId: string): boolean {
  return (Object.keys(DEFAULT_CHANNELS) as Array<keyof ChannelConfig>)
    .some((type) => Boolean(getChannel(type, guildId)));
}

/** Reset one channel back to its default for a guild. */
export async function resetChannel(guildId: string, type: keyof ChannelConfig): Promise<void> {
  const cfg: ChannelConfig = { ...(cachedByGuild.get(guildId) ?? {}) };
  delete cfg[type];
  await saveChannelConfig(guildId, Object.keys(cfg).length ? cfg : {});
  cachedByGuild.set(guildId, Object.keys(cfg).length ? cfg : null);
}

/** Reset every channel back to default for a guild. */
export async function resetAllChannels(guildId: string): Promise<void> {
  await saveChannelConfig(guildId, {});
  cachedByGuild.set(guildId, null);
}

/** Human-readable Romanian labels for each event type. */
export const EVENT_LABELS: Record<keyof ChannelConfig, string> = {
  main:     "Cufere",
  event:    "Ora Umbrelor",
  boss:     "Dragonul Stins",
  trader:   "Negustorul (Forja Cenușii)",
  eventTop: "Top Ora Umbrelor",
  bossTop:  "Top Dragonul Stins",
  council:  "Consiliul Umbrelor",
  fratia:   "Chivotul Frăției",
};

export type EventType = keyof ChannelConfig;
