import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../lib/logger";
import { buildStartEmbed, buildExpiredCronica, buildChestEmbed, buildExpiredChestEmbed, rollChest, oracleMessage, buildProphecyMessage, CHEST_RARITIES, buildFinalBossEmbed, buildBossLeaderboard, buildLockedChestEmbed, buildKeyChestEmbed, spawnLockedChest, rollKeyChestType, computeBossRewards, finalBossRow, bossMaxHp, THEME_COLOR, BRAND_FOOTER, type BossRarity, type BossPlayerStats } from "./survival";
import { triggerRandomBattleEvent } from "./combat-events";
import { createEvent, deactivateEvent, getExpiredActiveEvents, getEventParticipants, getAllEvents, setEventDecreeMessage, deleteEvent, getLatestActiveEvent, getActiveEvent, setHonorTitle, addPlayerReputation, addPlayerGold, addPlayerXp } from "./db";

const EVENT_CHANNEL_ID = "1472579703457190042";
const MAIN_CHANNEL_ID = "1382042144717410385";
const APPLICATION_ID = "1472675543777280071";
const EVENT_DURATION_MS = 60 * 60 * 1000;
const MIN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const MAX_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const CHEST_INTERVAL_MS = 30 * 60 * 1000;
const KEY_CHEST_INTERVAL_MS = 45 * 60 * 1000;
const CHEST_EXPIRE_MS = 10 * 60 * 1000;

const ORACLE_INTERVAL_MS = 25 * 60 * 1000;
const BATTLE_EVENT_INTERVAL_MS = 7 * 60 * 1000;

export const claimedChests = new Set<string>();

// ─── Active prophecy ──────────────────────────────────────────────────────────
interface Prophecy { rarityKey: string; mult: 2 | 3; expiresAt: number }
let activeProphecy: Prophecy | null = null;
export function getActiveProphecy(): Prophecy | null { return activeProphecy; }

// ID of the pinned oracle message in the main channel (module-level; recovered on startup)
let prophecyPinnedMsgId: string | null = null;

function buildProphecyPinEmbed(prophecy: Prophecy | null): object {
  if (!prophecy || prophecy.expiresAt <= Date.now()) {
    return {
      color: 0x4a4a4a,
      title: "🔮 Oracolul Cenușii",
      description: "*Oracolul tace…*\n\nNicio profeție nu este activă în acest moment.",
      footer: { text: BRAND_FOOTER },
    };
  }
  const rarity = CHEST_RARITIES.find((r) => r.key === prophecy.rarityKey);
  const rarityLabel = rarity ? `${rarity.emoji ?? ""} ${rarity.label}`.trim() : prophecy.rarityKey;
  const expiryUnix = Math.floor(prophecy.expiresAt / 1000);
  return {
    color: THEME_COLOR,
    title: "🔮 Profeția Oracolului Cenușii",
    description:
      `Oracolul a vorbit. Un cufăr este binecuvântat azi cu putere înmulțită.\n\n` +
      `**Cufăr binecuvântat:** ${rarityLabel}\n` +
      `**Bonus Oboli:** ×${prophecy.mult}\n` +
      `**Expiră:** <t:${expiryUnix}:f> (<t:${expiryUnix}:R>)`,
    footer: { text: BRAND_FOOTER },
  };
}

async function updateProphecyPin(client: Client): Promise<void> {
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    const embed = buildProphecyPinEmbed(activeProphecy);

    if (prophecyPinnedMsgId) {
      const existing = await channel.messages.fetch(prophecyPinnedMsgId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed] });
        logger.info({ msgId: prophecyPinnedMsgId }, "Prophecy pin updated");
        return;
      }
      // Message was deleted externally — fall through to create a new one
      prophecyPinnedMsgId = null;
    }

    // No existing pin: send a new message and pin it
    const msg = await channel.send({ embeds: [embed] });
    prophecyPinnedMsgId = msg.id;
    await msg.pin().catch((err) => logger.warn({ err }, "Failed to pin prophecy message"));

    // Discord sends a "pinned a message" system notification; try to clean it up
    await channel.messages
      .fetch({ limit: 5, after: msg.id })
      .then(async (recent) => {
        const sysMsg = recent.find((m) => m.type === 6 /* ChannelPinnedMessage */);
        if (sysMsg) await sysMsg.delete().catch(() => null);
      })
      .catch(() => null);

    logger.info({ msgId: msg.id }, "Prophecy pin created");
  } catch (err) {
    logger.error({ err }, "Failed to update prophecy pin");
  }
}

/**
 * Called once at bot startup: scans pinned messages in the main channel to
 * recover an existing oracle pin (so we edit instead of creating a new one),
 * then syncs the embed to the current prophecy state.
 */
export async function initOraclePinOnStartup(client: Client): Promise<void> {
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    const botId = client.user?.id;
    if (botId) {
      const pins = await channel.messages.fetchPinned().catch(() => null);
      if (pins) {
        const existing = pins.find(
          (m) =>
            m.author.id === botId &&
            m.embeds.some((e) => e.title?.includes("Oracolul Cenușii")),
        );
        if (existing) {
          prophecyPinnedMsgId = existing.id;
          logger.info({ msgId: existing.id }, "Recovered existing oracle pin");
        }
      }
    }

    await updateProphecyPin(client);
  } catch (err) {
    logger.error({ err }, "Failed to init oracle pin on startup");
  }
}

// ─── Boss shared HP state ─────────────────────────────────────────────────────
export type { BossPlayerStats };

export interface BossState {
  eventId: number;
  level: number;
  rarity: BossRarity;
  maxHp: number;
  currentHp: number;
  messageId: string;
  lastHitAt: Map<string, number>;         // discordId → timestamp of last hit
  damageBy: Map<string, number>;          // discordId → total damage dealt to boss
  playerHp: Map<string, number>;          // discordId → current HP during boss fight
  playerNames: Map<string, string>;       // discordId → username (for embed + leaderboard)
  playerStats: Map<string, BossPlayerStats>; // discordId → global player stats at first hit
  participants: Array<{ username: string; discordId: string; monsterLevel: number; totalDamage: number; isAlive: boolean }>;
  defeated: boolean;
}
export const activeBossMap = new Map<number, BossState>();

const BOSS_RARITY_WEIGHTS: [BossRarity, number][] = [
  ["comun", 60], ["rar", 25], ["epic", 12], ["legendar", 3],
];
function rollBossRarity(): BossRarity {
  const total = BOSS_RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of BOSS_RARITY_WEIGHTS) {
    if ((roll -= w) <= 0) return r;
  }
  return "comun";
}

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
      // Spawn boss AFTER event ends (before deactivation so isActive check passes)
      await fireFinalBoss(client, ev.id);
      await deactivateEvent(ev.id);
      logger.info({ eventId: ev.id }, "Event expired");
    } catch (err) {
      logger.error({ err, eventId: ev.id }, "Failed to expire event");
    }
  }
}

export async function fireChestForced(client: Client, rarityKey: string, mult?: 2 | 3) {
  if (firingChest) {
    logger.warn("fireChestForced already in progress, skipping duplicate trigger");
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

    const { buildChestEmbed: bce, spawnChest: sc } = await import("./survival");
    const result = sc(rarityKey);
    if (!result) return null;
    const { rarity, gold } = result;
    // Encode mult in customId so the claim handler knows the bonus without extra state
    const chestId = mult != null
      ? `chest_${Date.now()}_${rarity.key}_${gold}_x${mult}`
      : `chest_${Date.now()}_${rarity.key}_${gold}`;
    const expireAt = Date.now() + CHEST_EXPIRE_MS;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("Revendică Cufărul")
        .setEmoji(rarity.emoji)
        .setStyle(ButtonStyle.Success),
    );

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    const content = mult != null
      ? `🔮 **Cufăr Binecuvântat** — ${rarity.label} apare în Regat! **×${mult} Oboli** pentru cel mai rapid!`
      : `📦 Cufăr de **${rarity.label}** apare în Regat! Revendică-l repede!`;

    const msg = await channel.send({
      content,
      embeds: [bce(gold, rarity, mult)],
      components: [lockedRow],
    });
    lastChestMessageId = msg.id;

    await sleep(5000);
    if (!claimedChests.has(chestId)) {
      await msg.edit({ embeds: [bce(gold, rarity, mult)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, gold, rarity: rarity.key, mult }, "Chest spawned (forced)");

    const timeout = setTimeout(async () => {
      if (!claimedChests.has(chestId)) {
        claimedChests.add(chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel(mult != null ? "Cufărul binecuvântat a dispărut…" : "Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ embeds: [buildExpiredChestEmbed(gold, rarity, mult)], components: [disabledRow] }).catch(() => null);
        logger.info({ chestId }, "Chest expired unclaimed (forced)");
      }
    }, CHEST_EXPIRE_MS);

    timeout.unref?.();
    lastChestTimeout = timeout;

    return { chestId, gold, expireAt };
  } catch (err) {
    logger.error({ err }, "Failed to fire chest (forced)");
    return null;
  } finally {
    firingChest = false;
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

    // Check if the active prophecy blesses this chest's rarity
    const prophecy = getActiveProphecy();
    const blessMult: 2 | 3 | undefined =
      prophecy && prophecy.expiresAt > Date.now() && prophecy.rarityKey === rarity.key
        ? prophecy.mult
        : undefined;

    // Encode mult in customId so claim handler applies the bonus (mirrors fireChestForced)
    const chestId = blessMult != null
      ? `chest_${Date.now()}_${rarity.key}_${gold}_x${blessMult}`
      : `chest_${Date.now()}_${rarity.key}_${gold}`;
    const expireAt = Date.now() + CHEST_EXPIRE_MS;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel(blessMult != null ? "🔮 Revendică Cufărul Binecuvântat" : "Revendică Cufărul")
        .setEmoji(rarity.emoji)
        .setStyle(ButtonStyle.Success),
    );

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    // Per-rarity reveal frames
    const frames: Array<{ content: string; delay: number }> =
      rarity.key === "mitic"
        ? [
            { content: "🌑 *Cenușa înnegrește cerul…*", delay: 700 },
            { content: "💜 *O energie arcană pulsează prin aer…*", delay: 700 },
            { content: "⚡💎⚡ *Puterea veche se trezește!*", delay: 700 },
            { content: "💎🔮💎 **UN CUFĂR MITIC ÎȘI FACE APARIȚIA!!**", delay: 800 },
          ]
        : rarity.key === "aur"
        ? [
            { content: "✨ *O lumină aurie pâlpâie în depărtare…*", delay: 800 },
            { content: "🟡✨ *Podeaua tremură. Ceva prețios se ridică…*", delay: 800 },
            { content: "🥇🌟💰 **UN CUFĂR DE AUR!**", delay: 800 },
          ]
        : rarity.key === "argint"
        ? [
            { content: "🌫️ *Un fior rece trece prin aer…*", delay: 800 },
            { content: "🥈✨ *Un cufăr argintiu apare din ceață!*", delay: 900 },
          ]
        : [
            { content: "✨ *Ceva strălucește în cenușă…*", delay: 900 },
            { content: "🪙📦 *Un cufăr de bronz răsare din praf…*", delay: 900 },
          ];

    const msg = await channel.send({ content: frames[0]!.content });
    lastChestMessageId = msg.id;

    for (let i = 1; i < frames.length; i++) {
      await sleep(frames[i - 1]!.delay);
      await msg.edit({ content: frames[i]!.content }).catch(() => null);
    }
    await sleep(frames[frames.length - 1]!.delay);
    await msg.edit({ content: `${rarity.emoji}✨`, embeds: [buildChestEmbed(gold, rarity, blessMult)], components: [lockedRow] }).catch(() => null);
    await sleep(500);
    await msg.edit({ content: "", embeds: [buildChestEmbed(gold, rarity, blessMult)], components: [lockedRow] }).catch(() => null);

    // Enable claim button after 5 seconds
    await sleep(5000);
    if (!claimedChests.has(chestId)) {
      await msg.edit({ embeds: [buildChestEmbed(gold, rarity, blessMult)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, gold, rarity: rarity.key, blessMult }, "Chest spawned");

    const timeout = setTimeout(async () => {
      if (!claimedChests.has(chestId)) {
        claimedChests.add(chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel(blessMult != null ? "Cufărul binecuvântat a dispărut…" : "Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ embeds: [buildExpiredChestEmbed(gold, rarity, blessMult)], components: [disabledRow] }).catch(() => null);
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

    // Send embed first (no button yet — need event ID for customId)
    const placeholder = await channel.send({ embeds: [buildStartEmbed()] });
    const ev = await createEvent("ora_umbrelor", placeholder.id, expiresAt);

    // Edit with correct button now that we have the event ID
    const joinRowFinal = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ora_join_${ev.id}`)
        .setLabel("Intră în Luptă")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Danger),
    );
    await placeholder.edit({ embeds: [buildStartEmbed()], components: [joinRowFinal] }).catch(() => null);

    // Main channel decree disabled — user requested only chest in chat
    // try {
    //   const mainChannel = await client.channels.fetch(MAIN_CHANNEL_ID);
    //   if (mainChannel instanceof TextChannel) {
    //     const decree = await mainChannel.send(
    //       `⚔️📜 **DECRET AL CURȚII CENUȘII**  📜⚔️\n\n` +
    //       `Umbrele s-au mișcat, iar cenușa s-a ridicat din adâncuri.\n` +
    //       `Un nou eveniment a fost declanșat în Regat.\n\n` +
    //       `Verifică sanctuarul umbrelor:\n👉 <#${EVENT_CHANNEL_ID}>\n\n` +
    //       `Acolo începe lupta.\nAcolo se scrie destinul.\nAcolo se ridică eroii… și cad cei slabi.`,
    //     );
    //     await setEventDecreeMessage(ev.id, decree.id);
    //   }
    // } catch (err) {
    //   logger.error({ err }, "Failed to send main channel notification");
    // }

    logger.info({ eventId: ev.id }, "Ora Umbrelor fired");
  } catch (err) {
    logger.error({ err }, "Failed to fire event");
  } finally {
    firingEvent = false;
  }
}

export async function fireFinalBoss(client: Client, eventId: number) {
  try {
    const ev = await getActiveEvent(eventId);
    if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) return;

    const channel = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    const participants = await getEventParticipants(eventId);
    const aliveParticipants = participants.filter((p) => p.isAlive);
    const avgLevel = aliveParticipants.length
      ? Math.ceil(aliveParticipants.reduce((s, p) => s + p.monsterLevel, 0) / aliveParticipants.length)
      : 1;
    const bossLevel = Math.max(5, Math.ceil(avgLevel / 2));
    const rarity = rollBossRarity();
    const maxHp = bossMaxHp(bossLevel, rarity);

    const msg = await channel.send({
      embeds: [buildFinalBossEmbed(bossLevel, rarity, maxHp, maxHp)],
      components: [finalBossRow(eventId)],
    });

    const boss: BossState = {
      eventId,
      level: bossLevel,
      rarity,
      maxHp,
      currentHp: maxHp,
      messageId: msg.id,
      lastHitAt: new Map(),
      damageBy: new Map(),
      playerHp: new Map(),
      playerNames: new Map(),
      playerStats: new Map(),
      participants: participants.map((p) => ({
        username: p.username,
        discordId: p.discordId,
        monsterLevel: p.monsterLevel,
        totalDamage: p.totalDamage,
        isAlive: p.isAlive,
      })),
      defeated: false,
    };
    activeBossMap.set(eventId, boss);

    // 5-minute escape timer — if boss not defeated, it flees and we still send leaderboard
    const escapeTimer = setTimeout(async () => {
      if (boss.defeated) return;
      boss.defeated = true;
      activeBossMap.delete(eventId);
      try {
        const ch = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
        if (!(ch instanceof TextChannel)) return;
        // Reward fighters scaled by rank + rarity
        const bossRewards = computeBossRewards(boss.damageBy, boss.rarity);
        await Promise.all([...bossRewards.entries()].flatMap(([discordId, r]) => [
          addPlayerReputation(discordId, r.rep),
          addPlayerGold(discordId, r.gold),
          addPlayerXp(discordId, r.xp),
        ]));
        // Delete the boss message, then send leaderboard
        const bossMsg = await ch.messages.fetch(boss.messageId).catch(() => null);
        await bossMsg?.delete().catch(() => null);
        const leaderboard = buildBossLeaderboard(boss, boss.damageBy, boss.participants, boss.playerNames, boss.playerHp);
        await ch.send({ embeds: [leaderboard] }).catch(() => null);
      } catch { /* ignore */ }
    }, 5 * 60 * 1000);
    escapeTimer.unref?.();

    logger.info({ eventId, bossLevel, rarity, maxHp }, "Final boss summoned");
  } catch (err) {
    logger.error({ err, eventId }, "Failed to summon final boss");
  }
}

export async function fireLockedChest(client: Client, rarityKey: string): Promise<void> {
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    const result = spawnLockedChest(rarityKey);
    if (!result) {
      logger.warn({ rarityKey }, "fireLockedChest: invalid rarity");
      return;
    }
    const { rarity, gold } = result;
    const chestId = `lockchest_${Date.now()}_${rarity.key}_${gold}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("🗝️ Deschide cu Cheia")
        .setStyle(ButtonStyle.Primary),
    );

    const msg = await channel.send({
      content: `🔒 **Cufăr Blocat** apare în Regat! Cel cu cheia potrivită îl poate deschide!`,
      embeds: [buildLockedChestEmbed(rarity.key, gold)],
      components: [row],
    });

    logger.info({ chestId, rarityKey: rarity.key, gold }, "Locked chest spawned");

    const timeout = setTimeout(async () => {
      if (!claimedChests.has(chestId)) {
        claimedChests.add(chestId);
        const expiredRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel("Cufărul a dispărut...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ components: [expiredRow] }).catch(() => null);
        logger.info({ chestId }, "Locked chest expired unclaimed");
      }
    }, CHEST_EXPIRE_MS);
    timeout.unref?.();
  } catch (err) {
    logger.error({ err }, "Failed to fire locked chest");
  }
}

let firingKeyChest = false;

/** Spawn a dedicated key chest in the main channel. keyType "random" picks a weighted tier. */
export async function fireKeyChest(client: Client, keyType?: string): Promise<{ chestId: string } | null> {
  if (firingKeyChest) {
    logger.warn("fireKeyChest already in progress, skipping duplicate trigger");
    return null;
  }
  firingKeyChest = true;
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return null;

    const kt = keyType && keyType !== "random" ? keyType : rollKeyChestType();
    const chestId = `keychest_${Date.now()}_${kt}`;

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("🗝️ Revendică Cheia")
        .setStyle(ButtonStyle.Primary),
    );

    const frames: Array<{ content: string; delay: number }> = [
      { content: "🌫️ *Ceva metalic zornăie în cenușă…*", delay: 800 },
      { content: "🗝️✨ *Un cufăr de chei se ridică din umbre!*", delay: 900 },
    ];

    const msg = await channel.send({ content: frames[0]!.content });
    for (let i = 1; i < frames.length; i++) {
      await sleep(frames[i - 1]!.delay);
      await msg.edit({ content: frames[i]!.content }).catch(() => null);
    }
    await sleep(frames[frames.length - 1]!.delay);
    await msg.edit({ content: "", embeds: [buildKeyChestEmbed(kt)], components: [lockedRow] }).catch(() => null);

    await sleep(5000);
    if (!claimedChests.has(chestId)) {
      await msg.edit({ embeds: [buildKeyChestEmbed(kt)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, keyType: kt }, "Key chest spawned");

    const timeout = setTimeout(async () => {
      if (!claimedChests.has(chestId)) {
        claimedChests.add(chestId);
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${chestId}_expired`)
            .setLabel("Cheia s-a topit în fum...")
            .setEmoji("💨")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        await msg.edit({ components: [disabledRow] }).catch(() => null);
        logger.info({ chestId }, "Key chest expired unclaimed");
      }
    }, CHEST_EXPIRE_MS);
    timeout.unref?.();

    return { chestId };
  } catch (err) {
    logger.error({ err }, "Failed to fire key chest");
    return null;
  } finally {
    firingKeyChest = false;
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

async function fireProphecy(client: Client) {
  try {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    // Only target rarities that can actually spawn naturally (weight > 0).
    // Regal has weight 0 (admin/locked-only) and must never be a daily prophecy target.
    const spawnable = CHEST_RARITIES.filter((r) => r.weight > 0);
    const rarityKey = spawnable[Math.floor(Math.random() * spawnable.length)]!.key;
    // ×2 with 70% probability, ×3 with 30%
    const mult: 2 | 3 = Math.random() < 0.7 ? 2 : 3;

    activeProphecy = { rarityKey, mult, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };

    // Announce the new prophecy dramatically in chat
    const msg = buildProphecyMessage(rarityKey, mult);
    await channel.send({ content: msg });

    // Update (or create) the pinned oracle message so players can always find it
    await updateProphecyPin(client);

    logger.info({ rarityKey, mult }, "Daily prophecy fired");
  } catch (err) {
    logger.error({ err }, "Failed to fire prophecy");
  }
}

async function fireBattleEvent(client: Client) {
  try {
    const ev = await getLatestActiveEvent();
    if (!ev) return;
    const channel = await client.channels.fetch(EVENT_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;
    const battle = triggerRandomBattleEvent();
    const sent = await channel.send({ content: battle.announce });
    // Auto-delete the announcement once the battle event's effect ends.
    const ttl = Math.max(0, battle.expiresAt - Date.now());
    setTimeout(() => { void sent.delete().catch(() => {}); }, ttl);
    logger.info({ eventId: ev.id, battle: battle.key }, "Battle event triggered");
  } catch (err) {
    logger.error({ err }, "Failed to trigger battle event");
  }
}

// Periodic check: if the active prophecy has expired, reset the pin to "tace"
// and clear the in-memory state so the next fireProphecy starts fresh.
async function checkProphecyExpiry(client: Client): Promise<void> {
  if (activeProphecy && activeProphecy.expiresAt <= Date.now()) {
    activeProphecy = null;
    await updateProphecyPin(client);
    logger.info("Active prophecy expired — oracle pin reset to silent state");
  }
}

// Recursive helper: fires a prophecy after `delayMs`, then schedules the next
// one 24h later. Anchors the cadence from actual fire time rather than boot time.
function scheduleProphecy(client: Client, delayMs: number): void {
  const t = setTimeout(async () => {
    // Reset the pin to "tace" first so there is no stale embed visible
    // between the old prophecy expiring and the new one being announced.
    activeProphecy = null;
    await updateProphecyPin(client);
    await fireProphecy(client);
    scheduleProphecy(client, 24 * 60 * 60 * 1000);
  }, delayMs);
  t.unref?.();
}

// Prophecy is in-memory only: every bot start (including redeploys) begins a
// fresh cycle — recover the oracle pin, then fire the first prophecy in 1 minute
// and every 24h thereafter.
async function initProphecyScheduler(client: Client): Promise<void> {
  await initOraclePinOnStartup(client);
  logger.info("Fresh prophecy cycle on startup — first fire in 1 minute");
  scheduleProphecy(client, 60 * 1000);
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

  // Dedicated key chests on their own (slower) cadence, first one shortly after boot.
  setTimeout(() => { void fireKeyChest(client); }, 12 * 60 * 1000);
  setInterval(() => { void fireKeyChest(client); }, KEY_CHEST_INTERVAL_MS);
  logger.info({ everyMinutes: KEY_CHEST_INTERVAL_MS / 60000 }, "Key-chest scheduler started");

  // Oracle messages disabled — user requested only chest in chat
  // setInterval(() => { void fireOracle(client); }, ORACLE_INTERVAL_MS);
  // logger.info({ everyMinutes: ORACLE_INTERVAL_MS / 60000 }, "Oracle scheduler started");

  // Prophecy is in-memory only: a fresh cycle starts on every boot/redeploy.
  void initProphecyScheduler(client);

  // Safety net: every minute check whether the active prophecy has expired and
  // reset the pin to "Oracolul tace…" if so. This covers any edge cases where the
  // 24h timer fires slightly late or the bot is under load.
  setInterval(() => { void checkProphecyExpiry(client); }, 60 * 1000);

  setInterval(() => { void fireBattleEvent(client); }, BATTLE_EVENT_INTERVAL_MS);
  logger.info({ everyMinutes: BATTLE_EVENT_INTERVAL_MS / 60000 }, "Battle-event scheduler started");
}

export { APPLICATION_ID };
