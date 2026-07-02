import { loadChannelConfig, saveChannelConfig, type ChannelConfig } from "./db";

// Default channel IDs — used as fallback when no custom config is stored.
const DEFAULT_CHANNELS: Required<ChannelConfig> = {
  main:       "1382042144717410385",
  event:      "1521185682200989726",
  boss:       "1521186913476673556",
  trader:     "1521418965732036628",
  eventTop:   "1521185741961695434",
  bossTop:    "1521186981525327993",
};

let cached: ChannelConfig | null = null;

/** Load the persisted channel configuration (or null if none exists). */
export async function initChannelConfig(): Promise<void> {
  cached = await loadChannelConfig();
}

/** Get the configured channel ID for an event type, falling back to the default. */
export function getChannel(type: keyof ChannelConfig): string {
  return cached?.[type] ?? DEFAULT_CHANNELS[type];
}

/** Set a single channel and persist immediately. */
export async function setChannel(type: keyof ChannelConfig, channelId: string): Promise<void> {
  const cfg: ChannelConfig = { ...(cached ?? {}), [type]: channelId };
  await saveChannelConfig(cfg);
  cached = cfg;
}

/** Return the full current configuration (defaults merged in). */
export function getAllChannels(): Required<ChannelConfig> {
  return { ...DEFAULT_CHANNELS, ...(cached ?? {}) };
}

/** Reset one channel back to its default. */
export async function resetChannel(type: keyof ChannelConfig): Promise<void> {
  const cfg: ChannelConfig = { ...(cached ?? {}) };
  delete cfg[type];
  await saveChannelConfig(Object.keys(cfg).length ? cfg : {});
  cached = Object.keys(cfg).length ? cfg : null;
}

/** Reset every channel back to default. */
export async function resetAllChannels(): Promise<void> {
  await saveChannelConfig({});
  cached = null;
}

/** Human-readable Romanian labels for each event type. */
export const EVENT_LABELS: Record<keyof ChannelConfig, string> = {
  main:     "Cufere și Oracol",
  event:    "Ora Umbrelor",
  boss:     "Dragonul Stins",
  trader:   "Negustorul (Forja Cenușii)",
  eventTop: "Top Ora Umbrelor",
  bossTop:  "Top Dragonul Stins",
};

export type EventType = keyof ChannelConfig;
