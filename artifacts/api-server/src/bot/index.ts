import {
  Client,
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
import { startScheduler, APPLICATION_ID, fireEvent, fireChest, claimedChests } from "./scheduler";
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
  recordFinalBossHit,
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
  combatRow,
  shopRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  formatCooldown,
  levelTitle,
  CLASSES,
  isClassKey,
  SHOP_COUNT_KEY,
  LEVELUP_INTERVAL,
  ABILITY_COOLDOWN_MS,
  type ShopKey,
} from "./survival";

const GUILD_ID = "1382035307607883816";

let botClient: Client | null = null;

const slashCommands = [
  new SlashCommandBuilder().setName("profil").setDescription("📜 Statisticile tale din Regatul Cenușii."),
  new SlashCommandBuilder().setName("clasament").setDescription("👑 Top 10 cei mai puternici luptători."),
  new SlashCommandBuilder().setName("magazin").setDescription("🏺 Forja Cenușii — upgrade-uri permanente, mereu disponibilă."),
  new SlashCommandBuilder().setName("clasa").setDescription("🧬 Alege-ți clasa RPG (alegere permanentă)."),
  new SlashCommandBuilder()
    .setName("startevent")
    .setDescription("🔥 [Admin] Pornește manual Ora Umbrelor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("cufar")
    .setDescription("📦 [Admin] Generează manual un cufăr cu Oboli.")
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
  await interaction.update({ embeds: [buildShopEmbed(player)], components: shopRows(player) });
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

async function handleFinalBoss(interaction: ButtonInteraction, eventId: number) {
  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.reply({ content: "⌛ Dragonul Stins s-a întors în Abis — Ora Umbrelor s-a încheiat.", ephemeral: true });
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
  await upsertPlayer(interaction.user.id, interaction.user.username);
  const first = await recordFinalBossHit(eventId, interaction.user.id);
  if (!first) {
    await interaction.reply({ content: "🐉 Ai lovit deja Dragonul Stins! Fiecare luptător lovește o singură dată.", ephemeral: true });
    return;
  }
  await Promise.all([
    addPlayerReputation(interaction.user.id, 50),
    addPlayerGold(interaction.user.id, 150),
    addPlayerXp(interaction.user.id, 250),
  ]);
  await interaction.reply({
    content: "🐉⚔️ Ai lovit **Dragonul Stins**! Recompensă: **+50 Reputație, +150 Oboli, +250 XP**!",
    ephemeral: true,
  });
}

async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith("profile_view_")) {
    return handleViewProfile(interaction, id.replace("profile_view_", ""));
  }

  if (id.startsWith("chest_") && !id.endsWith("_claimed") && !id.endsWith("_expired")) {
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

  if (id.startsWith("shop_buy_")) {
    return handleBuy(interaction, id.replace("shop_buy_", "") as ShopKey);
  }

  if (id.startsWith("ora_lvlup_")) {
    const parts = id.split("_");
    const bonus = parts[parts.length - 1]!;
    const eventId = parseInt(parts[2]!);
    return handleLevelup(interaction, eventId, bonus);
  }
}

export async function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) { logger.warn("DISCORD_TOKEN not set"); return; }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
    botClient = client;
    startScheduler(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "profil") await handleProfil(interaction);
        if (interaction.commandName === "clasament") await handleClasament(interaction);
        if (interaction.commandName === "magazin") await handleMagazin(interaction);
        if (interaction.commandName === "clasa") await handleClasa(interaction);
        if (interaction.commandName === "startevent") await handleStartEvent(interaction);
        if (interaction.commandName === "cufar") await handleSpawnChest(interaction);
      } else if (interaction.isButton()) {
        await handleButton(interaction as ButtonInteraction);
      }
    } catch (err) {
      logger.error({ err }, "Interaction error");
    }
  });

  await client.login(token);

  const rest = new REST().setToken(token);
  const body = slashCommands.map((c) => c.toJSON());
  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: [] });
  await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID), { body });
  logger.info("Commands registered");
}
