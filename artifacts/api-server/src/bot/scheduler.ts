import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../lib/logger";
import { buildStartEmbed, buildExpiredCronica, buildChestEmbed, buildExpiredChestEmbed, rollChest, oracleMessage, buildFinalBossEmbed, buildBossLeaderboard, buildLockedChestEmbed, buildKeyChestEmbed, spawnLockedChest, rollKeyChestType, computeBossRewards, finalBossRow, bossMaxHp, type BossRarity, type BossPlayerStats } from "./survival";
import { triggerRandomBattleEvent } from "./combat-events";
import { getRewardMultipliers } from "./status-effects";
import { startOracle, setOracleExtatic } from "./oracle";
import { createEvent, deactivateEvent, getExpiredActiveEvents, getEventParticipants, getAllEvents, setEventDecreeMessage, deleteEvent, getLatestActiveEvent, getActiveEvent, setHonorTitle, addPlayerReputation, addPlayerGold, addPlayerXp } from "./db";

const EVENT_CHANNEL_ID    = "1521185682200989726";
const BOSS_CHANNEL_ID     = "1521186913476673556";
const MAIN_CHANNEL_ID     = "1382042144717410385";
/** Dedicated channel where the Ora Umbrelor cronica is posted permanently. */
const EVENT_TOP_CHANNEL_ID = "1521185741961695434";
/** Dedicated channel where boss leaderboards are posted permanently. */
const BOSS_TOP_CHANNEL_ID  = "1521186981525327993";
const APPLICATION_ID = "1472675543777280071";
export const EVENT_DURATION_MS = 60 * 60 * 1000;
const FINAL_BOSS_ACTIVE_MS = 30 * 60 * 1000; // final boss flees after 30 minutes
const MIN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const MAX_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const CHEST_INTERVAL_MS = 30 * 60 * 1000;
const KEY_CHEST_INTERVAL_MS = 45 * 60 * 1000;
const CHEST_EXPIRE_MS = 10 * 60 * 1000;

const ORACLE_INTERVAL_MS = 25 * 60 * 1000;
const BATTLE_EVENT_INTERVAL_MS = 7 * 60 * 1000;

export const claimedChests = new Set<string>();

// ─── Boss shared HP state ─────────────────────────────────────────────────────
export type { BossPlayerStats };

export interface BossState {
  eventId: number;
  level: number;
  rarity: BossRarity;
  maxHp: number;
  currentHp: number;
  messageId: string;
  /** Discord channel ID where this boss was spawned — used to post leaderboard. */
  channelId: string;
  lastHitAt: Map<string, number>;         // discordId → timestamp of last hit
  damageBy: Map<string, number>;          // discordId → total damage dealt to boss
  playerHp: Map<string, number>;          // discordId → current HP during boss fight
  playerNames: Map<string, string>;       // discordId → username (for embed + leaderboard)
  playerStats: Map<string, BossPlayerStats>; // discordId → global player stats at first hit
  participants: Array<{ username: string; discordId: string; monsterLevel: number; totalDamage: number; isAlive: boolean }>;
  /** Epoch ms when this boss flees if not defeated — drives the live countdown in the embed. */
  expiresAt: number;
  /** True for bosses spawned independently of Ora Umbrelor — any player may join, no event participation required. */
  standalone: boolean;
  /** discordId → epoch ms when their boss ability comes off cooldown. */
  abilityReadyAt: Map<string, number>;
  /** discordIds with a queued empower — their next hit on the boss is doubled. */
  empowerNext: Set<string>;
  /** discordIds with a queued shield — their next hit taken from the boss is reduced. */
  shieldNext: Set<string>;
  defeated: boolean;
}
export const activeBossMap = new Map<number, BossState>();

// ─── Final-boss eligibility guard ─────────────────────────────────────────────
// Pure function — no I/O — so it can be unit-tested without mocking Discord or DB.
export type BossEligibilityResult =
  | { ok: true }
  | { ok: false; reason: "no_boss" | "defeated" | "not_participant" | "dead" };

export function checkBossEligibility(
  boss: BossState | undefined,
  uid: string,
): BossEligibilityResult {
  if (!boss) return { ok: false, reason: "no_boss" };
  if (boss.defeated) return { ok: false, reason: "defeated" };
  // Reject players downed during the boss fight itself (applies to all boss types)
  const bossHp = boss.playerHp.get(uid);
  if (bossHp !== undefined && bossHp <= 0) return { ok: false, reason: "dead" };
  // Standalone bosses are open to all — skip event-participant checks
  if (boss.standalone) return { ok: true };
  const participant = boss.participants.find((p) => p.discordId === uid);
  if (!participant) return { ok: false, reason: "not_participant" };
  // Reject players who died during the event before the boss spawned
  if (!participant.isAlive) return { ok: false, reason: "dead" };
  return { ok: true };
}

export const BOSS_RARITY_WEIGHTS: [BossRarity, number][] = [
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

          // Also post cronica permanently in the dedicated top channel.
          const topCh = await client.channels.fetch(EVENT_TOP_CHANNEL_ID).catch(() => null);
          if (topCh instanceof TextChannel) {
            await topCh.send({ embeds: [cronica] }).catch(() => null);
          }

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

    // Multiplier is a surprise rolled at claim time, so no bonus is encoded here.
    const chestId = `chest_${Date.now()}_${rarity.key}_${gold}`;
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
    await msg.edit({ content: `${rarity.emoji}✨`, embeds: [buildChestEmbed(gold, rarity)], components: [lockedRow] }).catch(() => null);
    await sleep(500);
    await msg.edit({ content: "", embeds: [buildChestEmbed(gold, rarity)], components: [lockedRow] }).catch(() => null);

    // Enable claim button after 5 seconds
    await sleep(5000);
    if (!claimedChests.has(chestId)) {
      await msg.edit({ embeds: [buildChestEmbed(gold, rarity)], components: [row] }).catch(() => null);
    }

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
        await msg.edit({ embeds: [buildExpiredChestEmbed(gold, rarity)], components: [disabledRow] }).catch(() => null);
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
    await placeholder.edit({ embeds: [buildStartEmbed(expiresAt)], components: [joinRowFinal] }).catch(() => null);

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

    const channel = await client.channels.fetch(BOSS_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) return;

    const participants = await getEventParticipants(eventId);
    const aliveParticipants = participants.filter((p) => p.isAlive);
    const avgLevel = aliveParticipants.length
      ? Math.ceil(aliveParticipants.reduce((s, p) => s + p.monsterLevel, 0) / aliveParticipants.length)
      : 1;
    const bossLevel = Math.max(5, Math.ceil(avgLevel / 2));
    const rarity = rollBossRarity();
    const maxHp = bossMaxHp(bossLevel, rarity);
    const bossExpiresAt = Date.now() + FINAL_BOSS_ACTIVE_MS;

    const msg = await channel.send({
      embeds: [buildFinalBossEmbed(bossLevel, rarity, maxHp, maxHp, undefined, undefined, undefined, undefined, bossExpiresAt)],
      components: [finalBossRow(eventId)],
    });

    const boss: BossState = {
      eventId,
      level: bossLevel,
      rarity,
      maxHp,
      currentHp: maxHp,
      messageId: msg.id,
      channelId: BOSS_CHANNEL_ID,
      expiresAt: bossExpiresAt,
      standalone: false,
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
      abilityReadyAt: new Map(),
      empowerNext: new Set(),
      shieldNext: new Set(),
      defeated: false,
    };
    activeBossMap.set(eventId, boss);
    setOracleExtatic();

    // 5-minute escape timer — if boss not defeated, it flees and we still send leaderboard
    const escapeTimer = setTimeout(async () => {
      if (boss.defeated) return;
      boss.defeated = true;
      activeBossMap.delete(eventId);
      try {
        // Delete the boss embed from the fight channel.
        const fightCh = await client.channels.fetch(BOSS_CHANNEL_ID).catch(() => null);
        if (fightCh instanceof TextChannel) {
          const bossMsg = await fightCh.messages.fetch(boss.messageId).catch(() => null);
          await bossMsg?.delete().catch(() => null);
        }
        // Reward fighters scaled by rank + rarity.
        const bossRewards = computeBossRewards(boss.damageBy, boss.rarity);
        // Oracle blessings/curses scale each fighter's boss rewards (XP + Oboli).
        for (const [discordId, r] of bossRewards) {
          const rmods = getRewardMultipliers(discordId);
          r.gold = Math.round(r.gold * rmods.goldMult);
          r.xp = Math.round(r.xp * rmods.xpMult);
        }
        await Promise.all([...bossRewards.entries()].flatMap(([discordId, r]) => [
          addPlayerReputation(discordId, r.rep),
          addPlayerGold(discordId, r.gold),
          addPlayerXp(discordId, r.xp),
        ]));
        // Post leaderboard permanently in the dedicated boss-top channel.
        const topCh = await client.channels.fetch(BOSS_TOP_CHANNEL_ID).catch(() => null);
        if (topCh instanceof TextChannel) {
          const leaderboard = buildBossLeaderboard(boss, boss.damageBy, boss.participants, boss.playerNames, boss.playerHp);
          await topCh.send({ embeds: [leaderboard] }).catch(() => null);
        }
      } catch { /* ignore */ }
    }, Math.max(0, bossExpiresAt - Date.now()));
    escapeTimer.unref?.();

    logger.info({ eventId, bossLevel, rarity, maxHp }, "Final boss summoned");
  } catch (err) {
    logger.error({ err, eventId }, "Failed to summon final boss");
  }
}

// ─── Standalone boss (independent of Ora Umbrelor) ───────────────────────────

const STANDALONE_BOSS_MIN_MS = 30 * 60_000;
const STANDALONE_BOSS_MAX_MS = 60 * 60_000;
const STANDALONE_BOSS_ACTIVE_MS = 60 * 60_000; // active for 1 hour

let standaloneBossId: number | null = null;

export async function fireStandaloneBoss(client: Client) {
  // Don't spawn if a standalone boss is already active.
  if (standaloneBossId !== null && activeBossMap.has(standaloneBossId)) {
    logger.info({ standaloneBossId }, "Standalone boss already active, skipping spawn");
    return;
  }

  try {
    const channel = await client.channels.fetch(BOSS_CHANNEL_ID).catch(() => null);
    if (!(channel instanceof TextChannel)) {
      logger.error({ channelId: BOSS_CHANNEL_ID }, "Boss channel not found");
      return;
    }

    const bossId = Date.now(); // unique key — timestamps won't collide with small DB event IDs
    const level = Math.floor(Math.random() * 21) + 10; // 10–30
    const rarity = rollBossRarity();
    const maxHp = bossMaxHp(level, rarity);
    const bossExpiresAt = Date.now() + STANDALONE_BOSS_ACTIVE_MS;

    const msg = await channel.send({
      embeds: [buildFinalBossEmbed(level, rarity, maxHp, maxHp, undefined, undefined, undefined, undefined, bossExpiresAt)],
      components: [finalBossRow(bossId)],
    });

    const boss: BossState = {
      eventId: bossId,
      level,
      rarity,
      maxHp,
      currentHp: maxHp,
      messageId: msg.id,
      channelId: BOSS_CHANNEL_ID,
      expiresAt: bossExpiresAt,
      standalone: true,
      lastHitAt: new Map(),
      damageBy: new Map(),
      playerHp: new Map(),
      playerNames: new Map(),
      playerStats: new Map(),
      participants: [],
      abilityReadyAt: new Map(),
      empowerNext: new Set(),
      shieldNext: new Set(),
      defeated: false,
    };
    activeBossMap.set(bossId, boss);
    standaloneBossId = bossId;
    setOracleExtatic();

    // 1-hour escape timer — boss flees if not defeated in time
    const escapeTimer = setTimeout(async () => {
      if (boss.defeated) return;
      boss.defeated = true;
      activeBossMap.delete(bossId);
      if (standaloneBossId === bossId) standaloneBossId = null;
      try {
        // Delete the boss embed from the fight channel.
        const fightCh = await client.channels.fetch(BOSS_CHANNEL_ID).catch(() => null);
        if (fightCh instanceof TextChannel) {
          const bossMsg = await fightCh.messages.fetch(boss.messageId).catch(() => null);
          await bossMsg?.delete().catch(() => null);
        }
        const bossRewards = computeBossRewards(boss.damageBy, boss.rarity);
        // Oracle blessings/curses scale each fighter's boss rewards (XP + Oboli).
        for (const [discordId, r] of bossRewards) {
          const rmods = getRewardMultipliers(discordId);
          r.gold = Math.round(r.gold * rmods.goldMult);
          r.xp = Math.round(r.xp * rmods.xpMult);
        }
        await Promise.all([...bossRewards.entries()].flatMap(([discordId, r]) => [
          addPlayerReputation(discordId, r.rep),
          addPlayerGold(discordId, r.gold),
          addPlayerXp(discordId, r.xp),
        ]));
        // Post leaderboard permanently in the dedicated boss-top channel.
        const topCh = await client.channels.fetch(BOSS_TOP_CHANNEL_ID).catch(() => null);
        if (topCh instanceof TextChannel) {
          const leaderboard = buildBossLeaderboard(boss, boss.damageBy, boss.participants, boss.playerNames, boss.playerHp);
          await topCh.send({ embeds: [leaderboard] }).catch(() => null);
        }
      } catch { /* ignore */ }
    }, Math.max(0, bossExpiresAt - Date.now()));
    escapeTimer.unref?.();

    logger.info({ bossId, level, rarity, maxHp }, "Standalone boss summoned");
  } catch (err) {
    logger.error({ err }, "Failed to summon standalone boss");
    standaloneBossId = null;
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

  setInterval(() => { void fireBattleEvent(client); }, BATTLE_EVENT_INTERVAL_MS);
  logger.info({ everyMinutes: BATTLE_EVENT_INTERVAL_MS / 60000 }, "Battle-event scheduler started");

  // Standalone boss — spawns every 30–60 min regardless of active events.
  const scheduleNextStandaloneBoss = () => {
    const delay = STANDALONE_BOSS_MIN_MS +
      Math.floor(Math.random() * (STANDALONE_BOSS_MAX_MS - STANDALONE_BOSS_MIN_MS + 1));
    const t = setTimeout(async () => {
      await fireStandaloneBoss(client);
      scheduleNextStandaloneBoss();
    }, delay);
    t.unref?.();
    logger.info({ nextInMinutes: (delay / 60_000).toFixed(1) }, "Next standalone boss scheduled");
  };
  scheduleNextStandaloneBoss();

  startOracle(client, MAIN_CHANNEL_ID);
}

export { APPLICATION_ID };
