import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  ButtonInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../lib/logger";
import { startScheduler, APPLICATION_ID } from "./scheduler";
import {
  upsertPlayer,
  joinEvent,
  getParticipant,
  updateParticipant,
  getActiveEvent,
  addPlayerXp,
  getTopPlayers,
} from "./db";
import {
  doCombat,
  buildCombatEmbed,
  buildResultText,
  buildDeathEmbed,
  buildShopEmbed,
  buildLevelupEmbed,
  combatRow,
  shopRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  LEVELUP_INTERVAL,
  type ShopKey,
} from "./survival";

const GUILD_ID = "1382035307607883816";

const slashCommands = [
  new SlashCommandBuilder().setName("profil").setDescription("📜 Statisticile tale din Regatul Cenușii."),
  new SlashCommandBuilder().setName("clasament").setDescription("👑 Top 10 cei mai puternici luptători."),
];

async function handleProfil(interaction: ChatInputCommandInteraction) {
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x8a4a2f)
        .setTitle(`📜 Profilul lui ${p.username}`)
        .addFields(
          { name: "⭐ XP Total", value: `${p.xp}`, inline: true },
          { name: "🪙 Aur", value: `${p.gold}`, inline: true },
          { name: "🏅 Reputație", value: `${p.reputation}`, inline: true },
        )
        .setFooter({ text: "Participă la Ora Umbrelor pentru a crește!" })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}

async function handleClasament(interaction: ChatInputCommandInteraction) {
  const top = await getTopPlayers();
  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.map((p, i) => `${medals[i] ?? `**${i + 1}.**`} **${p.username}** — ${p.xp} XP`).join("\n");
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x8a4a2f)
        .setTitle("👑 Clasament – Regatul Cenușii")
        .setDescription(lines || "*Nimeni nu a luptat încă.*")
        .setTimestamp(),
    ],
  });
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
    await addPlayerXp(p.discordId, p.oboli);
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
    startScheduler(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "profil") await handleProfil(interaction);
        if (interaction.commandName === "clasament") await handleClasament(interaction);
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
