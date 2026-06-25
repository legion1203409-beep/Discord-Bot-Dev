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
import { startScheduler, APPLICATION_ID, fireEvent, claimedChests } from "./scheduler";
import {
  upsertPlayer,
  joinEvent,
  getParticipant,
  updateParticipant,
  getActiveEvent,
  addPlayerXp,
  addPlayerGold,
  deductPlayerGold,
  buyPlayerUpgrade,
  applyUpgradeToActiveParticipant,
  getTopPlayers,
  recordPlayerDeath,
  recordPlayerRetreat,
  getPlayerById,
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
  combatRow,
  shopRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  SHOP_COUNT_KEY,
  LEVELUP_INTERVAL,
  type ShopKey,
} from "./survival";

const GUILD_ID = "1382035307607883816";

let botClient: Client | null = null;

const slashCommands = [
  new SlashCommandBuilder().setName("profil").setDescription("📜 Statisticile tale din Regatul Cenușii."),
  new SlashCommandBuilder().setName("clasament").setDescription("👑 Top 10 cei mai puternici luptători."),
  new SlashCommandBuilder().setName("magazin").setDescription("🏺 Forja Cenușii — upgrade-uri permanente, mereu disponibilă."),
  new SlashCommandBuilder()
    .setName("startevent")
    .setDescription("🔥 [Admin] Pornește manual Ora Umbrelor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

async function handleProfil(interaction: ChatInputCommandInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({ embeds: [buildProfileEmbed(p)], ephemeral: true });
}

async function handleMagazin(interaction: ChatInputCommandInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({ embeds: [buildShopEmbed(p)], components: shopRows(p), ephemeral: true });
}

async function handleStartEvent(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ content: "🔥 *Umbrele se mișcă…* Evenimentul pornește!", ephemeral: true });
  if (botClient) await fireEvent(botClient);
}

async function handleClasament(interaction: ChatInputCommandInteraction) {
  const top = await getTopPlayers();
  const medals = ["🥇", "🥈", "🥉"];

  const lines = top.map((p, i) => {
    const deathStr = p.deaths > 0 ? ` | 💀 ${p.deaths}×(Niv.${p.deathLevel})` : "";
    const fledStr = p.retreats > 0 ? ` | 🏳️ ${p.retreats}× a fugit` : "";
    return `${medals[i] ?? `**${i + 1}.**`} **${p.username}** — ${p.xp} XP${deathStr}${fledStr}`;
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
  await interaction.reply({ embeds: [buildProfileEmbed(player)], ephemeral: true });
}

async function handleChestClaim(interaction: ButtonInteraction, chestId: string, gold: number) {
  if (claimedChests.has(chestId)) {
    await interaction.reply({ content: "😔 Cineva a fost mai rapid! Cufărul a fost deja revendicat.", ephemeral: true });
    return;
  }
  claimedChests.add(chestId);

  await upsertPlayer(interaction.user.id, interaction.user.username);
  await addPlayerGold(interaction.user.id, gold);

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Revendicat de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );

  await interaction.update({ components: [disabledRow] });
  await interaction.followUp({
    content: `🎉 **${interaction.user.username}** a revendicat cufărul și a câștigat **${gold} Oboli**! 💰`,
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
  await interaction.editReply({ embeds: [buildCombatEmbed(participant)], components: [combatRow(eventId)] });
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
  const extra = buildResultText(result);

  if (result.playerDied) {
    const lost = Math.floor(p.oboli * 0.2);
    await updateParticipant(p.id, { isAlive: false, currentHp: 0 });
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
    ]);
  }

  if (result.levelUp) {
    const newLevel = Math.floor(result.newMonsterLevel / LEVELUP_INTERVAL);
    await updateParticipant(p.id, {
      currentHp: result.newPlayerHp,
      monsterLevel: result.newMonsterLevel,
      monsterCurrentHp: monsterMaxHp(result.newMonsterLevel),
      totalDamage: p.totalDamage + result.playerDmg,
      oboli: p.oboli + result.oboliGained,
      pendingLevelup: true,
    });
    await interaction.update({ embeds: [buildLevelupEmbed(newLevel)], components: levelupRows(eventId) });
    return;
  }

  const updated = await updateParticipant(p.id, {
    currentHp: result.newPlayerHp,
    monsterLevel: result.newMonsterLevel,
    monsterCurrentHp: result.newMonsterHp,
    totalDamage: p.totalDamage + result.playerDmg,
    oboli: p.oboli + result.oboliGained,
  });

  await interaction.update({ embeds: [buildCombatEmbed(updated, extra)], components: [combatRow(eventId)] });
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
  await interaction.update({ embeds: [buildCombatEmbed(updated, "✨ **Bonus ales! Umbrele îți recunosc puterea.**")], components: [combatRow(eventId)] });
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
  if (id.startsWith("ora_retreat_")) return handleRetreat(interaction, parseInt(id.replace("ora_retreat_", "")));

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
        if (interaction.commandName === "startevent") await handleStartEvent(interaction);
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
