import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";

type Command = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: Command[] = [
  {
    data: new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Răspunde cu Pong! Testează dacă botul funcționează."),
    async execute(interaction) {
      const latency = Date.now() - interaction.createdTimestamp;
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🏓 Pong!")
            .addFields(
              { name: "Latență bot", value: `${latency}ms`, inline: true },
              {
                name: "Latență API",
                value: `${Math.round(interaction.client.ws.ping)}ms`,
                inline: true,
              },
            )
            .setTimestamp(),
        ],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("salut")
      .setDescription("Botul te salută!"),
    async execute(interaction) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("👋 Salut!")
            .setDescription(
              `Bună, ${interaction.user.username}! Mă bucur că ești aici!`,
            )
            .setTimestamp(),
        ],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("zar")
      .setDescription("Aruncă un zar și obține un număr de la 1 la 6."),
    async execute(interaction) {
      const result = Math.floor(Math.random() * 6) + 1;
      const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🎲 Zaruri!")
            .setDescription(
              `${faces[result - 1]} Ai obținut **${result}**!`,
            )
            .setTimestamp(),
        ],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("moneda")
      .setDescription("Aruncă o monedă — cap sau pajură!"),
    async execute(interaction) {
      const result = Math.random() < 0.5 ? "Cap 🪙" : "Pajură 🦅";
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xeb459e)
            .setTitle("🪙 Aruncat moneda!")
            .setDescription(`Rezultat: **${result}**`)
            .setTimestamp(),
        ],
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("info")
      .setDescription("Informații despre bot și badge-ul Active Developer."),
    async execute(interaction) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("ℹ️ Info Bot")
            .setDescription(
              "Bot creat pentru badge-ul **Active Developer** pe Discord!",
            )
            .addFields(
              {
                name: "📋 Comenzi disponibile",
                value:
                  "`/ping` `/salut` `/zar` `/moneda` `/info`",
              },
              {
                name: "🏆 Scop",
                value:
                  "Folosește orice comandă slash o dată pentru a activa badge-ul Active Developer!",
              },
            )
            .setFooter({ text: `Solicitat de ${interaction.user.username}` })
            .setTimestamp(),
        ],
      });
    },
  },
];
