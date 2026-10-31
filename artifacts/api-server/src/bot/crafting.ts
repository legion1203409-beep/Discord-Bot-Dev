/**
 * Craftingul: `/crafteaza` transformă materialele comune în materiale mai rare
 * și în fragmentele din care Forja face echipamentul. Fără rețetă, arată ce
 * poți face acum; cu rețetă, ia materialele (și Obolii, unde e cazul) și dă
 * rezultatul, totul sau nimic.
 *
 * Pornit/oprit: gameplayConfig.crafting.enabled (Jocul → Comerț și crafting).
 */
import { EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { addPlayerGold, addPlayerItem, consumePlayerItems, getPlayerItems, tryDeductPlayerGold, upsertPlayer } from "./db";
import { DEFAULT_GAMEPLAY_CONFIG } from "./gameplay-config";
import { getGameplayConfig } from "./gameplay-store";
import { ITEMS, type ItemKey } from "./survival";

export type Recipe = { key: string; result: ItemKey; inputs: Partial<Record<ItemKey, number>>; gold: number };

export const RECIPES: readonly Recipe[] = [
  { key: "fragment_arma", result: "fragment_arma", inputs: { fragment_cenusa: 4, sange_monstru: 2 }, gold: 0 },
  { key: "fragment_armura", result: "fragment_armura", inputs: { fragment_cenusa: 4, picatura_otr: 2 }, gold: 0 },
  { key: "coama_dragonului", result: "coama_dragonului", inputs: { sange_monstru: 5, esenta_umbrei: 3 }, gold: 0 },
  { key: "solz_spectral", result: "solz_spectral", inputs: { picatura_otr: 5, esenta_umbrei: 3 }, gold: 0 },
  { key: "cristal_abis", result: "cristal_abis", inputs: { coama_dragonului: 2, solz_spectral: 2, inima_abisului: 1 }, gold: 150 },
  { key: "sange_titan", result: "sange_titan", inputs: { cristal_abis: 3, inima_abisului: 1 }, gold: 500 },
];

export function recipeLabel(recipe: Recipe): string {
  const inputs = Object.entries(recipe.inputs).map(([item, qty]) => `${qty}× ${ITEMS[item as ItemKey].emoji} ${ITEMS[item as ItemKey].label}`);
  return `${ITEMS[recipe.result].emoji} **${ITEMS[recipe.result].label}** ← ${inputs.join(" + ")}${recipe.gold ? ` + ${recipe.gold} Oboli` : ""}`;
}

/** How many times the recipe fits into an inventory and a purse. */
export function craftableTimes(recipe: Recipe, inventory: Partial<Record<string, number>>, gold: number): number {
  const byItems = Math.min(...Object.entries(recipe.inputs).map(([item, qty]) => Math.floor((inventory[item] ?? 0) / qty!)));
  const byGold = recipe.gold ? Math.floor(gold / recipe.gold) : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(byItems, byGold));
}

export async function handleCraftCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const enabled = (getGameplayConfig(guildId).crafting ?? DEFAULT_GAMEPLAY_CONFIG.crafting).enabled;
  if (!enabled) {
    await interaction.editReply("⚒️ Craftingul e oprit pe acest server.");
    return;
  }
  const player = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const items = await getPlayerItems(interaction.user.id, guildId);
  const inventory = Object.fromEntries(items.map((item) => [item.itemKey, item.quantity]));
  const key = interaction.options.getString("reteta");
  if (!key) {
    const lines = RECIPES.map((recipe) => {
      const times = craftableTimes(recipe, inventory, player.gold);
      return `${recipeLabel(recipe)}${times ? ` · **poți face ${times}**` : ""}`;
    });
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8b5a2b).setTitle("⚒️ Rețetele Forjei").setDescription(lines.join("\n")).setFooter({ text: "Folosește /crafteaza reteta: cantitate:" })] });
    return;
  }
  const recipe = RECIPES.find((candidate) => candidate.key === key);
  if (!recipe) {
    await interaction.editReply("⚒️ Rețeta nu există.");
    return;
  }
  const times = Math.max(1, Math.min(50, interaction.options.getInteger("cantitate") ?? 1));
  const costs = Object.fromEntries(Object.entries(recipe.inputs).map(([item, qty]) => [item, qty! * times]));
  const gold = recipe.gold * times;
  if (gold > 0 && !await tryDeductPlayerGold(interaction.user.id, guildId, gold)) {
    await interaction.editReply(`🪙 Îți trebuie **${gold.toLocaleString("ro-RO")}** Oboli.`);
    return;
  }
  if (!await consumePlayerItems(interaction.user.id, guildId, costs)) {
    if (gold > 0) await addPlayerGold(interaction.user.id, guildId, gold);
    await interaction.editReply(`⚒️ N-ai destule materiale pentru ${times}× ${ITEMS[recipe.result].label}.\n${recipeLabel(recipe)}`);
    return;
  }
  await addPlayerItem(interaction.user.id, guildId, recipe.result, times);
  await interaction.editReply(`⚒️ Ai făurit **${times}× ${ITEMS[recipe.result].emoji} ${ITEMS[recipe.result].label}**!`);
}
