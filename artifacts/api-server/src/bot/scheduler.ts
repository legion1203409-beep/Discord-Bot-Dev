import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../lib/logger";
import { buildStartEmbed, buildExpiredCronica, buildChestEmbed } from "./survival";
import { createEvent, deactivateEvent, getExpiredActiveEvents, getEventParticipants, getAllEvents, setEventDecreeMessage, deleteEvent } from "./db";

const EVENT_CHANNEL_ID = "1472579703457190042";
const MAIN_CHANNEL_ID = "1382042144717410385";
const APPLICATION_ID = "1472675543777280071";
const EVENT_DURATION_MS = 60 * 60 * 1000;
const MIN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const MAX_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const CHEST_INTERVAL_MS = 30 * 60 * 1000;
const CHEST_EXPIRE_MS = 10 * 60 * 1000;

export const claimedChests = new Set<string>();

let lastChestMessageId: string | null = null;

function randomCooldown() {
  return Math.floor(Math.random() * (MAX_COOLDOWN_MS - MIN_COOLDOWN_MS + 1)) + MIN_COOLDOWN_MS;
}


async function expireOldEvents(client: Client) {
  const expired = await getExpiredActiveEvents();
  for (const ev of expired) {
    try {
      const channel = await client.channels.fetch(EVENT_CHANNEL_ID);
      if (channel instanceof TextChannel) {
        const msg = await channel.messages.fetch(ev.messageId).catch(() => null);
        if (msg) {
          const participants = await getEventParticipants(ev.id);
          const survivors = participants.filter((p) => p.isAlive);
          const fled = participants.filter((p) => !p.isAlive && p.fled);
          const fallen = participants.filter((p) => !p.isAlive && !p.fled);
          const cronica = buildExpiredCronica(survivors, fallen, fled);
          const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`expired_${ev.id}`)
              .setLabel("Ora Umbrelor s-a încheiat")
              .setEmoji("⌛")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
          await msg.edit({ embeds: [cronica], components: [disabledRow] });
        }
      }
      await deactivateEvent(ev.id);
      logger.info({ eventId: ev.id }, "Event expired");
    } catch (err) {
      logger.error({ err, eventId: ev.id }, "Failed to expire event");
    }
  }
}

export async function fireChest(client: Client) {
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) return;

    if (lastChestMessageId) {
      const old = await channel.messages.fetch(lastChestMessageId).catch(() => null);
      if (old) await old.delete().catch(() => null);
      lastChestMessageId = null;
    }

    const gold = Math.floor(Math.random() * 91) + 10;
    const chestId = `chest_${Date.now()}`;
    const expireAt = Date.now() + CHEST_EXPIRE_MS;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("Revendică Cufărul")
        .setEmoji("📦")
        .setStyle(ButtonStyle.Success),
    );

    const msg = await channel.send({ embeds: [buildChestEmbed(gold)], components: [row] });
    lastChestMessageId = msg.id;
    logger.info({ chestId, gold }, "Chest spawned");

    const timeout = setTimeout(async () => {
      if (!claimedChests.has(chestId)) {
        claimedChests.add(chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel("Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ embeds: [buildChestEmbed(gold)], components: [disabledRow] }).catch(() => null);
        logger.info({ chestId }, "Chest expired unclaimed");
      }
    }, CHEST_EXPIRE_MS);

    timeout.unref?.();

    return { chestId, gold, expireAt };
  } catch (err) {
    logger.error({ err }, "Failed to fire chest");
    return null;
  }
}

async function cleanupOldEvents(client: Client) {
  const old = await getAllEvents();
  if (old.length === 0) return;

  const eventChannel = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
  const mainChannel = await client.channels.fetch(MAIN_CHANNEL_ID).catch(() => null);

  for (const ev of old) {
    try {
      if (eventChannel instanceof TextChannel) {
        const msg = await eventChannel.messages.fetch(ev.messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => null);
      }
      if (ev.decreeMessageId && mainChannel instanceof TextChannel) {
        const decree = await mainChannel.messages.fetch(ev.decreeMessageId).catch(() => null);
        if (decree) await decree.delete().catch(() => null);
      }
      await deleteEvent(ev.id);
    } catch (err) {
      logger.error({ err, eventId: ev.id }, "Failed to cleanup old event");
    }
  }
  logger.info({ count: old.length }, "Old events cleaned up");
}

let firingEvent = false;

export async function fireEvent(client: Client) {
  if (firingEvent) {
    logger.warn("fireEvent already in progress, skipping duplicate trigger");
    return;
  }
  firingEvent = true;
  try {
    const channel = await client.channels.fetch(EVENT_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) {
      logger.error({ channelId: EVENT_CHANNEL_ID }, "Event channel not found");
      return;
    }

    await cleanupOldEvents(client);

    const expiresAt = new Date(Date.now() + EVENT_DURATION_MS);
    const placeholder = await channel.send({ content: "🔥 *Umbrele se mișcă…*" });
    const ev = await createEvent("ora_umbrelor", placeholder.id, expiresAt);

    const joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ora_join_${ev.id}`)
        .setLabel("Intră în Luptă")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Danger),
    );

    await placeholder.edit({ content: "", embeds: [buildStartEmbed()], components: [joinRow] });

    try {
      const mainChannel = await client.channels.fetch(MAIN_CHANNEL_ID);
      if (mainChannel instanceof TextChannel) {
        const decree = await mainChannel.send(
          `⚔️📜 **DECRET AL CURȚII CENUȘII**  📜⚔️\n\n` +
          `Umbrele s-au mișcat, iar cenușa s-a ridicat din adâncuri.\n` +
          `Un nou eveniment a fost declanșat în Regat.\n\n` +
          `Verifică sanctuarul umbrelor:\n👉 <#${EVENT_CHANNEL_ID}>\n\n` +
          `Acolo începe lupta.\nAcolo se scrie destinul.\nAcolo se ridică eroii… și cad cei slabi.`,
        );
        await setEventDecreeMessage(ev.id, decree.id);
      }
    } catch (err) {
      logger.error({ err }, "Failed to send main channel notification");
    }

    logger.info({ eventId: ev.id }, "Ora Umbrelor fired");
  } catch (err) {
    logger.error({ err }, "Failed to fire event");
  } finally {
    firingEvent = false;
  }
}

export function startScheduler(client: Client) {
  setInterval(() => expireOldEvents(client), 60 * 1000);

  const scheduleNext = () => {
    const cooldown = randomCooldown();
    logger.info({ nextInHours: (cooldown / 3600000).toFixed(2) }, "Next event scheduled");
    setTimeout(async () => { await fireEvent(client); scheduleNext(); }, cooldown);
  };

  setTimeout(async () => { await fireEvent(client); scheduleNext(); }, 5 * 60 * 1000);
  logger.info("First Ora Umbrelor in 5 minutes");

  let chestInFlight = false;
  setInterval(() => {
    if (chestInFlight) return;
    chestInFlight = true;
    void fireChest(client).finally(() => { chestInFlight = false; });
  }, CHEST_INTERVAL_MS);
  logger.info({ everyMinutes: CHEST_INTERVAL_MS / 60000 }, "Chest scheduler started — fixed interval");
}

export { APPLICATION_ID };
