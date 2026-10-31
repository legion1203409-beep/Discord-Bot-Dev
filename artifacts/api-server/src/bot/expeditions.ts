/**
 * Expedițiile: un jucător cu companion îl trimite câteva ore (`/expeditie`)
 * și, când se întoarce, adună prada cu butonul din același mesaj: Oboli și
 * materiale, mai multe cu cât drumul e mai lung și companionul mai antrenat.
 * O singură expediție odată; prada se ia o singură dată.
 *
 * Setările sunt în gameplayConfig.expeditions (Jocul → Expediții, în panou).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { pool } from "@workspace/db";
import { addPlayerGold, addPlayerItem, upsertPlayer } from "./db";
import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from "./gameplay-config";
import { getGameplayConfig, isGameplayPaused } from "./gameplay-store";
import { COMPANIONS, ITEMS, isCompanionKey, type ItemKey } from "./survival";

export const EXPEDITION_HOURS = [1, 4, 8] as const;

/** The places a companion can go, by length. */
export const ROUTES: Record<(typeof EXPEDITION_HOURS)[number], { name: string; emoji: string }> = {
  1: { name: "Pădurea de Scrum", emoji: "🌲" },
  4: { name: "Mlaștinile Umbrei", emoji: "🌫️" },
  8: { name: "Ruinele Abisului", emoji: "🏚️" },
};

const LOOT: ReadonlyArray<{ item: ItemKey; weight: number }> = [
  { item: "fragment_cenusa", weight: 22 }, { item: "esenta_umbrei", weight: 18 }, { item: "sange_monstru", weight: 16 }, { item: "picatura_otr", weight: 14 },
  { item: "coama_dragonului", weight: 7 }, { item: "inima_abisului", weight: 6 }, { item: "solz_spectral", weight: 6 },
  { item: "fragment_arma", weight: 4 }, { item: "fragment_armura", weight: 4 }, { item: "cristal_abis", weight: 3 },
];

type Expedition = { hours: number; startedAt: Date; endsAt: Date; companion: string; companionLevel: number; claimed: boolean };

let tableReady: Promise<void> | null = null;

function ensureExpeditionTable(): Promise<void> {
  if (tableReady) return tableReady;
  const ready: Promise<void> = pool.query(`
    CREATE TABLE IF NOT EXISTS player_expeditions (
      guild_id text NOT NULL, discord_id text NOT NULL, hours integer NOT NULL, companion text NOT NULL,
      companion_level integer NOT NULL DEFAULT 1, started_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      claimed boolean NOT NULL DEFAULT false, PRIMARY KEY (guild_id, discord_id)
    )`).then(() => undefined).catch((error) => {
    tableReady = null;
    throw error;
  });
  tableReady = ready;
  return ready;
}

function settingsOf(guildId: string): GameplayConfig["expeditions"] {
  try {
    return getGameplayConfig(guildId).expeditions ?? DEFAULT_GAMEPLAY_CONFIG.expeditions;
  } catch {
    return DEFAULT_GAMEPLAY_CONFIG.expeditions;
  }
}

async function getExpedition(guildId: string, discordId: string): Promise<Expedition | null> {
  await ensureExpeditionTable();
  const { rows } = await pool.query<Record<string, unknown>>("SELECT * FROM player_expeditions WHERE guild_id = $1 AND discord_id = $2", [guildId, discordId]);
  const row = rows[0];
  if (!row) return null;
  return {
    hours: Number(row.hours), startedAt: new Date(String(row.started_at)), endsAt: new Date(String(row.ends_at)),
    companion: String(row.companion), companionLevel: Number(row.companion_level), claimed: row.claimed === true,
  };
}

/** The loot of a finished expedition: Oboli grow with hours and the companion's level; one material roll per hour (two from level 5). */
export function expeditionLoot(
  hours: number, companionLevel: number, settings: Pick<GameplayConfig["expeditions"], "goldPerHour">, random: () => number = Math.random,
): { gold: number; items: Partial<Record<ItemKey, number>> } {
  const levelBonus = 1 + Math.min(20, Math.max(1, companionLevel) - 1) * 0.1;
  const gold = Math.round(settings.goldPerHour * hours * levelBonus * (0.9 + random() * 0.2));
  const rolls = hours * (companionLevel >= 5 ? 2 : 1);
  const total = LOOT.reduce((sum, entry) => sum + entry.weight, 0);
  const items: Partial<Record<ItemKey, number>> = {};
  for (let roll = 0; roll < rolls; roll += 1) {
    let pick = random() * total;
    const entry = LOOT.find((candidate) => (pick -= candidate.weight) < 0) ?? LOOT[0]!;
    items[entry.item] = (items[entry.item] ?? 0) + 1;
  }
  return { gold, items };
}

function lootText(loot: ReturnType<typeof expeditionLoot>): string {
  const items = Object.entries(loot.items).map(([key, qty]) => `${ITEMS[key as ItemKey].emoji} ${ITEMS[key as ItemKey].label} ×${qty}`);
  return [`🪙 **${loot.gold.toLocaleString("ro-RO")}** Oboli`, ...items].join("\n");
}

function companionName(key: string): string {
  return isCompanionKey(key) ? `${COMPANIONS[key].emoji} ${COMPANIONS[key].label}` : "Companionul";
}

function buildExpeditionEmbed(expedition: Expedition, now = new Date()): EmbedBuilder {
  const route = ROUTES[expedition.hours as keyof typeof ROUTES] ?? ROUTES[1];
  const back = expedition.endsAt <= now;
  return new EmbedBuilder()
    .setColor(back ? 0x3ddc84 : 0x6b4f3a)
    .setTitle(`${route.emoji} Expediție: ${route.name}`)
    .setDescription(back
      ? `${companionName(expedition.companion)} s-a întors cu prada! Apasă „Adună prada”.`
      : `${companionName(expedition.companion)} e pe drum. Se întoarce <t:${Math.floor(expedition.endsAt.getTime() / 1000)}:R>.`)
    .setFooter({ text: "O singură expediție odată. Prada se adună cu butonul de mai jos." });
}

function expeditionRow(expedition: Expedition, now = new Date()): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("expedition_claim").setLabel("Adună prada").setEmoji("🎒").setStyle(ButtonStyle.Success)
      .setDisabled(expedition.claimed || expedition.endsAt > now),
  );
}

export async function handleExpeditionCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const settings = settingsOf(guildId);
  if (!settings.enabled) {
    await interaction.editReply("🧭 Expedițiile sunt oprite pe acest server.");
    return;
  }
  const current = await getExpedition(guildId, interaction.user.id);
  const hours = interaction.options.getInteger("durata");
  if (current && !current.claimed) {
    await interaction.editReply({
      content: current.endsAt <= new Date() ? "" : hours ? "🧭 Companionul tău e deja într-o expediție." : "",
      embeds: [buildExpeditionEmbed(current)], components: [expeditionRow(current)],
    });
    return;
  }
  if (!hours) {
    const options = EXPEDITION_HOURS.map((value) => `${ROUTES[value].emoji} **${value} ${value === 1 ? "oră" : "ore"}** — ${ROUTES[value].name}`).join("\n");
    await interaction.editReply(`🧭 Alege cât de departe pleacă companionul: \`/expeditie durata:\`\n${options}\nCu cât drumul e mai lung și companionul mai antrenat, cu atât prada e mai bogată.`);
    return;
  }
  const player = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!player.companion) {
    await interaction.editReply("🐾 N-ai încă un companion. Cumpără unul din **/magazin**, apoi trimite-l în expediție.");
    return;
  }
  const now = new Date();
  const expedition: Expedition = {
    hours, startedAt: now, endsAt: new Date(now.getTime() + hours * 3_600_000 / settings.speed), companion: player.companion,
    companionLevel: player.companionLevel ?? 1, claimed: false,
  };
  // The upsert replaces only a claimed (finished) expedition, so two commands at once cannot start two.
  const { rowCount } = await pool.query(
    `INSERT INTO player_expeditions (guild_id, discord_id, hours, companion, companion_level, started_at, ends_at, claimed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     ON CONFLICT (guild_id, discord_id) DO UPDATE SET hours = EXCLUDED.hours, companion = EXCLUDED.companion,
       companion_level = EXCLUDED.companion_level, started_at = EXCLUDED.started_at, ends_at = EXCLUDED.ends_at, claimed = false
     WHERE player_expeditions.claimed = true`,
    [guildId, interaction.user.id, hours, expedition.companion, expedition.companionLevel, expedition.startedAt, expedition.endsAt],
  );
  if (!rowCount) {
    await interaction.editReply("🧭 Companionul tău e deja într-o expediție.");
    return;
  }
  await interaction.editReply({ embeds: [buildExpeditionEmbed(expedition)], components: [expeditionRow(expedition)] });
}

/** Takes the loot once: the row is marked claimed only if it was finished and not claimed yet. */
export async function claimExpedition(guildId: string, discordId: string, now = new Date()): Promise<{ hours: number; companionLevel: number } | null> {
  await ensureExpeditionTable();
  const { rows } = await pool.query<{ hours: number; companion_level: number }>(
    "UPDATE player_expeditions SET claimed = true WHERE guild_id = $1 AND discord_id = $2 AND claimed = false AND ends_at <= $3 RETURNING hours, companion_level",
    [guildId, discordId, now],
  );
  return rows[0] ? { hours: Number(rows[0].hours), companionLevel: Number(rows[0].companion_level) } : null;
}

export async function handleExpeditionButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== "expedition_claim" || !interaction.guildId) return false;
  const guildId = interaction.guildId;
  if (isGameplayPaused(guildId)) {
    await interaction.reply({ content: "⏸️ Jocul e oprit acum; prada te așteaptă.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const claimed = await claimExpedition(guildId, interaction.user.id);
  if (!claimed) {
    await interaction.reply({ content: "🎒 Nu ai pradă de adunat acum.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const loot = expeditionLoot(claimed.hours, claimed.companionLevel, settingsOf(guildId));
  await addPlayerGold(interaction.user.id, guildId, loot.gold);
  for (const [item, qty] of Object.entries(loot.items)) await addPlayerItem(interaction.user.id, guildId, item, qty);
  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0x3ddc84).setTitle("🎒 Prada expediției").setDescription(lootText(loot)).setFooter({ text: "Trimite-l din nou cu /expeditie." })],
    components: [],
  });
  return true;
}
