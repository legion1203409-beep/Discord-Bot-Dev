import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../lib/logger";
import {
  EVENT_DEFS,
  randomEventType,
  buildEventEmbed,
  buildEventRow,
  buildExpiredEmbed,
} from "./events";
import {
  createEvent,
  deactivateEvent,
  getExpiredActiveEvents,
} from "./db";

const CHANNEL_ID = "1472579703457190042";
const MAIN_CHANNEL_ID = "1382042144717410385";
const EVENT_DURATION_MS = 60 * 60 * 1000;
const MIN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const MAX_COOLDOWN_MS = 4 * 60 * 60 * 1000;

function randomCooldown() {
  return Math.floor(Math.random() * (MAX_COOLDOWN_MS - MIN_COOLDOWN_MS + 1)) + MIN_COOLDOWN_MS;
}

async function expireOldEvents(client: Client) {
  const expired = await getExpiredActiveEvents();
  for (const ev of expired) {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (channel instanceof TextChannel) {
        const msg = await channel.messages.fetch(ev.messageId).catch(() => null);
        if (msg) {
          const def = EVENT_DEFS[ev.eventType as keyof typeof EVENT_DEFS];
          if (def) {
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`expired_${ev.id}`)
                .setLabel("Eveniment încheiat")
                .setEmoji("⌛")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            );
            await msg.edit({ embeds: [buildExpiredEmbed(def)], components: [disabledRow] });
          }
        }
      }
      await deactivateEvent(ev.id);
      logger.info({ eventId: ev.id }, "Event expired");
    } catch (err) {
      logger.error({ err, eventId: ev.id }, "Failed to expire event");
    }
  }
}

async function fireEvent(client: Client) {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!(channel instanceof TextChannel)) {
      logger.error({ channelId: CHANNEL_ID }, "Event channel not found or not a text channel");
      return;
    }

    const type = randomEventType();
    const def = EVENT_DEFS[type];
    const expiresAt = new Date(Date.now() + EVENT_DURATION_MS);

    const placeholder = await channel.send({ content: "🔥 *Un eveniment se apropie…*" });

    const ev = await createEvent(type, placeholder.id, expiresAt);

    const embed = buildEventEmbed(def);
    const row = buildEventRow(ev.id, def);
    await placeholder.edit({ content: "", embeds: [embed], components: [row] });

    try {
      const mainChannel = await client.channels.fetch(MAIN_CHANNEL_ID);
      if (mainChannel instanceof TextChannel) {
        await mainChannel.send(
          `⚔️ 📜 **Decret al Curții Cenușii – Eveniment Activ**\n\nUmbrele s‑au mișcat, iar cenușa s‑a ridicat din adâncuri.\nUn nou eveniment a fost declanșat în Regat — semnele se schimbă, iar destinul se scrie din nou.\n\n➡️ <#${CHANNEL_ID}>`,
        );
      }
    } catch (err) {
      logger.error({ err }, "Failed to send main channel notification");
    }

    logger.info({ type, eventId: ev.id }, "Event fired");
  } catch (err) {
    logger.error({ err }, "Failed to fire event");
  }
}

export function startScheduler(client: Client) {
  setInterval(() => expireOldEvents(client), 60 * 1000);

  const scheduleNext = () => {
    const cooldown = randomCooldown();
    const hours = (cooldown / 3600000).toFixed(2);
    logger.info({ nextEventInHours: hours }, "Next event scheduled");
    setTimeout(async () => {
      await fireEvent(client);
      scheduleNext();
    }, cooldown);
  };

  const firstDelay = 5 * 60 * 1000;
  logger.info("First event in 5 minutes");
  setTimeout(async () => {
    await fireEvent(client);
    scheduleNext();
  }, firstDelay);
}
