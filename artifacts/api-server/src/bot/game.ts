import { db } from "@workspace/db";
import { playersTable, type Player } from "@workspace/db";
import { eq } from "drizzle-orm";

export const GOLD_PER_HOUR_PER_NIVEL = 80;
export const XP_PER_NIVEL = 100;

export const TRUPE = {
  arcas: { cost: 50, putere: 10, emoji: "🏹", nume: "Arcaș" },
  cavaler: { cost: 150, putere: 35, emoji: "🗡️", nume: "Cavaler" },
} as const;

export type TrupaKey = keyof typeof TRUPE;

export const MINA_COST = (nivel: number) => nivel * 200;
export const MINA_MAX = 10;

export async function getPlayer(discordId: string): Promise<Player | null> {
  const rows = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.discordId, discordId));
  return rows[0] ?? null;
}

export async function createPlayer(discordId: string, username: string): Promise<Player> {
  const rows = await db
    .insert(playersTable)
    .values({ discordId, username, gold: 100 })
    .returning();
  return rows[0]!;
}

export function calcAurAcumulat(player: Player): number {
  const oreTrecute =
    (Date.now() - player.ultimaAdunare.getTime()) / 1000 / 3600;
  return Math.floor(oreTrecute * GOLD_PER_HOUR_PER_NIVEL * player.nivelMina);
}

export function calcNivel(xp: number): number {
  return Math.floor(xp / XP_PER_NIVEL) + 1;
}

export async function adaugarGold(player: Player, amount: number): Promise<Player> {
  const rows = await db
    .update(playersTable)
    .set({
      gold: player.gold + amount,
      ultimaAdunare: new Date(),
    })
    .where(eq(playersTable.discordId, player.discordId))
    .returning();
  return rows[0]!;
}

export async function updatePlayer(
  discordId: string,
  values: Partial<Omit<Player, "discordId" | "createdAt">>,
): Promise<Player> {
  const rows = await db
    .update(playersTable)
    .set(values)
    .where(eq(playersTable.discordId, discordId))
    .returning();
  return rows[0]!;
}

export async function topPlayers(): Promise<Player[]> {
  const rows = await db
    .select()
    .from(playersTable)
    .orderBy(playersTable.xp);
  return rows.slice(0, 10).reverse();
}

export function putereAtac(player: Player): number {
  return player.arcasi * TRUPE.arcas.putere + player.cavaleri * TRUPE.cavaler.putere;
}

type NpcTier = { nume: string; emoji: string; hp: number; reward: number; xp: number };

export const NPC_TIERS: NpcTier[] = [
  { nume: "Sat de săteni", emoji: "🏘️", hp: 50, reward: 80, xp: 20 },
  { nume: "Fortăreață de bandiți", emoji: "🏴‍☠️", hp: 150, reward: 200, xp: 50 },
  { nume: "Castel barbar", emoji: "🏯", hp: 400, reward: 450, xp: 120 },
  { nume: "Dragon de munte", emoji: "🐉", hp: 1000, reward: 1000, xp: 300 },
];

export function randomNpc(putere: number): NpcTier {
  const accesibile = NPC_TIERS.filter((n) => n.hp <= putere * 3);
  if (accesibile.length === 0) return NPC_TIERS[0]!;
  return accesibile[Math.floor(Math.random() * accesibile.length)]!;
}
