import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../lib/logger";
import { buildStartEmbed, buildExpiredCronica, buildChestEmbed, rollChest, oracleMessage, buildFinalBossEmbed, finalBossRow } from "./survival";
import { triggerRandomBattleEvent } from "./combat-events";
import { createEvent, deactivateEvent, getExpiredActiveEvents, getEventParticipants, getAllEvents, setEventDecreeMessage, deleteEvent, getLatestActiveEvent, getActiveEvent, setHonorTitle } from "./db";

const EVENT_CHANNEL_ID = "1472579703457190042";
const MAIN_CHANNEL_ID = "1382042144717410385";
const APPLICATION_ID = "1472675543777280071";
const EVENT_DURATION_MS = 60 * 60 * 1000;
const MIN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const MAX_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const CHEST_INTERVAL_MS = 30 * 60 * 1000;
const CHEST_EXPIRE_MS = 10 * 60 * 1000;

const ORACLE_INTERVAL_MS = 25 * 60 * 1000;
const BATTLE_EVENT_INTERVAL_MS = 7 * 60 * 1000;

export const claimedChests = new Set<string>();

let lastChestMessageId: string | null = null;
let lastChestTimeout: ReturnType<typeof setTimeout> | null = null;
let firingChest = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

          const ranked = [...participants].sort((a, b) => {
            if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
            if (b.monsterLevel !== a.monsterLevel) return b.monsterLevel - a.monsterLevel;
            return b.totalDamage - a.totalDamage;
          });
          const HONOR_TITLES = ["Eroul Umbrelor", "Supraviețuitorul Cenușii", "Vânătorul Stins"];
          for (let i = 0; i < Math.min(3, ranked.length); i++) {
            const r = ranked[i]!;
            if (r.monsterLevel <= 1) continue;
            await setHonorTitle(r.discordId, HONOR_TITLES[i]!).catch(() => null);
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

export async function fireChest(client: Client) {
  if (firingChest) {
    logger.warn("fireChest already in progress, skipping duplicate trigger");
    return null;
  }
  firingChest = true;
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID);
    if (!(channel instanceof TextChannel)) return null;

    if (lastChestTimeout) {
      clearTimeout(lastChestTimeout);
      lastChestTimeout = null;
    }
    if (lastChestMessageId) {
      const old = await channel.messages.fetch(lastChestMessageId).catch(() => null);
      if (old) await old.delete().catch(() => null);
      lastChestMessageId = null;
    }

    const { rarity, gold } = rollChest();
    const chestId = `chest_${Date.now()}`;
    const expireAt = Date.now() + CHEST_EXPIRE_MS;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("Revendică Cufărul")
        .setEmoji("📦")
        .setStyle(ButtonStyle.Success),
    );

    const msg = await channel.send({ content: "✨ *Ceva strălucește în cenușă…*" });
    lastChestMessageId = msg.id;

    await sleep(900);
    await msg.edit({ content: "✨📦 *Un cufăr se ridică din adâncuri…*" }).catch(() => null);
    await sleep(900);
    await msg.edit({ content: "💫📦✨", embeds: [buildChestEmbed(gold, rarity)], components: [row] }).catch(() => null);
    await sleep(600);
    await msg.edit({ content: "", embeds: [buildChestEmbed(gold, rarity)], components: [row] }).catch(() => null);

    logger.info({ chestId, gold, rarity: rarity.key }, "Chest spawned");

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
        await msg.edit({ embeds: [buildChestEmbed(gold, rarity)], components: [disabledRow] }).catch(() => null);
        logger.info({ chestId }, "Chest expired unclaimed");
      }
    }, CHEST_EXPIRE_MS);

    timeout.unref?.();
    lastChestTimeout = timeout;

    return { chestId, gold, expireAt };
  } catch (err) {
    logger.error({ err }, "Failed to fire chest");
    return null;
  } finally {
    firingChest = false;
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
    const placeholder = await channel.send({ content: "🌑 *Liniște deplină se așterne peste Regat…*" });
    const ev = await createEvent("ora_umbrelor", placeholder.id, expiresAt);

    await sleep(1100);
    await placeholder.edit({ content: "🌑🔥 *Umbrele se trezesc în adâncuri…*" }).catch(() => null);
    await sleep(1100);
    await placeholder.edit({ content: "🌫️🔥 *Cenușa se ridică… ceva se apropie…*" }).catch(() => null);
    await sleep(1100);
    await placeholder.edit({ content: "⚔️🔥💀 *A SOSIT CEASUL!*" }).catch(() => null);
    await sleep(700);

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

    const fbTimeout = setTimeout(() => { void fireFinalBoss(client, ev.id); }, EVENT_DURATION_MS - 60 * 1000);
    fbTimeout.unref?.();

    logger.info({ eventId: ev.id }, "Ora Umbrelor fired");
  } catch (err) {
    logger.error({ err }, "Failed to fire event");
  } finally {
    firingEvent = false;
  }
}

async function fireFinalBoss(client: Client, eventId: number) {
  try {
    const ev = await getActiveEvent(eventId);
    if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) return;

    const channel = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    const participants = await getEventParticipants(eventId);
    const maxLevel = participants.reduce((m, p) => Math.max(m, p.monsterLevel), 1);
    const bossLevel = Math.max(50, maxLevel + 10);

    await channel.send({ embeds: [buildFinalBossEmbed(bossLevel)], components: [finalBossRow(eventId)] });
    logger.info({ eventId, bossLevel }, "Final boss summoned");
  } catch (err) {
    logger.error({ err, eventId }, "Failed to summon final boss");
  }
}

async function fireOracle(client: Client) {
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;
    await channel.send({ content: oracleMessage() });
  } catch (err) {
    logger.error({ err }, "Failed to send oracle message");
  }
}

async function fireBattleEvent(client: Client) {
  try {
    const ev = await getLatestActiveEvent();
    if (!ev) return;
    const channel = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;
    const battle = triggerRandomBattleEvent();
    await channel.send({ content: battle.announce });
    logger.info({ eventId: ev.id, battle: battle.key }, "Battle event triggered");
  } catch (err) {
    logger.error({ err }, "Failed to trigger battle event");
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

  setInterval(() => { void fireChest(client); }, CHEST_INTERVAL_MS);
  logger.info({ everyMinutes: CHEST_INTERVAL_MS / 60000 }, "Chest scheduler started — fixed interval");

  setInterval(() => { void fireOracle(client); }, ORACLE_INTERVAL_MS);
  logger.info({ everyMinutes: ORACLE_INTERVAL_MS / 60000 }, "Oracle scheduler started");

  setInterval(() => { void fireBattleEvent(client); }, BATTLE_EVENT_INTERVAL_MS);
  logger.info({ everyMinutes: BATTLE_EVENT_INTERVAL_MS / 60000 }, "Battle-event scheduler started");
}

export { APPLICATION_ID };
