import {
  PermissionFlagsBits,
  TextChannel,
  type Client,
} from "discord.js";
import { logger } from "../lib/logger";
import {
  loadHauntedHouseConfig,
  loadHauntedHouseSchedule,
  saveHauntedHouseSchedule,
  type HauntedHouseScheduleState,
} from "./db";
import {
  beginHauntedHouseStop,
  buildHauntedHouseOpenAnnouncement,
  cancelHauntedHouseStop,
  completeHauntedHouseStop,
  generateScheduledGhostStory,
  getHauntedHouseExpiry,
  isHauntedHouseActive,
  publishHauntedHouseLeaderboard,
  startHauntedHouse,
  stopHauntedHouse,
} from "./haunted-house";

const TICK_MS = 30_000;
const EVENT_MS = 10 * 60_000;
const STORY_MS = 2 * 60 * 60_000;
const MIN_BREAK_MS = 2 * 60 * 60_000;
const MAX_BREAK_MS = 4 * 60 * 60_000;
const timers = new Map<string, ReturnType<typeof setInterval>>();
const busy = new Set<string>();
const schedules = new Map<string, HauntedHouseScheduleState>();
const wasOpen = new Map<string, boolean>();

function nextBreak(now: number): number {
  return now + MIN_BREAK_MS + Math.floor(Math.random() * (MAX_BREAK_MS - MIN_BREAK_MS + 1));
}

async function getTextChannel(client: Client, guildId: string, channelId: string): Promise<TextChannel | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) return null;
  const member = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!member || !channel.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return null;
  return channel;
}

async function tick(client: Client, guildId: string): Promise<void> {
  if (busy.has(guildId)) return;
  busy.add(guildId);
  try {
    const config = await loadHauntedHouseConfig(guildId);
    let schedule = schedules.get(guildId) ?? await loadHauntedHouseSchedule(guildId);
    const now = Date.now();
    if (!schedule) {
      schedule = { nextStartAt: nextBreak(now), nextStoryAt: now + STORY_MS };
      await saveHauntedHouseSchedule(guildId, schedule);
    }
    schedules.set(guildId, schedule);
    const hasOpenSession = getHauntedHouseExpiry(guildId) !== null;
    if (wasOpen.get(guildId) === true && !hasOpenSession) {
      schedule.nextStartAt = nextBreak(now);
      await saveHauntedHouseSchedule(guildId, schedule);
    }
    wasOpen.set(guildId, hasOpenSession);

    if (getHauntedHouseExpiry(guildId) !== null && (getHauntedHouseExpiry(guildId) ?? Infinity) <= now) {
      const closing = beginHauntedHouseStop(guildId);
      if (closing) {
        if (!config.leaderboardChannelId) {
          logger.warn({ guildId }, "Haunted House ended but final leaderboard channel is unavailable; scores retained");
          cancelHauntedHouseStop(guildId, closing.sessionId);
          return;
        }
        try {
          await publishHauntedHouseLeaderboard(client, guildId, closing.sessionId, true);
          completeHauntedHouseStop(guildId, closing.sessionId);
          schedule.nextStartAt = nextBreak(now);
          schedules.set(guildId, schedule);
          wasOpen.set(guildId, false);
          await saveHauntedHouseSchedule(guildId, schedule);
          logger.info({ guildId, nextStartAt: schedule.nextStartAt }, "Haunted House closed; next opening scheduled");
        } catch (error) {
          cancelHauntedHouseStop(guildId, closing.sessionId);
          logger.warn({ err: error, guildId }, "Haunted House final leaderboard failed; event remains open for retry");
        }
      }
    } else if (!isHauntedHouseActive(guildId) && schedule.nextStartAt <= now) {
      const [startChannel, leaderboardChannel, chatChannel] = await Promise.all([
        config.startChannelId ? getTextChannel(client, guildId, config.startChannelId) : null,
        config.leaderboardChannelId ? getTextChannel(client, guildId, config.leaderboardChannelId) : null,
        config.chatChannelId ? getTextChannel(client, guildId, config.chatChannelId) : null,
      ]);
      if (!startChannel || !leaderboardChannel || !chatChannel) {
        logger.warn({ guildId }, "Haunted House auto-start waiting for valid start, leaderboard, and chat channels");
        schedule.nextStartAt = now + 5 * 60_000;
        await saveHauntedHouseSchedule(guildId, schedule);
      } else if (startHauntedHouse(guildId, now, EVENT_MS)) {
        schedule.nextStartAt = now + EVENT_MS + (2 * 60 * 60_000) + Math.floor(Math.random() * (2 * 60 * 60_000 + 1));
        await saveHauntedHouseSchedule(guildId, schedule);
        wasOpen.set(guildId, true);
        try {
          await startChannel.send(buildHauntedHouseOpenAnnouncement(guildId));
        } catch (error) {
          stopHauntedHouse(guildId);
          wasOpen.set(guildId, false);
          schedule.nextStartAt = now + 5 * 60_000;
          await saveHauntedHouseSchedule(guildId, schedule);
          logger.error({ err: error, guildId }, "Haunted House opening announcement failed; retry scheduled");
          return;
        }
        logger.info({ guildId, expiresAt: now + EVENT_MS }, "Haunted House auto-started");
      }
    }

    if (schedule.nextStoryAt <= now) {
      if (!config.chatChannelId) {
        logger.warn({ guildId }, "Haunted House AI story skipped: chat channel is not configured");
        schedule.nextStoryAt = now + STORY_MS;
      } else {
        const channel = await getTextChannel(client, guildId, config.chatChannelId);
        if (channel) {
          const story = await generateScheduledGhostStory();
          await channel.send({ content: `👻 **Șoapta casei:** ${story}`, allowedMentions: { parse: [] } });
          schedule.nextStoryAt = now + STORY_MS;
        } else {
          logger.warn({ guildId, channelId: config.chatChannelId }, "Haunted House AI story chat channel unavailable; retrying soon");
          schedule.nextStoryAt = now + 5 * 60_000;
        }
      }
      schedules.set(guildId, schedule);
      await saveHauntedHouseSchedule(guildId, schedule);
    }
  } catch (error) {
    logger.warn({ err: error, guildId }, "Haunted House scheduler tick failed");
  } finally {
    busy.delete(guildId);
  }
}

export function startHauntedHouseScheduler(client: Client, guildId: string): void {
  if (timers.has(guildId)) return;
  void tick(client, guildId);
  const timer = setInterval(() => void tick(client, guildId), TICK_MS);
  timer.unref?.();
  timers.set(guildId, timer);
}

export function stopHauntedHouseScheduler(guildId: string): void {
  const timer = timers.get(guildId);
  if (timer) clearInterval(timer);
  timers.delete(guildId);
  schedules.delete(guildId);
  wasOpen.delete(guildId);
}
