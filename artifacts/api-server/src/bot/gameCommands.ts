import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import {
  getPlayer,
  createPlayer,
  calcAurAcumulat,
  adaugarGold,
  updatePlayer,
  topPlayers,
  putereAtac,
  randomNpc,
  calcNivel,
  TRUPE,
  MINA_COST,
  MINA_MAX,
  type TrupaKey,
} from "./game";

type GameCommand = {
  data: Pick<SlashCommandBuilder, "name" | "toJSON">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const MEDIEVAL_COLOR = 0xc9a84c;
const ERR_COLOR = 0xe74c3c;
const WIN_COLOR = 0x27ae60;

async function requirePlayer(interaction: ChatInputCommandInteraction) {
  const p = await getPlayer(interaction.user.id);
  if (!p) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(ERR_COLOR)
          .setTitle("❌ Nu ai un regat!")
          .setDescription("Folosește `/incepe` ca să-ți creezi regatul!"),
      ],
      ephemeral: true,
    });
    return null;
  }
  return p;
}

export const gameCommands: GameCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("incepe")
      .setDescription("Creează-ți regatul medieval și începe aventura!"),
    async execute(interaction) {
      const existing = await getPlayer(interaction.user.id);
      if (existing) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(ERR_COLOR)
              .setTitle("❌ Ai deja un regat!")
              .setDescription("Folosește `/regat` ca să-l vezi."),
          ],
          ephemeral: true,
        });
        return;
      }
      const p = await createPlayer(interaction.user.id, interaction.user.username);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(MEDIEVAL_COLOR)
            .setTitle("🏰 Regatul tău a fost fondat!")
            .setDescription(
              `Bun venit, **${p.username}**! Regatul tău a primit **100 aur** de start.`,
            )
            .addFields(
              { name: "⛏️ Mina (Nivel 1)", value: `Generează **80 aur/oră**`, inline: true },
              { name: "💡 Sfat", value: "Folosește `/aduna` ca să colectezi aurul generat!", inline: false },
            )
            .setFooter({ text: "Mărește mina cu /upgrade mina pentru mai mult aur!" }),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("regat")
      .setDescription("Vezi statisticile regatului tău."),
    async execute(interaction) {
      const p = await requirePlayer(interaction);
      if (!p) return;
      const aurAcumulat = calcAurAcumulat(p);
      const nivel = calcNivel(p.xp);
      const xpNext = nivel * 100 - p.xp;
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(MEDIEVAL_COLOR)
            .setTitle(`🏰 Regatul lui ${p.username}`)
            .addFields(
              { name: "💰 Aur", value: `${p.gold}`, inline: true },
              { name: "⏳ Aur de colectat", value: `+${aurAcumulat}`, inline: true },
              { name: "⭐ Nivel", value: `${nivel} (${xpNext} XP până la următor)`, inline: true },
              { name: "⛏️ Nivel Mină", value: `${p.nivelMina}/${MINA_MAX} (${80 * p.nivelMina} aur/oră)`, inline: true },
              { name: "🏹 Arcași", value: `${p.arcasi}`, inline: true },
              { name: "🗡️ Cavaleri", value: `${p.cavaleri}`, inline: true },
              { name: "⚔️ Putere atac", value: `${putereAtac(p)}`, inline: true },
              { name: "🏆 Victorii / Înfrângeri", value: `${p.victorii} / ${p.infrangeri}`, inline: true },
            )
            .setTimestamp(),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("aduna")
      .setDescription("Colectează aurul generat de mina ta!"),
    async execute(interaction) {
      const p = await requirePlayer(interaction);
      if (!p) return;
      const aurAcumulat = calcAurAcumulat(p);
      if (aurAcumulat < 1) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(ERR_COLOR)
              .setTitle("⏰ Mina e goală!")
              .setDescription("Nu s-a acumulat încă aur. Mina ta generează **" + 80 * p.nivelMina + " aur/oră**. Revino mai târziu!"),
          ],
          ephemeral: true,
        });
        return;
      }
      const updated = await adaugarGold(p, aurAcumulat);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(WIN_COLOR)
            .setTitle("⛏️ Aur colectat!")
            .setDescription(`Ai colectat **+${aurAcumulat} aur** din mina ta!`)
            .addFields({ name: "💰 Total aur", value: `${updated.gold}`, inline: true })
            .setTimestamp(),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("cumpara")
      .setDescription("Cumpără trupe pentru armata ta!")
      .addStringOption((o) =>
        o
          .setName("trupa")
          .setDescription("Tipul trupei")
          .setRequired(true)
          .addChoices(
            { name: "🏹 Arcaș (50 aur)", value: "arcas" },
            { name: "🗡️ Cavaler (150 aur)", value: "cavaler" },
          ),
      )
      .addIntegerOption((o) =>
        o
          .setName("cantitate")
          .setDescription("Câte trupe vrei să cumperi?")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      ),
    async execute(interaction) {
      const p = await requirePlayer(interaction);
      if (!p) return;
      const trupaKey = interaction.options.getString("trupa", true) as TrupaKey;
      const cantitate = interaction.options.getInteger("cantitate", true);
      const trupa = TRUPE[trupaKey];
      const total = trupa.cost * cantitate;
      if (p.gold < total) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(ERR_COLOR)
              .setTitle("❌ Aur insuficient!")
              .setDescription(
                `${cantitate}x ${trupa.emoji} ${trupa.nume} costă **${total} aur**, dar ai doar **${p.gold} aur**.`,
              ),
          ],
          ephemeral: true,
        });
        return;
      }
      const updates =
        trupaKey === "arcas"
          ? { gold: p.gold - total, arcasi: p.arcasi + cantitate }
          : { gold: p.gold - total, cavaleri: p.cavaleri + cantitate };
      const updated = await updatePlayer(p.discordId, updates);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(WIN_COLOR)
            .setTitle(`${trupa.emoji} Trupe recrutate!`)
            .setDescription(`Ai recrutat **${cantitate}x ${trupa.nume}**!`)
            .addFields(
              { name: "💰 Aur rămas", value: `${updated.gold}`, inline: true },
              { name: "⚔️ Putere atac nouă", value: `${putereAtac(updated)}`, inline: true },
            ),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("upgrade")
      .setDescription("Îmbunătățește mina pentru mai mult aur pe oră!"),
    async execute(interaction) {
      const p = await requirePlayer(interaction);
      if (!p) return;
      if (p.nivelMina >= MINA_MAX) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(ERR_COLOR)
              .setTitle("⛏️ Mina e la nivel maxim!")
              .setDescription(`Mina ta e deja la nivel **${MINA_MAX}** — nivelul maxim!`),
          ],
          ephemeral: true,
        });
        return;
      }
      const cost = MINA_COST(p.nivelMina);
      if (p.gold < cost) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(ERR_COLOR)
              .setTitle("❌ Aur insuficient!")
              .setDescription(
                `Upgrade-ul la nivel **${p.nivelMina + 1}** costă **${cost} aur**, dar ai **${p.gold} aur**.`,
              ),
          ],
          ephemeral: true,
        });
        return;
      }
      const noualNivel = p.nivelMina + 1;
      const updated = await updatePlayer(p.discordId, {
        gold: p.gold - cost,
        nivelMina: noualNivel,
      });
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(WIN_COLOR)
            .setTitle("⛏️ Mina îmbunătățită!")
            .setDescription(`Mina a ajuns la **Nivel ${updated.nivelMina}**!`)
            .addFields(
              { name: "💰 Aur rămas", value: `${updated.gold}`, inline: true },
              { name: "📈 Producție nouă", value: `${80 * updated.nivelMina} aur/oră`, inline: true },
            ),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("ataca")
      .setDescription("Trimite armata la atac și câștigă aur și XP!"),
    async execute(interaction) {
      const p = await requirePlayer(interaction);
      if (!p) return;
      const putere = putereAtac(p);
      if (putere === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(ERR_COLOR)
              .setTitle("❌ Nu ai trupe!")
              .setDescription("Cumpără trupe cu `/cumpara` înainte să ataci!"),
          ],
          ephemeral: true,
        });
        return;
      }
      const npc = randomNpc(putere);
      const victorie = putere >= npc.hp;
      if (victorie) {
        const newXp = p.xp + npc.xp;
        const newNivel = calcNivel(newXp);
        await updatePlayer(p.discordId, {
          gold: p.gold + npc.reward,
          xp: newXp,
          nivel: newNivel,
          victorii: p.victorii + 1,
        });
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(WIN_COLOR)
              .setTitle(`⚔️ Victorie! ${npc.emoji} ${npc.nume} a fost înfrânt!`)
              .setDescription(`Armata ta (putere **${putere}**) a zdrobit **${npc.nume}**!`)
              .addFields(
                { name: "💰 Aur câștigat", value: `+${npc.reward}`, inline: true },
                { name: "⭐ XP câștigat", value: `+${npc.xp}`, inline: true },
                { name: "🏆 Total victorii", value: `${p.victorii + 1}`, inline: true },
              )
              .setTimestamp(),
          ],
        });
      } else {
        await updatePlayer(p.discordId, { infrangeri: p.infrangeri + 1 });
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(ERR_COLOR)
              .setTitle(`💀 Înfrângere! ${npc.emoji} ${npc.nume} a câștigat!`)
              .setDescription(
                `Puterea ta (**${putere}**) nu a fost suficientă. Inamicul avea **${npc.hp} HP**.`,
              )
              .addFields({ name: "💡 Sfat", value: "Recrutează mai multe trupe cu `/cumpara`!" })
              .setTimestamp(),
          ],
        });
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("clasament")
      .setDescription("Top 10 cele mai puternice regate!"),
    async execute(interaction) {
      const top = await topPlayers();
      if (top.length === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(MEDIEVAL_COLOR)
              .setTitle("📜 Clasament gol")
              .setDescription("Nimeni nu a început încă. Fii primul cu `/incepe`!"),
          ],
        });
        return;
      }
      const medals = ["🥇", "🥈", "🥉"];
      const lines = top.map((pl, i) => {
        const prefix = medals[i] ?? `**${i + 1}.**`;
        return `${prefix} **${pl.username}** — Nivel ${calcNivel(pl.xp)} | ⚔️ ${putereAtac(pl)} putere | 🏆 ${pl.victorii} victorii`;
      });
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(MEDIEVAL_COLOR)
            .setTitle("👑 Clasament Regate Medievale")
            .setDescription(lines.join("\n"))
            .setTimestamp(),
        ],
      });
    },
  },
];
