import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ComponentType,
} from "discord.js";
import { logger } from "../lib/logger";
import { startScheduler } from "./scheduler";
import { upsertPlayer, applyRewards, claimEvent, hasClaimedEvent, getActiveEvent } from "./db";
import { EVENT_DEFS } from "./events";

const APPLICATION_ID = "1472675543777280071";
const GUILD_ID = "1382035307607883816";

const slashCommands = [
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("📜 Vezi statisticile tale din Regatul Cenușii."),
  new SlashCommandBuilder()
    .setName("clasament")
    .setDescription("👑 Top 10 cei mai puternici din regat."),
];

async function handleProfil(interaction: ChatInputCommandInteraction) {
  const player = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x8a4a2f)
        .setTitle(`📜 Profilul lui ${player.username}`)
        .addFields(
          { name: "⭐ XP", value: `${player.xp}`, inline: true },
          { name: "🪙 Aur", value: `${player.gold}`, inline: true },
          { name: "🏅 Reputație", value: `${player.reputation}`, inline: true },
          { name: "❤️ HP", value: `${player.hp}/100`, inline: true },
        )
        .setFooter({ text: "Participă la evenimente pentru a crește!" })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}

async function handleButtonClick(interaction: ButtonInteraction) {
  const customId = interaction.customId;
  if (!customId.startsWith("event_") || customId.startsWith("expired_")) return;

  const eventId = parseInt(customId.replace("event_", ""), 10);
  if (isNaN(eventId)) return;

  await interaction.deferReply({ ephemeral: true });

  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Evenimentul s-a încheiat deja!" });
    return;
  }

  const alreadyClaimed = await hasClaimedEvent(eventId, interaction.user.id);
  if (alreadyClaimed) {
    await interaction.editReply({ content: "❌ Ai participat deja la acest eveniment!" });
    return;
  }

  const claimed = await claimEvent(eventId, interaction.user.id);
  if (!claimed) {
    await interaction.editReply({ content: "❌ Ai participat deja la acest eveniment!" });
    return;
  }

  const player = await upsertPlayer(interaction.user.id, interaction.user.username);
  const def = EVENT_DEFS[ev.eventType as keyof typeof EVENT_DEFS];
  if (!def) {
    await interaction.editReply({ content: "⚠️ Eroare internă." });
    return;
  }

  const reward = def.calcRewards();
  const updated = await applyRewards(player.discordId, {
    xp: reward.xp,
    gold: reward.gold,
    reputation: reward.reputation,
    hpChange: reward.hpChange,
  });

  const fields = [];
  if (reward.xp !== 0) fields.push({ name: "⭐ XP", value: `${reward.xp > 0 ? "+" : ""}${reward.xp}`, inline: true });
  if (reward.gold !== 0) fields.push({ name: "🪙 Aur", value: `${reward.gold > 0 ? "+" : ""}${reward.gold}`, inline: true });
  if (reward.reputation !== 0) fields.push({ name: "🏅 Reputație", value: `${reward.reputation > 0 ? "+" : ""}${reward.reputation}`, inline: true });
  if (reward.hpChange !== 0) fields.push({ name: "❤️ HP", value: `${reward.hpChange > 0 ? "+" : ""}${reward.hpChange}`, inline: true });

  fields.push({ name: "📊 Total", value: `XP: ${updated.xp} | Aur: ${updated.gold} | Rep: ${updated.reputation} | HP: ${updated.hp}`, inline: false });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(reward.hpChange < 0 ? 0xe74c3c : 0x8a4a2f)
        .setTitle("⚔️ Regatul Cenușii")
        .setDescription(reward.message)
        .addFields(fields)
        .setTimestamp(),
    ],
  });
}

export async function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot not started");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
    startScheduler(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "profil") await handleProfil(interaction);
      } else if (interaction.isButton()) {
        await handleButtonClick(interaction as ButtonInteraction);
      }
    } catch (err) {
      logger.error({ err }, "Interaction error");
    }
  });

  await client.login(token);

  const rest = new REST().setToken(token);
  const commandData = slashCommands.map((c) => c.toJSON());

  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: [] });
  await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID), { body: commandData });
  logger.info("Commands registered");
}
