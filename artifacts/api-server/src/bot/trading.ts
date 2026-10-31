/**
 * Comerțul între jucători: `/schimb @jucator` propune un schimb (materiale
 * și/sau Oboli, în ambele sensuri); celălalt îl vede cu Acceptă / Refuză.
 * La acceptare totul se mută într-o singură tranzacție: dacă unuia îi
 * lipsește ceva în acel moment, nu se mută nimic. Echipamentul (cu nivel)
 * nu se schimbă, doar materialele, fragmentele și relicvele.
 *
 * Pornit/oprit și taxa: gameplayConfig.crafting (Jocul → Comerț și crafting).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { pool } from "@workspace/db";
import { upsertPlayer } from "./db";
import { DEFAULT_GAMEPLAY_CONFIG } from "./gameplay-config";
import { getGameplayConfig, isGameplayPaused } from "./gameplay-store";
import { ITEMS, isEquipmentKey, type ItemKey } from "./survival";

/** What can change hands: every item that is not a levelled piece of equipment. */
export const TRADEABLE: readonly ItemKey[] = (Object.keys(ITEMS) as ItemKey[]).filter((key) => !isEquipmentKey(key));

export type TradeSide = { item: ItemKey | null; qty: number; gold: number };
export type Trade = { id: string; guildId: string; fromId: string; toId: string; give: TradeSide; take: TradeSide; expiresAt: number; settled: boolean };

const TRADE_MS = 5 * 60_000;
const trades = new Map<string, Trade>();

function sideText(side: TradeSide): string {
  const parts = [
    side.item && side.qty > 0 ? `${side.qty}× ${ITEMS[side.item].emoji} ${ITEMS[side.item].label}` : null,
    side.gold > 0 ? `🪙 ${side.gold.toLocaleString("ro-RO")} Oboli` : null,
  ].filter(Boolean);
  return parts.join(" + ") || "nimic";
}

export function isEmptySide(side: TradeSide): boolean {
  return !(side.item && side.qty > 0) && side.gold <= 0;
}

/** Oboli the receiver gets after the tax (only Oboli are taxed). */
export function afterTax(gold: number, taxPercent: number): number {
  return Math.floor(gold * (1 - taxPercent / 100));
}

export async function handleTradeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const settings = getGameplayConfig(guildId).crafting ?? DEFAULT_GAMEPLAY_CONFIG.crafting;
  if (!settings.tradeEnabled) {
    await interaction.reply({ content: "🤝 Comerțul între jucători e oprit pe acest server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const target = interaction.options.getUser("jucator", true);
  if (target.bot || target.id === interaction.user.id) {
    await interaction.reply({ content: "🤝 Alege un alt jucător.", flags: MessageFlags.Ephemeral });
    return;
  }
  const item = (key: string | null): ItemKey | null => key && (TRADEABLE as readonly string[]).includes(key) ? key as ItemKey : null;
  const give: TradeSide = { item: item(interaction.options.getString("dai_obiect")), qty: interaction.options.getInteger("dai_cantitate") ?? 1, gold: interaction.options.getInteger("dai_oboli") ?? 0 };
  const take: TradeSide = { item: item(interaction.options.getString("ceri_obiect")), qty: interaction.options.getInteger("ceri_cantitate") ?? 1, gold: interaction.options.getInteger("ceri_oboli") ?? 0 };
  if (isEmptySide(give) && isEmptySide(take)) {
    await interaction.reply({ content: "🤝 Spune ce dai sau ce ceri (un obiect și/sau Oboli).", flags: MessageFlags.Ephemeral });
    return;
  }
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const trade: Trade = { id: interaction.id, guildId, fromId: interaction.user.id, toId: target.id, give, take, expiresAt: Date.now() + TRADE_MS, settled: false };
  trades.set(trade.id, trade);
  setTimeout(() => trades.delete(trade.id), TRADE_MS + 5_000).unref?.();
  await interaction.reply({
    content: `🤝 <@${target.id}>, **${interaction.user.username}** îți propune un schimb:\n**Dă:** ${sideText(give)}\n**Cere:** ${sideText(take)}` +
      (settings.taxPercent && (give.gold || take.gold) ? `\n*Taxa pe Oboli: ${settings.taxPercent}%.*` : "") +
      `\nExpiră <t:${Math.floor(trade.expiresAt / 1000)}:R>.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`trade_accept_${trade.id}`).setLabel("Acceptă").setEmoji("🤝").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`trade_decline_${trade.id}`).setLabel("Refuză").setStyle(ButtonStyle.Secondary),
    )],
    allowedMentions: { users: [target.id] },
  });
}

/**
 * Moves both sides in one transaction. Returns null on success, or who is
 * missing what; on a miss nothing changes.
 */
export async function executeTrade(trade: Pick<Trade, "guildId" | "fromId" | "toId" | "give" | "take">, taxPercent: number): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Rows are locked in a fixed order, so two crossed trades cannot deadlock.
    const ids = [trade.fromId, trade.toId].sort();
    const players = await client.query<{ discord_id: string; gold: number }>(
      "SELECT discord_id, gold FROM players WHERE guild_id = $1 AND discord_id = ANY($2::text[]) ORDER BY discord_id FOR UPDATE",
      [trade.guildId, ids],
    );
    const gold = new Map(players.rows.map((row) => [String(row.discord_id), Number(row.gold)]));
    const items = await client.query<{ discord_id: string; item_key: string; quantity: number }>(
      "SELECT discord_id, item_key, quantity FROM player_items WHERE guild_id = $1 AND discord_id = ANY($2::text[]) ORDER BY discord_id, item_key FOR UPDATE",
      [trade.guildId, ids],
    );
    const has = (id: string, item: string) => Number(items.rows.find((row) => row.discord_id === id && row.item_key === item)?.quantity ?? 0);
    const check = (id: string, side: TradeSide): string | null => {
      if (!gold.has(id)) return `<@${id}> nu are încă un profil în joc.`;
      if (side.gold > 0 && (gold.get(id) ?? 0) < side.gold) return `<@${id}> nu mai are ${side.gold.toLocaleString("ro-RO")} Oboli.`;
      if (side.item && side.qty > 0 && has(id, side.item) < side.qty) return `<@${id}> nu mai are ${side.qty}× ${ITEMS[side.item].label}.`;
      return null;
    };
    const problem = check(trade.fromId, trade.give) ?? check(trade.toId, trade.take);
    if (problem) {
      await client.query("ROLLBACK");
      return problem;
    }
    const move = async (from: string, to: string, side: TradeSide) => {
      if (side.gold > 0) {
        await client.query("UPDATE players SET gold = gold - $3 WHERE guild_id = $1 AND discord_id = $2", [trade.guildId, from, side.gold]);
        await client.query("UPDATE players SET gold = gold + $3 WHERE guild_id = $1 AND discord_id = $2", [trade.guildId, to, afterTax(side.gold, taxPercent)]);
      }
      if (side.item && side.qty > 0) {
        await client.query("UPDATE player_items SET quantity = quantity - $4 WHERE guild_id = $1 AND discord_id = $2 AND item_key = $3", [trade.guildId, from, side.item, side.qty]);
        await client.query(
          `INSERT INTO player_items (discord_id, guild_id, item_key, quantity) VALUES ($1, $2, $3, $4)
           ON CONFLICT (discord_id, guild_id, item_key) DO UPDATE SET quantity = player_items.quantity + EXCLUDED.quantity`,
          [to, trade.guildId, side.item, side.qty],
        );
      }
    };
    await move(trade.fromId, trade.toId, trade.give);
    await move(trade.toId, trade.fromId, trade.take);
    await client.query("COMMIT");
    return null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function handleTradeButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = interaction.customId.match(/^trade_(accept|decline)_(\d+)$/);
  if (!match || !interaction.guildId) return false;
  const trade = trades.get(match[2]!);
  if (!trade || trade.settled || trade.expiresAt < Date.now()) {
    await interaction.reply({ content: "⌛ Propunerea a expirat.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== trade.toId) {
    await interaction.reply({ content: "🤝 Doar cel căruia i s-a propus schimbul poate răspunde.", flags: MessageFlags.Ephemeral });
    return true;
  }
  trade.settled = true;
  if (match[1] === "decline") {
    await interaction.update({ content: `🏳️ <@${trade.toId}> a refuzat schimbul.`, components: [], allowedMentions: { parse: [] } });
    return true;
  }
  if (isGameplayPaused(trade.guildId)) {
    await interaction.update({ content: "⏸️ Jocul e oprit; schimbul nu s-a făcut.", components: [] });
    return true;
  }
  await upsertPlayer(trade.toId, trade.guildId, interaction.user.username);
  const settings = getGameplayConfig(trade.guildId).crafting ?? DEFAULT_GAMEPLAY_CONFIG.crafting;
  const problem = await executeTrade(trade, settings.taxPercent);
  await interaction.update({
    content: problem
      ? `❌ Schimbul nu s-a făcut: ${problem}`
      : `🤝 Schimb încheiat! <@${trade.fromId}> a dat ${sideText(trade.give)}, <@${trade.toId}> a dat ${sideText(trade.take)}.`,
    components: [],
    allowedMentions: { parse: [] },
  });
  return true;
}
