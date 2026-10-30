/**
 * Profeția zilei: o dată pe zi, la ora aleasă din panou (în fusul orar ales),
 * Oracolul postează o profeție pentru tot serverul în canalul ales. Ziua
 * ultimei profeții se ține în baza de date, ca o repornire să nu o dubleze.
 */
import { EmbedBuilder, type Client } from "discord.js";
import { logger } from "../lib/logger";
import { loadDailyProphecyDate, saveDailyProphecyDate } from "./db";
import { getCurrentMood, isOracleEnabled } from "./oracle";
import { generateDailyProphecy } from "./oracle-chat";
import { PROPHECY_FLAVOR } from "./oracle-content";
import { getOracleSettings, localDayAndHour } from "./oracle-settings";

const CHECK_EVERY_MS = 60_000;
const postedDay = new Map<string, string>();
const posting = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

/** Whether a server is due for its daily prophecy now, from its settings and the last day it got one. */
export function isDailyProphecyDue(
  settings: ReturnType<typeof getOracleSettings>,
  lastDay: string | null | undefined,
  now: Date,
): { due: boolean; day: string } {
  const daily = settings.prophecy.daily;
  const { day, hour } = localDayAndHour(now, daily.timeZone);
  return { due: settings.enabled && daily.enabled && Boolean(daily.channelId) && hour === daily.hour && lastDay !== day, day };
}

async function postDailyProphecy(client: Client, guildId: string, channelId: string, day: string): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel) || ("guildId" in channel && channel.guildId !== guildId)) {
    logger.warn({ guildId, channelId }, "Daily prophecy channel is not a text channel of this server");
    postedDay.set(guildId, day);
    return;
  }
  const text = await generateDailyProphecy(getCurrentMood(guildId)).catch((err) => {
    logger.warn({ err, guildId }, "Daily prophecy generation failed; using a written one");
    return null;
  }) ?? PROPHECY_FLAVOR[Math.floor(Math.random() * PROPHECY_FLAVOR.length)]!;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x8f5bff).setTitle("🔮 Profeția zilei").setDescription(text.slice(0, 4_000))],
    allowedMentions: { parse: [] },
  });
  postedDay.set(guildId, day);
  await saveDailyProphecyDate(guildId, day);
  logger.info({ guildId, channelId, day }, "Daily prophecy posted");
}

export async function checkDailyProphecies(client: Client, now = new Date()): Promise<void> {
  for (const guildId of client.guilds.cache.keys()) {
    if (posting.has(guildId) || !isOracleEnabled(guildId)) continue;
    const settings = getOracleSettings(guildId);
    if (!isDailyProphecyDue(settings, postedDay.get(guildId), now).due) continue;
    posting.add(guildId);
    try {
      const stored = await loadDailyProphecyDate(guildId);
      const { due, day } = isDailyProphecyDue(settings, stored, now);
      if (!due) {
        if (stored) postedDay.set(guildId, stored);
        continue;
      }
      await postDailyProphecy(client, guildId, settings.prophecy.daily.channelId, day);
    } catch (err) {
      logger.warn({ err, guildId }, "Daily prophecy could not be posted");
    } finally {
      posting.delete(guildId);
    }
  }
}

export function startDailyProphecyScheduler(client: Client): void {
  if (timer) return;
  timer = setInterval(() => { void checkDailyProphecies(client); }, CHECK_EVERY_MS);
  timer.unref?.();
}
