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
  getLatestActiveEvent,
  addPlayerXp,
  addPlayerGold,
  getTopPlayers,
  recordPlayerDeath,
  getPlayerById,
} from "./db";
import {
  doCombat,
  buildCombatEmbed,
  buildResultText,
  buildDeathEmbed,
  buildShopEmbed,
  buildLevelupEmbed,
  buildProfileEmbed,
  buildChestEmbed,
  combatRow,
  shopRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  LEVELUP_INTERVAL,
  type ShopKey,
} from "./survival";

const GUILD_ID = "1382035307607883816";

let botClient: Client | null = null;

const slashCommands = [
  new SlashCommandBuilder().setName("profil").setDescription("📜 Statisticile tale din Regatul Cenușii."),
  new SlashCommandBuilder().setName("clasament").setDescription("👑 Top 10 cei mai puternici luptători."),
  new SlashCommandBuilder().setName("magazin").setDescription("🏺 Deschide Forja Cenușii în evenimentul activ."),
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
  const ev = await getLatestActiveEvent();
  if (!ev) {
    await interaction.reply({ content: "❌ Nu există niciun eveniment activ acum. Așteaptă **Ora Umbrelor**!", ephemeral: true });
    return;
  }
  const p = await getParticipant(ev.id, interaction.user.id);
  if (!p) {
    await interaction.reply({ content: `❌ Nu ești înscris în evenimentul activ. Intră în luptă mai întâi din <#1472579703457190042>!`, ephemeral: true });
    return;
  }
  if (!p.isAlive) {
    await interaction.reply({ embeds: [buildDeathEmbed()], ephemeral: true });
    return;
  }
  await interaction.reply({ embeds: [buildShopEmbed(p)], components: shopRows(ev.id, p), ephemeral: true });
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
    return `${medals[i] ?? `**${i + 1}.**`} **${p.username}** — ${p.xp} XP${deathStr}`;
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
    content: `🎉 **${interaction.user.username}** a revendicat cufărul și a câștigat **${gold} Aur**! 💰`,
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
    await interaction.update({ embeds: [buildDeathEmbed()], components: [] });
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
    await updateParticipant(p.id, { isAlive: false, currentHp: 0 });
    await Promise.all([
      addPlayerXp(p.discordId, p.oboli),
      addPlayerGold(p.discordId, p.oboli),
      recordPlayerDeath(p.discordId, p.monsterLevel),
    ]);
    await interaction.update({ embeds: [buildDeathEmbed()], components: [] });
    return;
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

async function handleShop(interaction: ButtonInteraction, eventId: number) {
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p || !p.isAlive) { await interaction.reply({ content: "❌ Nu ești în luptă!", ephemeral: true }); return; }
  await interaction.update({ embeds: [buildShopEmbed(p)], components: shopRows(eventId, p) });
}

async function handleBuy(interaction: ButtonInteraction, eventId: number, key: ShopKey) {
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p || !p.isAlive) { await interaction.reply({ content: "❌ Nu ești în luptă!", ephemeral: true }); return; }

  const countKey = `shop${key.charAt(0).toUpperCase() + key.slice(1)}Count` as keyof typeof p;
  const count = p[countKey] as number;
  const cost = shopPrice(key, count);

  if (p.oboli < cost) {
    await interaction.update({ embeds: [buildShopEmbed(p)], components: shopRows(eventId, p) });
    return;
  }

  const statUpdates: Record<ShopKey, Partial<typeof p>> = {
    atac: { attackBonus: p.attackBonus + 2, shopAttackCount: count + 1 },
    def: { defenseBonus: p.defenseBonus + 2, shopDefenseCount: count + 1 },
    dodge: { dodgeBonus: p.dodgeBonus + 3, shopDodgeCount: count + 1 },
    crit: { critBonus: p.critBonus + 2, shopCritCount: count + 1 },
    hp: { maxHp: p.maxHp + 10, currentHp: Math.min(p.maxHp + 10, p.currentHp + 5), shopHpCount: count + 1 },
  };

  const updated = await updateParticipant(p.id, { ...statUpdates[key], oboli: p.oboli - cost });
  await interaction.update({ embeds: [buildShopEmbed(updated)], components: shopRows(eventId, updated) });
}

async function handleBackToCombat(interaction: ButtonInteraction, eventId: number) {
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p || !p.isAlive) { await interaction.reply({ content: "❌ Nu ești în luptă!", ephemeral: true }); return; }
  await interaction.update({ embeds: [buildCombatEmbed(p)], components: [combatRow(eventId)] });
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
      const goldMatch = msgEmbed?.description?.match(/\*\*(\d+) Aur\*\*/);
      const gold = goldMatch ? parseInt(goldMatch[1]!) : 50;
      return handleChestClaim(interaction, simpleMatch[1]!, gold);
    }
  }

  if (id.startsWith("ora_join_")) return handleJoin(interaction, parseInt(id.replace("ora_join_", "")));
  if (id.startsWith("ora_attack_")) return handleAttack(interaction, parseInt(id.replace("ora_attack_", "")));
  if (id.startsWith("ora_shop_")) return handleShop(interaction, parseInt(id.replace("ora_shop_", "")));
  if (id.startsWith("ora_combat_")) return handleBackToCombat(interaction, parseInt(id.replace("ora_combat_", "")));

  if (id.startsWith("ora_buy_")) {
    const parts = id.split("_");
    const key = parts[parts.length - 1] as ShopKey;
    const eventId = parseInt(parts[2]!);
    return handleBuy(interaction, eventId, key);
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
