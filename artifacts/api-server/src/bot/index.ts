import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  ChatInputCommandInteraction,
} from "discord.js";
import { commands } from "./commands";
import { logger } from "../lib/logger";

export async function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot not started");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.find((c) => c.data.name === interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction as ChatInputCommandInteraction);
    } catch (err) {
      logger.error({ err }, "Error executing command");
      const method = interaction.replied || interaction.deferred
        ? interaction.followUp.bind(interaction)
        : interaction.reply.bind(interaction);
      await method({ content: "A apărut o eroare!", ephemeral: true });
    }
  });

  await client.login(token);

  const rest = new REST().setToken(token);
  const applicationId = "1472675543777280071";

  const commandData = commands.map((c) => c.data.toJSON());

  try {
    await rest.put(Routes.applicationCommands(applicationId), {
      body: commandData,
    });
    logger.info("Slash commands registered globally");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}
