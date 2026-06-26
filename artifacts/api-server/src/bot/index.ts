import {
  Client,
  TextChannel,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  ButtonInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";
import { sendAlert, sendRecoveryAlert, DISCONNECT_ALERT_THRESHOLD_MS } from "./alert";
import { startScheduler, APPLICATION_ID, fireEvent, fireChest, fireFinalBoss, claimedChests, activeBossMap, type BossState } from "./scheduler";
import {
  upsertPlayer,
  joinEvent,
  getParticipant,
  updateParticipant,
  getActiveEvent,
  addPlayerXp,
  addPlayerGold,
  addPlayerReputation,
  deductPlayerGold,
  buyPlayerUpgrade,
  applyUpgradeToActiveParticipant,
  getTopPlayers,
  recordPlayerDeath,
  recordPlayerRetreat,
  getPlayerById,
  updateMaxLevel,
  setPlayerClass,
  buyCompanion,
  upgradeCompanion,
  buyAbility,
  upgradeAbility,
  applyAbilityLevelToActiveParticipant,
  type AbilityKind,
} from "./db";
import {
  doCombat,
  buildCombatEmbed,
  buildResultText,
  buildDeathEmbed,
  buildRetreatEmbed,
  buildShopEmbed,
  buildLevelupEmbed,
  buildProfileEmbed,
  buildClassEmbed,
  classRows,
  buildCompanionEmbed,
  isCompanionKey,
  combatRow,
  shopRows,
  shopStatsRows,
  shopCompRows,
  shopAbilRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  formatCooldown,
  levelTitle,
  CLASSES,
  isClassKey,
  isAbilityKey,
  upgradeCost,
  COMPANION_BUY_COST,
  ABILITY_BUY_COST,
  UPGRADE_XP_COST,
  SHOP_COUNT_KEY,
  LEVELUP_INTERVAL,
  ABILITY_COOLDOWN_MS,
  buildFinalBossEmbed,
  buildBossLeaderboard,
  finalBossRow,
  type ShopKey,
  type BossRarity,
} from "./survival";

const GUILD_ID = "1382035307607883816";

let botClient: Client | null = null;
let schedulerStarted = false;
let disconnectAlertTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectStartedAt: Date | null = null;
let botReadyAt: Date | null = null;
let shardStatus: string = "disconnected";

export function isBotOnline(): boolean {
  return botClient !== null && botClient.isReady();
}

export function getBotReadyAt(): Date | null {
  return botReadyAt;
}

export function getShardStatus(): string {
  return shardStatus;
}

// Discord Gateway close codes that mean the session cannot be resumed.
// discord.js will NOT auto-reconnect for these; the supervisor must restart.
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4013, 4014]);

const slashCommands = [
  new SlashCommandBuilder().setName("profil").setDescription("📜 Statisticile tale din Regatul Cenușii."),
  new SlashCommandBuilder().setName("clasament").setDescription("👑 Top 10 cei mai puternici luptători."),
  new SlashCommandBuilder().setName("magazin").setDescription("🏺 Forja Cenușii — upgrade-uri permanente, mereu disponibilă."),
  new SlashCommandBuilder().setName("clasa").setDescription("🧬 Alege-ți clasa RPG (alegere permanentă)."),
  new SlashCommandBuilder().setName("companion").setDescription("🐾 Vezi companionul tău (cumpără și fă upgrade din /magazin)."),
  new SlashCommandBuilder()
    .setName("startevent")
    .setDescription("🔥 [Admin] Pornește manual Ora Umbrelor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("cufar")
    .setDescription("📦 [Admin] Generează manual un cufăr cu Oboli.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("spawnboss")
    .setDescription("🐉 [Admin] Invocă manual Dragonul Stins pentru test.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

async function avatarById(discordId: string): Promise<string | null> {
  if (!botClient) return null;
  const cached = botClient.users.cache.get(discordId);
  if (cached) return cached.displayAvatarURL({ size: 256 });
  const u = await Promise.race([
    botClient.users.fetch(discordId).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 1500)),
  ]);
  return u ? u.displayAvatarURL({ size: 256 }) : null;
}

async function handleProfil(interaction: ChatInputCommandInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({
    embeds: [buildProfileEmbed(p, undefined, interaction.user.displayAvatarURL({ size: 256 }))],
    ephemeral: true,
  });
}

async function handleMagazin(interaction: ChatInputCommandInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({ embeds: [buildShopEmbed(p)], components: shopRows(p), ephemeral: true });
}

async function isOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.guild && interaction.user.id === interaction.guild.ownerId) return true;
  await interaction.reply({
    content: "🔒 Doar Stăpânul Regatului poate folosi această comandă.",
    ephemeral: true,
  });
  return false;
}

async function handleStartEvent(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  await interaction.reply({ content: "🔥 *Umbrele se mișcă…* Evenimentul pornește!", ephemeral: true });
  if (botClient) await fireEvent(botClient);
}

async function handleSpawnChest(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  await interaction.reply({ content: "📦 *Cenușa se ridică…* Un cufăr apare în Regat!", ephemeral: true });
  if (botClient) await fireChest(botClient);
}

async function handleSpawnBoss(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  const ev = await import("./db").then(m => m.getLatestActiveEvent());
  if (!ev) {
    await interaction.reply({ content: "❌ Nu există niciun event activ. Pornește mai întâi `/startevent`.", ephemeral: true });
    return;
  }
  await interaction.reply({ content: "🐉 *Cenușa se întunecă…* Dragonul Stins coboară din Abis!", ephemeral: true });
  if (botClient) await fireFinalBoss(botClient, ev.id);
}

async function handleClasament(interaction: ChatInputCommandInteraction) {
  const top = await getTopPlayers();
  const medals = ["🥇", "🥈", "🥉"];
  const champAvatar = top[0] ? await avatarById(top[0].discordId) : null;

  const lines = top.map((p, i) => {
    const deathStr = p.deaths > 0 ? ` | 💀 ${p.deaths}×(Niv.${p.deathLevel})` : "";
    const fledStr = p.retreats > 0 ? ` | 🏳️ ${p.retreats}× a fugit` : "";
    return `${medals[i] ?? `**${i + 1}.**`} **${p.username}** — 🎖️ ${levelTitle(p.maxLevel)} · ${p.xp} XP${deathStr}${fledStr}`;
  }).join("\n");

  const buttons = top.slice(0, 5).map((p, i) =>
    new ButtonBuilder()
      .setCustomId(`profile_view_${p.discordId}`)
      .setLabel(`${medals[i] ?? `#${i + 1}`} ${p.username}`)
      .setStyle(ButtonStyle.Secondary),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }

  await interaction.reply({
    embeds: [
      {
        color: 0x8a4a2f,
        title: "👑 Clasament – Regatul Cenușii",
        description: lines || "*Nimeni nu a luptat încă.*",
        ...(champAvatar ? { thumbnail: { url: champAvatar } } : {}),
        footer: { text: "Apasă un buton pentru a vedea profilul complet al unui luptător" },
        timestamp: new Date().toISOString(),
      },
    ],
    components: rows,
  });
}

async function handleViewProfile(interaction: ButtonInteraction, discordId: string) {
  const player = await getPlayerById(discordId);
  if (!player) {
    await interaction.reply({ content: "❌ Jucătorul nu a fost găsit.", ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: [buildProfileEmbed(player, undefined, await avatarById(discordId))],
    ephemeral: true,
  });
}

async function handleChestClaim(interaction: ButtonInteraction, chestId: string, gold: number) {
  if (claimedChests.has(chestId)) {
    await interaction.reply({ content: "😔 Cineva a fost mai rapid! Cufărul a fost deja revendicat.", ephemeral: true });
    return;
  }
  claimedChests.add(chestId);

  await upsertPlayer(interaction.user.id, interaction.user.username);
  await addPlayerGold(interaction.user.id, gold);

  const openingRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_opening`)
      .setLabel("Se deschide…")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Revendicat de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );

  await interaction.update({ components: [openingRow] });
  await new Promise<void>((r) => setTimeout(r, 800));
  await interaction.message.edit({ components: [disabledRow] }).catch(() => null);
  await interaction.followUp({
    content: `🎉✨ **${interaction.user.username}** a deschis cufărul și a câștigat **${gold} Oboli**! 💰🪙`,
  });

  logger.info({ discordId: interaction.user.id, chestId, gold }, "Chest claimed");
}

async function handleJoin(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferReply({ ephemeral: true });
  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!" });
    return;
  }
  await upsertPlayer(interaction.user.id, interaction.user.username);
  const participant = await joinEvent(eventId, interaction.user.id, interaction.user.username);
  if (!participant) {
    await interaction.editReply({ content: "⚠️ Eroare la intrarea în event." });
    return;
  }
  if (!participant.isAlive) {
    await interaction.editReply({ embeds: [buildDeathEmbed()], components: [] });
    return;
  }
  if (participant.pendingLevelup) {
    const lvl = Math.floor(participant.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  await interaction.editReply({ embeds: [buildCombatEmbed(participant, "", interaction.user.displayAvatarURL({ size: 256 }))], components: [combatRow(eventId, participant)] });
}

async function handleAttack(interaction: ButtonInteraction, eventId: number) {
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p) {
    await interaction.reply({ content: "❌ Intră mai întâi în luptă!", ephemeral: true });
    return;
  }
  if (!p.isAlive) {
    await interaction.update({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel) : buildDeathEmbed()], components: [] });
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.update({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }

  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.update({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }

  const result = doCombat(p);

  // Class reward multipliers (only matter when a monster is defeated).
  if (result.oboliGained > 0) {
    const pl = await getPlayerById(p.discordId);
    const cls = pl?.class && isClassKey(pl.class) ? CLASSES[pl.class] : null;
    if (cls) {
      result.xpGained = Math.round(result.xpGained * cls.xpMult);
      result.oboliGained = Math.round(result.oboliGained * cls.oboliMult);
    }
  }

  const extra = buildResultText(result);

  if (result.playerDied) {
    const lost = Math.floor(p.oboli * 0.2);
    await updateParticipant(p.id, { isAlive: false, currentHp: 0, empowerNext: false, shieldNext: false });
    await Promise.all([
      deductPlayerGold(p.discordId, lost),
      recordPlayerDeath(p.discordId, p.monsterLevel),
    ]);
    await interaction.update({ embeds: [buildDeathEmbed(lost)], components: [] });
    return;
  }

  if (result.oboliGained > 0) {
    await Promise.all([
      addPlayerGold(p.discordId, result.oboliGained),
      addPlayerXp(p.discordId, result.xpGained),
      updateMaxLevel(p.discordId, result.newMonsterLevel),
    ]);
  }

  if (result.levelUp) {
    const newLevel = Math.floor(result.newMonsterLevel / LEVELUP_INTERVAL);
    await updateParticipant(p.id, {
      currentHp: result.newPlayerHp,
      monsterLevel: result.newMonsterLevel,
      monsterCurrentHp: monsterMaxHp(result.newMonsterLevel),
      monsterRarity: result.newMonsterRarity,
      totalDamage: p.totalDamage + result.playerDmg,
      oboli: p.oboli + result.oboliGained,
      pendingLevelup: true,
      empowerNext: false,
      shieldNext: false,
    });
    await interaction.update({ embeds: [buildLevelupEmbed(newLevel)], components: levelupRows(eventId) });
    return;
  }

  const updated = await updateParticipant(p.id, {
    currentHp: result.newPlayerHp,
    monsterLevel: result.newMonsterLevel,
    monsterCurrentHp: result.newMonsterHp,
    monsterRarity: result.newMonsterRarity,
    totalDamage: p.totalDamage + result.playerDmg,
    oboli: p.oboli + result.oboliGained,
    empowerNext: false,
    shieldNext: false,
  });

  await interaction.update({ embeds: [buildCombatEmbed(updated, extra, interaction.user.displayAvatarURL({ size: 256 }))], components: [combatRow(eventId, updated)] });
}

async function handleRetreat(interaction: ButtonInteraction, eventId: number) {
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p) {
    await interaction.reply({ content: "❌ Nu ești în nicio luptă!", ephemeral: true });
    return;
  }
  if (!p.isAlive) {
    await interaction.update({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel) : buildDeathEmbed()], components: [] });
    return;
  }
  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.update({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }
  await updateParticipant(p.id, { isAlive: false, fled: true });
  await recordPlayerRetreat(p.discordId, p.monsterLevel);
  await interaction.update({ embeds: [buildRetreatEmbed(p.monsterLevel)], components: [] });
}

async function handleBuy(interaction: ButtonInteraction, key: ShopKey) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  const cost = shopPrice(key, p[SHOP_COUNT_KEY[key]] as number);
  const updated = await buyPlayerUpgrade(interaction.user.id, key, cost);
  if (updated) {
    await applyUpgradeToActiveParticipant(interaction.user.id, key);
  }
  const player = updated ?? p;
  await interaction.update({ embeds: [buildShopEmbed(player)], components: shopStatsRows(player) });
}

async function handleLevelup(interaction: ButtonInteraction, eventId: number, bonus: string) {
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p || !p.isAlive || !p.pendingLevelup) {
    await interaction.reply({ content: "❌ Nu ai un level-up disponibil!", ephemeral: true });
    return;
  }

  const bonusMap: Record<string, Partial<typeof p>> = {
    xp: { oboli: p.oboli + 5 },
    dodge: { dodgeBonus: p.dodgeBonus + 3 },
    atac: { attackBonus: p.attackBonus + 2 },
    hp: { maxHp: p.maxHp + 5, currentHp: Math.min(p.maxHp + 5, p.currentHp + 5) },
    crit: { critBonus: p.critBonus + 1 },
  };

  const bonusValues = bonusMap[bonus] ?? {};
  const updated = await updateParticipant(p.id, { ...bonusValues, pendingLevelup: false });
  await interaction.update({ embeds: [buildCombatEmbed(updated, "✨ **Bonus ales! Umbrele îți recunosc puterea.**", interaction.user.displayAvatarURL({ size: 256 }))], components: [combatRow(eventId, updated)] });
}

async function handleClasa(interaction: ChatInputCommandInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({
    embeds: [buildClassEmbed(p)],
    components: p.class ? [] : classRows(),
    ephemeral: true,
  });
}

async function handleClassPick(interaction: ButtonInteraction, key: string) {
  await upsertPlayer(interaction.user.id, interaction.user.username);
  const updated = await setPlayerClass(interaction.user.id, key);
  if (!updated) {
    const cur = await getPlayerById(interaction.user.id);
    await interaction.update({
      embeds: [cur ? buildClassEmbed(cur) : buildClassEmbed({ class: null } as never)],
      components: [],
    });
    return;
  }
  await interaction.update({ embeds: [buildClassEmbed(updated)], components: [] });
}

async function handleCompanion(interaction: ChatInputCommandInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({
    embeds: [buildCompanionEmbed(p)],
    components: [],
    ephemeral: true,
  });
}

// Shop nav handlers — each opens its sub-page or returns to main.
async function handleShopNavStats(interaction: ButtonInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.update({ embeds: [buildShopEmbed(p)], components: shopStatsRows(p) });
}

async function handleShopNavComp(interaction: ButtonInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.update({ embeds: [buildShopEmbed(p)], components: shopCompRows(p) });
}

async function handleShopNavAbil(interaction: ButtonInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.update({ embeds: [buildShopEmbed(p)], components: shopAbilRows(p) });
}

async function handleShopBack(interaction: ButtonInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.update({ embeds: [buildShopEmbed(p)], components: shopRows(p) });
}

async function handleCompBuy(interaction: ButtonInteraction, key: string) {
  await upsertPlayer(interaction.user.id, interaction.user.username);
  if (!isCompanionKey(key)) return;
  const updated = await buyCompanion(interaction.user.id, key, COMPANION_BUY_COST);
  if (!updated) {
    await interaction.reply({ content: `❌ Nu poți cumpăra acest companion — ai nevoie de **${COMPANION_BUY_COST} Oboli** și să nu ai deja unul.`, ephemeral: true });
    return;
  }
  await interaction.update({ embeds: [buildShopEmbed(updated)], components: shopCompRows(updated) });
}

async function handleCompUpgrade(interaction: ButtonInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  const cost = upgradeCost(p.companionLevel);
  const updated = await upgradeCompanion(interaction.user.id, p.companionLevel, cost, UPGRADE_XP_COST);
  if (!updated) {
    await interaction.reply({ content: `❌ Upgrade eșuat — ai nevoie de un companion, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`, ephemeral: true });
    return;
  }
  await interaction.update({ embeds: [buildShopEmbed(updated)], components: shopCompRows(updated) });
}

async function handleAbilBuy(interaction: ButtonInteraction, kind: string) {
  await upsertPlayer(interaction.user.id, interaction.user.username);
  if (!isAbilityKey(kind)) return;
  const updated = await buyAbility(interaction.user.id, kind as AbilityKind, ABILITY_BUY_COST);
  if (updated) {
    const lvl = kind === "empower" ? updated.abilityEmpowerLevel : updated.abilityShieldLevel;
    await applyAbilityLevelToActiveParticipant(interaction.user.id, kind as AbilityKind, lvl);
  }
  if (!updated) {
    await interaction.reply({ content: `❌ Nu poți debloca abilitatea — ai nevoie de **${ABILITY_BUY_COST} Oboli** și să nu o deții deja.`, ephemeral: true });
    return;
  }
  await interaction.update({ embeds: [buildShopEmbed(updated)], components: shopAbilRows(updated) });
}

async function handleAbilUpgrade(interaction: ButtonInteraction, kind: string) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  if (!isAbilityKey(kind)) return;
  const curLvl = kind === "empower" ? p.abilityEmpowerLevel : p.abilityShieldLevel;
  const cost = upgradeCost(curLvl);
  const updated = await upgradeAbility(interaction.user.id, kind as AbilityKind, curLvl, cost, UPGRADE_XP_COST);
  if (updated) {
    const lvl = kind === "empower" ? updated.abilityEmpowerLevel : updated.abilityShieldLevel;
    await applyAbilityLevelToActiveParticipant(interaction.user.id, kind as AbilityKind, lvl);
  }
  if (!updated) {
    await interaction.reply({ content: `❌ Upgrade eșuat — ai nevoie de abilitate, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`, ephemeral: true });
    return;
  }
  await interaction.update({ embeds: [buildShopEmbed(updated)], components: shopAbilRows(updated) });
}

async function handleAbility(interaction: ButtonInteraction, eventId: number, kind: string) {
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p || !p.isAlive) {
    await interaction.reply({ content: "❌ Trebuie să fii în luptă ca să folosești abilități!", ephemeral: true });
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.update({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.update({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }
  if (p.abilityReadyAt && p.abilityReadyAt.getTime() > Date.now()) {
    await interaction.reply({ content: `⏳ Abilitatea e pe cooldown — mai așteaptă **${formatCooldown(p.abilityReadyAt)}**.`, ephemeral: true });
    return;
  }

  const readyAt = new Date(Date.now() + ABILITY_COOLDOWN_MS);
  const flags = kind === "shield" ? { shieldNext: true } : { empowerNext: true };
  const note = kind === "shield"
    ? "🛡️ **Scut de Cenușă activat!** Următorul atac primit va fi înjumătățit."
    : "🌑 **Lovitura Umbrei pregătită!** Următoarea ta lovitură va fi dublă.";
  const updated = await updateParticipant(p.id, { ...flags, abilityReadyAt: readyAt });
  await interaction.update({
    embeds: [buildCombatEmbed(updated, note, interaction.user.displayAvatarURL({ size: 256 }))],
    components: [combatRow(eventId, updated)],
  });
}

const BOSS_HIT_COOLDOWN_MS = 4000;
const EVENT_CHANNEL_ID = "1472579703457190042";

async function handleFinalBoss(interaction: ButtonInteraction, eventId: number) {
  // Boss fight happens AFTER the event ends — check activeBossMap, not DB active status
  const boss = activeBossMap.get(eventId);
  if (!boss) {
    await interaction.reply({ content: "⌛ Dragonul nu a fost invocat încă.", ephemeral: true });
    return;
  }
  if (boss.defeated) {
    await interaction.reply({ content: "💀 Dragonul Stins a fost deja înfrânt de Regat!", ephemeral: true });
    return;
  }

  const p = await getParticipant(eventId, interaction.user.id);
  if (!p) {
    await interaction.reply({ content: "❌ Doar cei care au intrat în luptă pot lovi Dragonul Stins!", ephemeral: true });
    return;
  }
  if (!p.isAlive) {
    await interaction.reply({ content: "💀 Doar cei vii îl pot lovi pe Dragonul Stins.", ephemeral: true });
    return;
  }

  const uid = interaction.user.id;

  // Initialize player HP from their remaining HP at end of event (first hit)
  if (!boss.playerHp.has(uid)) {
    boss.playerHp.set(uid, Math.max(10, p.currentHp));
  }
  const myHp = boss.playerHp.get(uid)!;

  // Dead players can't attack
  if (myHp <= 0) {
    await interaction.reply({ content: "💀 Ești căzut în luptă! Dragonul te-a doborât — nu mai poți lovi.", ephemeral: true });
    return;
  }

  // 4-second cooldown per player
  const lastHit = boss.lastHitAt.get(uid) ?? 0;
  const elapsed = Date.now() - lastHit;
  if (elapsed < BOSS_HIT_COOLDOWN_MS) {
    const remaining = Math.ceil((BOSS_HIT_COOLDOWN_MS - elapsed) / 1000);
    await interaction.reply({
      content: `⏳ Recuperare… mai poți lovi în **${remaining}s**!\n❤️ Viața ta: **${myHp} HP** | 🐉 Dragon: **${boss.currentHp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP**`,
      ephemeral: true,
    });
    return;
  }

  // Player damage based on attack stat
  const minDmg = Math.max(30, p.attackBonus * 5 + 20);
  const maxDmg = Math.max(80, p.attackBonus * 15 + 60);
  const playerDmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;

  // Boss counter-attack — REAL damage to player HP
  const rawBossHit = Math.floor(Math.random() * 121) + 80; // 80–200
  const shieldActive = false; // future: p.shieldNext
  const bossHit = shieldActive ? Math.floor(rawBossHit / 2) : rawBossHit;
  const newPlayerHp = Math.max(0, myHp - bossHit);

  // Apply damage
  boss.lastHitAt.set(uid, Date.now());
  boss.damageBy.set(uid, (boss.damageBy.get(uid) ?? 0) + playerDmg);
  boss.currentHp = Math.max(0, boss.currentHp - playerDmg);
  boss.playerHp.set(uid, newPlayerHp);

  const bossDefeated = boss.currentHp <= 0 && !boss.defeated;

  if (bossDefeated) {
    boss.defeated = true;
    activeBossMap.delete(eventId);

    // Reward everyone who dealt damage
    const damagers = [...boss.damageBy.keys()];
    await Promise.all(damagers.flatMap((discordId) => [
      addPlayerReputation(discordId, 50),
      addPlayerGold(discordId, 150),
      addPlayerXp(discordId, 250),
    ]));

    // Update boss message + send leaderboard
    try {
      const ch = await interaction.client.channels.fetch(EVENT_CHANNEL_ID);
      if (ch instanceof TextChannel) {
        const bossMsg = await ch.messages.fetch(boss.messageId).catch(() => null);
        if (bossMsg) {
          const deadRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`finalboss_dead_${eventId}`)
              .setLabel("Dragonul a căzut!")
              .setEmoji("💀")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
          await bossMsg.edit({
            embeds: [buildFinalBossEmbed(boss.level, boss.rarity, 0, boss.maxHp)],
            components: [deadRow],
          }).catch(() => null);
        }
        const leaderboard = buildBossLeaderboard(boss, boss.damageBy, boss.participants);
        await ch.send({ embeds: [leaderboard] }).catch(() => null);
      }
    } catch { /* ignore */ }

    await interaction.reply({
      content:
        `⚔️ **${interaction.user.username}** a dat lovitura finală! **${playerDmg.toLocaleString()} daune**!\n` +
        `💀 **Dragonul Stins a căzut!** Regatul este salvat!\n` +
        `🏅 Toți ${damagers.length} luptători primesc: **+50 Reputație, +150 Oboli, +250 XP**!`,
    });
    return;
  }

  // Update boss embed with new HP
  try {
    const ch = await interaction.client.channels.fetch(EVENT_CHANNEL_ID);
    if (ch instanceof TextChannel) {
      const bossMsg = await ch.messages.fetch(boss.messageId).catch(() => null);
      if (bossMsg) {
        await bossMsg.edit({
          embeds: [buildFinalBossEmbed(boss.level, boss.rarity, boss.currentHp, boss.maxHp)],
          components: [finalBossRow(eventId)],
        }).catch(() => null);
      }
    }
  } catch { /* ignore */ }

  const playerStatus = newPlayerHp <= 0
    ? `💀 **Ai fost doborât de Dragon!** Nu mai poți lovi.`
    : `❤️ Viața ta: **${newPlayerHp} / ${Math.max(10, p.currentHp)} HP**`;

  await interaction.reply({
    content:
      `⚔️ Ai lovit Dragonul pentru **${playerDmg.toLocaleString()} daune**!\n` +
      `🐉 Dragonul te lovește pentru **${bossHit} daune**! ${playerStatus}\n` +
      `🩸 Dragon: **${boss.currentHp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP**`,
    ephemeral: true,
  });
}


async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith("profile_view_")) {
    return handleViewProfile(interaction, id.replace("profile_view_", ""));
  }

  if (id.startsWith("chest_") && !id.endsWith("_claimed") && !id.endsWith("_expired") && !id.endsWith("_opening")) {
    const match = id.match(/^(chest_\d+)_(\d+)$/);
    if (match) {
      return handleChestClaim(interaction, match[1]!, parseInt(match[2]!));
    }
    const simpleMatch = id.match(/^(chest_\d+)$/);
    if (simpleMatch) {
      const msgEmbed = interaction.message.embeds[0];
      const goldMatch = msgEmbed?.description?.match(/\*\*(\d+) Oboli\*\*/);
      const gold = goldMatch ? parseInt(goldMatch[1]!) : 50;
      return handleChestClaim(interaction, simpleMatch[1]!, gold);
    }
  }

  if (id.startsWith("ora_join_")) return handleJoin(interaction, parseInt(id.replace("ora_join_", "")));
  if (id.startsWith("ora_attack_")) return handleAttack(interaction, parseInt(id.replace("ora_attack_", "")));
  if (id.startsWith("ora_ability_")) {
    const parts = id.split("_"); // ora_ability_<eventId>_<kind>
    return handleAbility(interaction, parseInt(parts[2]!), parts[3]!);
  }
  if (id.startsWith("ora_retreat_")) return handleRetreat(interaction, parseInt(id.replace("ora_retreat_", "")));
  if (id.startsWith("finalboss_")) return handleFinalBoss(interaction, parseInt(id.replace("finalboss_", "")));
  if (id.startsWith("class_pick_")) return handleClassPick(interaction, id.replace("class_pick_", ""));

  if (id === "shop_nav_stats") return handleShopNavStats(interaction);
  if (id === "shop_nav_comp") return handleShopNavComp(interaction);
  if (id === "shop_nav_abil") return handleShopNavAbil(interaction);
  if (id === "shop_back") return handleShopBack(interaction);

  if (id.startsWith("shop_buy_")) {
    return handleBuy(interaction, id.replace("shop_buy_", "") as ShopKey);
  }
  if (id.startsWith("shop_compbuy_")) return handleCompBuy(interaction, id.replace("shop_compbuy_", ""));
  if (id === "shop_compup") return handleCompUpgrade(interaction);
  if (id.startsWith("shop_abilbuy_")) return handleAbilBuy(interaction, id.replace("shop_abilbuy_", ""));
  if (id.startsWith("shop_abilup_")) return handleAbilUpgrade(interaction, id.replace("shop_abilup_", ""));

  if (id.startsWith("ora_lvlup_")) {
    const parts = id.split("_");
    const bonus = parts[parts.length - 1]!;
    const eventId = parseInt(parts[2]!);
    return handleLevelup(interaction, eventId, bonus);
  }
}

export async function startBot(onReady?: () => void): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot will not start");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // `terminated` rejects when a fatal Gateway close code is received.
  // It stays pending for non-fatal disconnects — discord.js handles those.
  let rejectTerminated!: (err: Error) => void;
  const terminated = new Promise<void>((_, reject) => {
    rejectTerminated = reject;
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "✅ Discord bot online and ready");
    botClient = client;
    botReadyAt = new Date();
    shardStatus = "ready";
    if (!schedulerStarted) {
      schedulerStarted = true;
      startScheduler(client);
    } else {
      logger.info("Scheduler already running — skipping re-init after restart");
    }
    if (onReady) onReady();
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  // Schedule a delayed alert when the shard disconnects non-fatally.
  // disconnectStartedAt must be set by the caller before invoking this.
  function scheduleDisconnectAlert(closeCode: number) {
    if (disconnectAlertTimer) return; // already pending
    const thresholdMin = Math.round(DISCONNECT_ALERT_THRESHOLD_MS / 60_000);
    disconnectAlertTimer = setTimeout(() => {
      disconnectAlertTimer = null;
      void sendAlert(
        `⚠️ **Bot has been offline for over ${thresholdMin} minute${thresholdMin === 1 ? "" : "s"}** and has not reconnected yet.\nShard disconnected with code ${closeCode}. Check server logs for details.`,
      );
    }, DISCONNECT_ALERT_THRESHOLD_MS);
  }

  // Cancel a pending disconnect alert (bot reconnected in time) or send a
  // recovery alert if the outage alert already fired.
  // disconnectStartedAt set + timer pending  → alert not yet sent, suppress it
  // disconnectStartedAt set + timer null     → alert already sent, send recovery
  function clearDisconnectAlert(reason: string) {
    if (disconnectAlertTimer) {
      clearTimeout(disconnectAlertTimer);
      disconnectAlertTimer = null;
      disconnectStartedAt = null;
      logger.info({ reason }, "Disconnect alert suppressed — bot reconnected within threshold");
    } else if (disconnectStartedAt) {
      const startedAt = disconnectStartedAt;
      disconnectStartedAt = null;
      logger.info({ reason }, "Sending recovery alert — bot back online after outage");
      void sendRecoveryAlert(startedAt);
    }
  }

  client.on(Events.ShardDisconnect, (event, shardId) => {
    if (FATAL_CLOSE_CODES.has(event.code)) {
      logger.error(
        { code: event.code, shardId },
        "Fatal Discord disconnect — discord.js will not reconnect; bot supervisor will restart",
      );
      botClient = null;
      shardStatus = "fatal_disconnect";
      client.destroy();
      void sendAlert(
        `🚨 **Bot offline — fatal disconnect (code ${event.code}).**\nDiscord will not auto-reconnect. The bot supervisor is restarting. If it remains offline, check logs and verify \`DISCORD_TOKEN\`.`,
      );
      rejectTerminated(new Error(`Fatal Discord Gateway close code ${event.code}`));
    } else {
      logger.warn(
        { code: event.code, shardId },
        "Discord shard disconnected — discord.js will reconnect automatically",
      );
      shardStatus = "disconnected";
      if (!disconnectStartedAt) disconnectStartedAt = new Date();
      scheduleDisconnectAlert(event.code);
    }
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info({ shardId }, "Discord shard reconnecting…");
    shardStatus = "reconnecting";
  });

  // Session resumed — bot reconnected via the existing session.
  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    clearDisconnectAlert("ShardResume");
    shardStatus = "ready";
    botReadyAt = new Date();
    logger.info({ shardId, replayedEvents }, "Discord shard resumed");
  });

  // Shard ready — bot reconnected via a fresh identify (session expired / not resumable).
  client.on(Events.ShardReady, (shardId) => {
    clearDisconnectAlert("ShardReady");
    shardStatus = "ready";
    botReadyAt = new Date();
    logger.info({ shardId }, "Discord shard ready (fresh identify)");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "profil") await handleProfil(interaction);
        if (interaction.commandName === "clasament") await handleClasament(interaction);
        if (interaction.commandName === "magazin") await handleMagazin(interaction);
        if (interaction.commandName === "clasa") await handleClasa(interaction);
        if (interaction.commandName === "companion") await handleCompanion(interaction);
        if (interaction.commandName === "startevent") await handleStartEvent(interaction);
        if (interaction.commandName === "cufar") await handleSpawnChest(interaction);
        if (interaction.commandName === "spawnboss") await handleSpawnBoss(interaction);
      } else if (interaction.isButton()) {
        await handleButton(interaction as ButtonInteraction);
      }
    } catch (err) {
      logger.error({ err }, "Interaction error");
      try {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "❌ A apărut o eroare. Încearcă din nou.", ephemeral: true });
        }
      } catch {
        // ignore — interaction window may have expired
      }
    }
  });

  await client.login(token);

  const rest = new REST().setToken(token);
  const body = slashCommands.map((c) => c.toJSON());
  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: [] });
  await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID), { body });
  logger.info("Commands registered");

  // Hold here until a fatal disconnect signals the supervisor to restart.
  await terminated;
}
