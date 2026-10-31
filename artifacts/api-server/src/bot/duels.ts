/**
 * Duelurile: `/duel @cineva [pariu]` trimite o provocare cu Acceptă / Refuză.
 * La acceptare, mizele se iau de la amândoi (doar dacă amândoi le au), lupta
 * se joacă din statisticile de luptă ale fiecăruia, iar câștigătorul ia potul
 * (minus taxa aleasă în panou). Fiecare duel mută ratingul (Elo) al celor doi;
 * `/topduel` arată clasamentul.
 *
 * Setările sunt în gameplayConfig.duels (Jocul → Dueluri, în panou).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { pool } from "@workspace/db";
import type { Player } from "@workspace/db";
import { addPlayerGold, getPlayerById, tryDeductPlayerGold, upsertPlayer } from "./db";
import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from "./gameplay-config";
import { getGameplayConfig, isGameplayPaused } from "./gameplay-store";
import { playerCombatStats } from "./survival";

export const START_RATING = 1_000;
const CHALLENGE_MS = 2 * 60_000;

type Challenge = { id: string; guildId: string; challengerId: string; opponentId: string; bet: number; expiresAt: number; settled: boolean };

const challenges = new Map<string, Challenge>();
const lastDuelAt = new Map<string, number>();

function settingsOf(guildId: string): GameplayConfig["duels"] {
  try {
    return getGameplayConfig(guildId).duels ?? DEFAULT_GAMEPLAY_CONFIG.duels;
  } catch {
    return DEFAULT_GAMEPLAY_CONFIG.duels;
  }
}

let tableReady: Promise<void> | null = null;

function ensureDuelTable(): Promise<void> {
  if (tableReady) return tableReady;
  const ready: Promise<void> = pool.query(`
    CREATE TABLE IF NOT EXISTS player_duels (
      guild_id text NOT NULL, discord_id text NOT NULL, rating integer NOT NULL DEFAULT ${START_RATING},
      wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (guild_id, discord_id)
    )`).then(() => undefined).catch((error) => {
    tableReady = null;
    throw error;
  });
  tableReady = ready;
  return ready;
}

/* ------------------------------------------------------------------ */
/* Lupta                                                               */
/* ------------------------------------------------------------------ */

export type Fighter = { id: string; name: string; maxHp: number; atk: number; def: number; dodge: number; crit: number };

export function fighterOf(player: Player, name: string): Fighter {
  const stats = playerCombatStats(player);
  return { id: player.discordId, name, ...stats };
}

export type DuelResult = { winner: Fighter; loser: Fighter; rounds: string[]; winnerHp: number };

/**
 * A fight of at most 12 rounds; each round both strike (the faster, by dodge,
 * first). Dodge can avoid a hit, crit doubles it, defence softens it. If both
 * stand after 12 rounds, the one with more health left in percent wins.
 */
export function simulateDuel(a: Fighter, b: Fighter, random: () => number = Math.random): DuelResult {
  const hp = new Map([[a.id, a.maxHp], [b.id, b.maxHp]]);
  const rounds: string[] = [];
  const strike = (attacker: Fighter, defender: Fighter): string => {
    if (random() * 100 < Math.min(40, Math.max(0, defender.dodge))) return `💨 ${defender.name} se ferește de ${attacker.name}.`;
    const crit = random() * 100 < Math.min(60, Math.max(0, attacker.crit));
    const raw = (12 + attacker.atk * 1.6) * (0.85 + random() * 0.3) * (crit ? 2 : 1);
    const damage = Math.max(1, Math.round(raw * (100 / (100 + Math.max(0, defender.def) * 2))));
    hp.set(defender.id, Math.max(0, hp.get(defender.id)! - damage));
    return `${crit ? "💥" : "⚔️"} ${attacker.name} lovește ${crit ? "critic " : ""}pentru **${damage}** (${defender.name}: ${hp.get(defender.id)} ❤️).`;
  };
  const [first, second] = a.dodge >= b.dodge ? [a, b] : [b, a];
  for (let round = 1; round <= 12; round += 1) {
    rounds.push(`**Runda ${round}.** ${strike(first, second)}`);
    if (hp.get(second.id)! <= 0) break;
    rounds.push(strike(second, first));
    if (hp.get(first.id)! <= 0) break;
  }
  const share = (fighter: Fighter) => hp.get(fighter.id)! / Math.max(1, fighter.maxHp);
  const winner = share(a) === share(b) ? (random() < 0.5 ? a : b) : share(a) > share(b) ? a : b;
  const loser = winner === a ? b : a;
  return { winner, loser, rounds, winnerHp: hp.get(winner.id)! };
}

/** The Elo change for the winner (the loser loses the same), K = 32. */
export function eloDelta(winnerRating: number, loserRating: number): number {
  const expected = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
  return Math.max(1, Math.round(32 * (1 - expected)));
}

/** What the winner takes: both bets, minus the tax. */
export function duelPayout(bet: number, taxPercent: number): number {
  return Math.floor(bet * 2 * (1 - taxPercent / 100));
}

/* ------------------------------------------------------------------ */
/* Provocarea                                                          */
/* ------------------------------------------------------------------ */

function challengeRow(challenge: Challenge, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`duel_accept_${challenge.id}`).setLabel("Acceptă").setEmoji("⚔️").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`duel_decline_${challenge.id}`).setLabel("Refuză").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

function cooldownLeft(guildId: string, discordId: string, cooldownSeconds: number, now = Date.now()): number {
  const last = lastDuelAt.get(`${guildId}:${discordId}`) ?? 0;
  return Math.max(0, last + cooldownSeconds * 1_000 - now);
}

export async function handleDuelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const settings = settingsOf(guildId);
  if (!settings.enabled) {
    await interaction.reply({ content: "⚔️ Duelurile sunt oprite pe acest server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const opponent = interaction.options.getUser("adversar", true);
  const bet = Math.max(0, Math.floor(interaction.options.getInteger("pariu") ?? 0));
  if (opponent.id === interaction.user.id || opponent.bot) {
    await interaction.reply({ content: "⚔️ Alege un alt jucător, nu pe tine sau un bot.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (bet > settings.maxBet) {
    await interaction.reply({ content: `🪙 Pariul maxim pe acest server e **${settings.maxBet.toLocaleString("ro-RO")}** Oboli.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const wait = cooldownLeft(guildId, interaction.user.id, settings.cooldownSeconds);
  if (wait > 0) {
    await interaction.reply({ content: `⏳ Îți tragi sufletul după ultimul duel. Mai poți provoca <t:${Math.floor((Date.now() + wait) / 1000)}:R>.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const challenger = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (bet > 0 && challenger.gold < bet) {
    await interaction.reply({ content: `🪙 Nu ai **${bet.toLocaleString("ro-RO")}** Oboli pentru pariu.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const challenge: Challenge = {
    id: `${interaction.id}`, guildId, challengerId: interaction.user.id, opponentId: opponent.id, bet, expiresAt: Date.now() + CHALLENGE_MS, settled: false,
  };
  challenges.set(challenge.id, challenge);
  setTimeout(() => challenges.delete(challenge.id), CHALLENGE_MS + 5_000).unref?.();
  await interaction.reply({
    content: `⚔️ <@${opponent.id}>, **${interaction.user.username}** te provoacă la duel${bet ? ` pe **${bet.toLocaleString("ro-RO")}** Oboli` : ""}! Ai <t:${Math.floor(challenge.expiresAt / 1000)}:R> să răspunzi.`,
    components: [challengeRow(challenge)],
    allowedMentions: { users: [opponent.id] },
  });
}

async function recordResult(guildId: string, winnerId: string, loserId: string): Promise<{ delta: number; winnerRating: number; loserRating: number }> {
  await ensureDuelTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const id of [winnerId, loserId].sort()) {
      await client.query("INSERT INTO player_duels (guild_id, discord_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [guildId, id]);
    }
    const { rows } = await client.query<{ discord_id: string; rating: number }>(
      "SELECT discord_id, rating FROM player_duels WHERE guild_id = $1 AND discord_id = ANY($2::text[]) ORDER BY discord_id FOR UPDATE",
      [guildId, [winnerId, loserId]],
    );
    const rating = new Map(rows.map((row) => [String(row.discord_id), Number(row.rating)]));
    const delta = eloDelta(rating.get(winnerId) ?? START_RATING, rating.get(loserId) ?? START_RATING);
    await client.query("UPDATE player_duels SET rating = rating + $3, wins = wins + 1, updated_at = now() WHERE guild_id = $1 AND discord_id = $2", [guildId, winnerId, delta]);
    await client.query("UPDATE player_duels SET rating = GREATEST(0, rating - $3), losses = losses + 1, updated_at = now() WHERE guild_id = $1 AND discord_id = $2", [guildId, loserId, delta]);
    await client.query("COMMIT");
    return { delta, winnerRating: (rating.get(winnerId) ?? START_RATING) + delta, loserRating: Math.max(0, (rating.get(loserId) ?? START_RATING) - delta) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function handleDuelButton(interaction: ButtonInteraction): Promise<boolean> {
  const match = interaction.customId.match(/^duel_(accept|decline)_(\d+)$/);
  if (!match || !interaction.guildId) return false;
  const challenge = challenges.get(match[2]!);
  if (!challenge || challenge.settled || challenge.expiresAt < Date.now()) {
    await interaction.reply({ content: "⌛ Provocarea a expirat.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== challenge.opponentId) {
    await interaction.reply({ content: "⚔️ Doar cel provocat poate răspunde.", flags: MessageFlags.Ephemeral });
    return true;
  }
  challenge.settled = true;
  if (match[1] === "decline") {
    await interaction.update({ content: `🏳️ <@${challenge.opponentId}> a refuzat duelul.`, components: [challengeRow(challenge, true)], allowedMentions: { parse: [] } });
    return true;
  }
  const settings = settingsOf(challenge.guildId);
  if (isGameplayPaused(challenge.guildId) || !settings.enabled) {
    await interaction.update({ content: "⏸️ Duelurile sunt oprite acum.", components: [] });
    return true;
  }
  await interaction.deferUpdate();
  const [challengerPlayer, opponentPlayer] = await Promise.all([
    getPlayerById(challenge.challengerId, challenge.guildId).then((player) => player ?? upsertPlayer(challenge.challengerId, challenge.guildId, "jucător")),
    upsertPlayer(challenge.opponentId, challenge.guildId, interaction.user.username),
  ]);
  // Both bets are taken before the fight; if the second one fails, the first comes back.
  if (challenge.bet > 0) {
    const first = await tryDeductPlayerGold(challenge.challengerId, challenge.guildId, challenge.bet);
    const second = first && await tryDeductPlayerGold(challenge.opponentId, challenge.guildId, challenge.bet);
    if (!first || !second) {
      if (first) await addPlayerGold(challenge.challengerId, challenge.guildId, challenge.bet);
      await interaction.editReply({ content: `🪙 Duelul nu poate începe: ${!first ? `<@${challenge.challengerId}>` : `<@${challenge.opponentId}>`} nu mai are **${challenge.bet.toLocaleString("ro-RO")}** Oboli.`, components: [] });
      return true;
    }
  }
  const guild = interaction.guild;
  const nameOf = (id: string, fallback: string) => guild?.members.cache.get(id)?.displayName ?? fallback;
  const result = simulateDuel(
    fighterOf(challengerPlayer, nameOf(challenge.challengerId, challengerPlayer.username)),
    fighterOf(opponentPlayer, nameOf(challenge.opponentId, interaction.user.username)),
  );
  const payout = challenge.bet > 0 ? duelPayout(challenge.bet, settings.taxPercent) : 0;
  if (payout > 0) await addPlayerGold(result.winner.id, challenge.guildId, payout);
  const elo = await recordResult(challenge.guildId, result.winner.id, result.loser.id).catch(() => null);
  const now = Date.now();
  lastDuelAt.set(`${challenge.guildId}:${challenge.challengerId}`, now);
  lastDuelAt.set(`${challenge.guildId}:${challenge.opponentId}`, now);
  const log = result.rounds.length > 10 ? [...result.rounds.slice(0, 4), "…", ...result.rounds.slice(-5)] : result.rounds;
  const embed = new EmbedBuilder()
    .setColor(0xd94a2b)
    .setTitle(`⚔️ ${result.winner.name} câștigă duelul!`)
    .setDescription(log.join("\n").slice(0, 3_800))
    .addFields(
      { name: "Câștigătorul", value: `<@${result.winner.id}> · ${result.winnerHp} ❤️ rămasă${payout ? ` · +${payout.toLocaleString("ro-RO")} Oboli` : ""}`, inline: false },
      ...(elo ? [{ name: "Rating", value: `<@${result.winner.id}> ${elo.winnerRating} (+${elo.delta}) · <@${result.loser.id}> ${elo.loserRating} (−${elo.delta})` }] : []),
    )
    .setFooter({ text: "/topduel — clasamentul duelurilor" });
  await interaction.editReply({ content: "", embeds: [embed], components: [], allowedMentions: { parse: [] } });
  return true;
}

export async function duelLeaderboard(guildId: string, limit = 10): Promise<Array<{ discordId: string; rating: number; wins: number; losses: number }>> {
  await ensureDuelTable();
  const { rows } = await pool.query<{ discord_id: string; rating: number; wins: number; losses: number }>(
    "SELECT discord_id, rating, wins, losses FROM player_duels WHERE guild_id = $1 AND wins + losses > 0 ORDER BY rating DESC, wins DESC LIMIT $2",
    [guildId, limit],
  );
  return rows.map((row) => ({ discordId: String(row.discord_id), rating: Number(row.rating), wins: Number(row.wins), losses: Number(row.losses) }));
}

export function buildDuelLeaderboard(rows: Awaited<ReturnType<typeof duelLeaderboard>>): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];
  return new EmbedBuilder()
    .setColor(0xd94a2b)
    .setTitle("⚔️ Clasamentul duelurilor")
    .setDescription(rows.length
      ? rows.map((row, index) => `${medals[index] ?? `**${index + 1}.**`} <@${row.discordId}> — **${row.rating}** · ${row.wins}V / ${row.losses}Î`).join("\n")
      : "Nu s-a dat încă niciun duel. Provoacă pe cineva cu /duel!")
    .setFooter({ text: `Toți încep de la ${START_RATING}. O victorie contra cuiva mai bun aduce mai multe puncte.` });
}
