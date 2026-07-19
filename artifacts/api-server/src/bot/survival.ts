import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { SUPER_ADMIN_ID } from "./constants";
import type { EventParticipant } from "@workspace/db";
import type { Player } from "@workspace/db";
import type { PlayerItem } from "@workspace/db";
import { IMG, COMPANION_IMG, CHEST_IMG, KEY_IMG, monsterImg, bossImg } from "./assets";
import { getActiveBattleEvent, consumeStormDrain } from "./combat-events";
import { getCombatModifiers, formatActiveEffects, formatCombatEffects } from "./status-effects";

const BASE_PRICES = { atac: 50, def: 60, dodge: 70, crit: 80, hp: 40 } as const;
export type ShopKey = keyof typeof BASE_PRICES;
export const LEVELUP_INTERVAL = 5;
export const ABILITY_COOLDOWN_MS = 5 * 60 * 1000;

// ─── Shared visual identity ──────────────────────────────────────────────────
// "Hub" / info embeds (profil, magazin, clasament, ajutor, clasă, companion)
// share this ash tone, the same footer, and the same section-divider rhythm so
// the whole interface reads as one product. Combat/chest/boss/death/levelup/
// retreat keep their semantic colors on purpose.
export const THEME_COLOR = 0x8a4a2f;
export const BRAND_FOOTER = "Regatul Cenușii — Cronica Umbrelor";
export function sectionTitle(label: string): string {
  return `**━━ ${label} ━━**`;
}

// ─── Monster rarities ──────────────────────────────────────────────────────
export type Rarity = "comun" | "rar" | "epic" | "legendar" | "mitic" | "boss";
export const RARITY: Record<Rarity, { label: string; emoji: string; color: number; rewardMult: number }> = {
  comun: { label: "Comun", emoji: "⚪", color: 0x9aa0a6, rewardMult: 1 },
  rar: { label: "Rar", emoji: "🔵", color: 0x3b82f6, rewardMult: 1.5 },
  epic: { label: "Epic", emoji: "🟣", color: 0x8b5cf6, rewardMult: 2.5 },
  legendar: { label: "Legendar", emoji: "🟠", color: 0xf59e0b, rewardMult: 4 },
  mitic: { label: "Mitic", emoji: "🔴", color: 0xef4444, rewardMult: 8 },
  boss: { label: "MINI-BOSS", emoji: "🔥", color: 0xb91c1c, rewardMult: 2 },
};
export const RARITY_WEIGHTS: [Exclude<Rarity, "boss">, number][] = [
  ["comun", 690], ["rar", 220], ["epic", 80], ["legendar", 9], ["mitic", 1],
];

export function isMiniBoss(level: number): boolean {
  return level > 0 && level % 10 === 0;
}

/** Chance for a mini-boss to ambush the player at a normal (non-multiple-of-10) level. */
export const BOSS_AMBUSH_CHANCE = 0.03;

export function rollRarity(level: number): Rarity {
  if (isMiniBoss(level)) return "boss";
  if (Math.random() < BOSS_AMBUSH_CHANCE) return "boss";
  const total = RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of RARITY_WEIGHTS) {
    if ((roll -= w) <= 0) return r;
  }
  return "comun";
}

/** Special boss ability — fires when the charge bar fills up. */
export interface BossAbility {
  name: string;
  emoji: string;
  /** Damage as % of the victim's max HP when the ability fires. */
  pct: number;
  /** If true, the boss heals for the damage dealt (lifesteal). */
  steal?: boolean;
}

/** The 10 named mini-bosses — index matches boss_NN assets in assets.ts. */
export const BOSSES: { name: string; desc: string; ability: BossAbility }[] = [
  { name: "Păstrătorul Rânced", desc: "Respirația Ciumei — un nor toxic care roade viața și armura celor prinși în el.", ability: { name: "Respirația Ciumei", emoji: "🦴", pct: 15 } },
  { name: "Strigoiul Fără Maxilar", desc: "Țipătul Golului — un urlet care amuțește abilitățile și zguduie carnea.", ability: { name: "Țipătul Golului", emoji: "💀", pct: 10 } },
  { name: "Călăul cu Masca de Fier", desc: "Execuția Finală — marchează pe cei slăbiți și lovește cu putere dublă.", ability: { name: "Execuția Finală", emoji: "⚔️", pct: 20 } },
  { name: "Păpușarul de Sânge", desc: "Corzi de Carne — leagă victimele între ele și le fură sângele prin fire vii.", ability: { name: "Corzi de Carne", emoji: "🩸", pct: 12, steal: true } },
  { name: "Cântărețul de Sub Pământ", desc: "Simfonia Fracturii — unde sonore care crapă solul și dezorientează.", ability: { name: "Simfonia Fracturii", emoji: "🎶", pct: 15 } },
  { name: "Femeia cu Trei Fețe", desc: "Schimbarea Destinului — trece prin foc, gheață și umbre, șocând arena la fiecare schimbare.", ability: { name: "Schimbarea Destinului", emoji: "🔮", pct: 12 } },
  { name: "Regele Cenușii", desc: "Furtuna Cenușii — lame de cenușă care taie vindecarea și grăbesc lovitura regelui.", ability: { name: "Furtuna Cenușii", emoji: "👑", pct: 12 } },
  { name: "Mama Abisului", desc: "Privirea Abisului — o rază din ochiul central care arde tot ce stă nemișcat.", ability: { name: "Privirea Abisului", emoji: "🌑", pct: 25 } },
  { name: "Copilul cu Inima Externă", desc: "Pulsul Corupt — inima expusă absoarbe viața tuturor și o bea pentru sine.", ability: { name: "Pulsul Corupt", emoji: "❤️", pct: 10, steal: true } },
  { name: "Călătorul dintre Lumi", desc: "Fractura Dimensională — se rupe în trei forme și explodează la reîntregire.", ability: { name: "Fractura Dimensională", emoji: "🌌", pct: 15 } },
];

/** Attacks needed to fill the ability charge bar in a mini-boss fight. */
export const BOSS_CHARGE_MAX = 5;
/** Total hits needed to fill the shared ability charge bar on the final boss. */
export const FINAL_BOSS_CHARGE_MAX = 8;

/** "⚡ ▰▰▱▱▱"-style charge bar. */
export function chargeBar(charge: number, max: number): string {
  const c = Math.max(0, Math.min(max, charge));
  return "🟧".repeat(c) + "⬛".repeat(max - c);
}

/** Deterministic boss index for a level — 7 is coprime with 10, so all 10 rotate before repeating. */
export function bossIndex(level: number): number {
  return ((level * 7 + 3) % BOSSES.length + BOSSES.length) % BOSSES.length;
}

/** Boss rank 1–10, grows with the level the boss appears at. */
export function bossRank(level: number): number {
  return Math.min(10, Math.max(1, Math.ceil(level / 10)));
}

// ─── Boss veteran ranks ─────────────────────────────────────────────────────
// Every boss a player defeats grows stronger for that player: the first kill
// gives it Rank I, then every 5 kills of the SAME boss rank it up again.
// Each rank adds +20% HP and +20% damage and bumps its displayed rarity tier.
export const VETERAN_KILLS_PER_RANK = 5;
export const VETERAN_MAX_RANK = 5;
export const VETERAN_TIERS = ["", "Rar 🔵", "Epic 🟣", "Legendar 🟠", "Mitic 🔴", "Etern ⚫"] as const;

/** Veteran rank 0–5 from how many times the player killed this boss. */
export function veteranRank(kills: number): number {
  if (kills <= 0) return 0;
  return Math.min(VETERAN_MAX_RANK, 1 + Math.floor(kills / VETERAN_KILLS_PER_RANK));
}

/** HP/damage multiplier for a veteran rank: +20% per rank. */
export function veteranMult(rank: number): number {
  return 1 + 0.2 * Math.max(0, Math.min(VETERAN_MAX_RANK, rank));
}

/** Veteran rank of the boss at `level` for a player with these per-boss kill counts. */
export function veteranRankFor(level: number, rarity: string | null | undefined, bossKills: Record<string, number> | null | undefined): number {
  if (!isBossFight(level, rarity ?? undefined)) return 0;
  return veteranRank(bossKills?.[String(bossIndex(level))] ?? 0);
}

/** Max HP of the monster at spawn, scaled by the player's veteran rank when it's a boss. */
export function monsterSpawnHp(level: number, rarity: string | undefined, bossKills: Record<string, number> | null | undefined): number {
  return Math.round(monsterMaxHp(level, rarity) * veteranMult(veteranRankFor(level, rarity, bossKills)));
}

/** The 14 named monsters — index matches MONSTER_IMG in assets.ts. */
export const MONSTERS: { name: string; desc: string }[] = [
  { name: "Golemul de Măduvă", desc: "Colos de os și piatră, cu inimă pulsând ca un blestem." },
  { name: "Păstorul Umbrelor", desc: "Siluetă în zdrențe negre, cu toiag din vertebre și roi de umbre vii." },
  { name: "Groparul Etern", desc: "Humanoid cenușiu, cu lopată neagră ce deschide morminte singure." },
  { name: "Țesătoarea de Viscere", desc: "Creatură feminină contorsionată, țesând pânze din carne și sânge." },
  { name: "Arhitectul Fumului Negru", desc: "Entitate fără chip, alcătuită din fum și cenușă, creator de structuri imposibile." },
  { name: "Orfanul Sângeros", desc: "Copil palid cu ochi negri și o păpușă plină de ace, aducător de sângerări și umbre." },
  { name: "Călăul Fără Maxilar", desc: "Gigant cu fața ruptă, purtând un topor masiv, cu maxilarul smuls." },
  { name: "Femeia cu 100 de Colțuri", desc: "O entitate feminină cu membre fracturate în unghiuri imposibile." },
  { name: "Strigătul din Fântână", desc: "O creatură acvatică, cu pielea albastră și ochii luminoși, care urlă din adâncuri." },
  { name: "Călătorul cu Trei Fețe", desc: "Un nomad spectral cu trei expresii suprapuse: furie, tristețe, goliciune." },
  { name: "Câinele cu Oasele pe Exterior", desc: "Un animal de vânătoare, cu scheletul expus și ochi roșii." },
  { name: "Regina Cuibului de Viermi", desc: "O matroană monstruoasă, cu viermi ieșind din corpul ei ca niște copii." },
  { name: "Cântărețul cu Gâtul Deschis", desc: "Un bard blestemat, cu gâtul tăiat, cântând printr-un gol în carne." },
  { name: "Umbra care Poartă Oglinda", desc: "O entitate care reflectă nu imaginea ta, ci moartea ta viitoare." },
];

/** Deterministic monster index for a level — 11 is coprime with 14, so all 14 rotate before repeating. */
export function monsterIndex(level: number): number {
  return ((level * 11 + 5) % MONSTERS.length + MONSTERS.length) % MONSTERS.length;
}

/** True when this fight is a boss fight — either a guaranteed mini-boss level or an ambush roll. */
export function isBossFight(level: number, rarity?: string): boolean {
  return rarity != null ? rarity === "boss" : isMiniBoss(level);
}

export function monsterName(level: number, rarity?: string): string {
  if (isBossFight(level, rarity)) return BOSSES[bossIndex(level)]!.name;
  return MONSTERS[monsterIndex(level)]!.name;
}

export function monsterDesc(level: number): string {
  return MONSTERS[monsterIndex(level)]!.desc;
}
export function monsterMaxHp(level: number, rarity?: string) {
  const base = 40 + level * 15;
  return isBossFight(level, rarity) ? Math.round(base * 2.5) : base;
}
export function monsterDmgRange(level: number, rarity?: string): [number, number] {
  const b = (5 + level * 1.5) * (isBossFight(level, rarity) ? 1.4 : 1);
  return [Math.max(1, Math.floor(b - 3)), Math.ceil(b + 3)];
}
export function monsterHitPct(level: number, rarity?: string) { return Math.min(90, 35 + level * 1.2 + (isBossFight(level, rarity) ? 5 : 0)); }
export function monsterReward(level: number, rarity: Rarity = "comun") {
  const mult = RARITY[rarity]?.rewardMult ?? 1;
  return { xp: Math.round(level * 10 * mult), oboli: Math.round(level * 3 * mult) };
}
export function shopPrice(key: ShopKey, count: number) { return Math.ceil(BASE_PRICES[key] * Math.pow(1.35, count)); }

// ─── Zones ─────────────────────────────────────────────────────────────────
const ZONES: { max: number; name: string; intro: string }[] = [
  { max: 10, name: "Pădurea Umbrelor", intro: "🌲 Copacii negri foșnesc, iar umbrele se târăsc printre rădăcini." },
  { max: 25, name: "Catacombele Regale", intro: "🕯️ Umbrele sunt mai reci aici… și mai flămânde." },
  { max: 50, name: "Ținuturile Arse", intro: "🔥 Pământul fumegă sub pași, iar cenușa nu se mai așază niciodată." },
  { max: 100, name: "Turnul Vânturilor Negre", intro: "🗼 Vânturi întunecate urlă printre ziduri sfărâmate." },
  { max: Infinity, name: "Abisul Fumegând", intro: "🌑 Ai pătruns în Abis. Doar cei eterni mai pot respira aici." },
];
export function zoneFor(level: number) { return ZONES.find((z) => level <= z.max) ?? ZONES[ZONES.length - 1]!; }

// ─── Level titles (evolutive) ───────────────────────────────────────────────
const LEVEL_TITLES: { max: number; title: string }[] = [
  { max: 5, title: "Umbra Începătorului" },
  { max: 10, title: "Călătorul Cenușii" },
  { max: 20, title: "Vânătorul Umbrelor" },
  { max: 40, title: "Sfărâmătorul Abisului" },
  { max: 80, title: "Arhontele Întunecat" },
  { max: 99, title: "Stăpânul Cenușii" },
  { max: Infinity, title: "Eternul Cenușii" },
];
export function levelTitle(level: number): string {
  return (LEVEL_TITLES.find((t) => level <= t.max) ?? LEVEL_TITLES[0]!).title;
}

// ─── RPG classes ─────────────────────────────────────────────────────────────
export type ClassKey = "cavaler" | "umbrolog" | "strajer" | "alchimist" | "ratacitor";
export const CLASSES: Record<ClassKey, {
  label: string; emoji: string; desc: string;
  attack: number; hp: number; dodge: number; crit: number; xpMult: number; oboliMult: number;
}> = {
  cavaler: { label: "Cavaler al Cenușii", emoji: "🛡️", desc: "+2 daune, +5 HP", attack: 2, hp: 5, dodge: 0, crit: 0, xpMult: 1, oboliMult: 1 },
  umbrolog: { label: "Umbrolog", emoji: "🌀", desc: "+3% evitare, +1% critic", attack: 0, hp: 0, dodge: 3, crit: 1, xpMult: 1, oboliMult: 1 },
  strajer: { label: "Străjerul Arșiței", emoji: "🔥", desc: "+10% XP câștigat", attack: 0, hp: 0, dodge: 0, crit: 0, xpMult: 1.1, oboliMult: 1 },
  alchimist: { label: "Alchimist Stins", emoji: "⚗️", desc: "+20% Oboli câștigați", attack: 0, hp: 0, dodge: 0, crit: 0, xpMult: 1, oboliMult: 1.2 },
  ratacitor: { label: "Rătăcitorul Fumului", emoji: "💨", desc: "+5% șansă de evitare", attack: 0, hp: 0, dodge: 5, crit: 0, xpMult: 1, oboliMult: 1 },
};
export function isClassKey(k: string): k is ClassKey { return k in CLASSES; }

// Effective class bonuses at a given level (base × 1.05^(level-1), like companions).
export function classStats(key: ClassKey, level: number): { attack: number; hp: number; dodge: number; crit: number } {
  const c = CLASSES[key];
  const m = bonusMult(level);
  return {
    attack: Math.round(c.attack * m),
    hp: Math.round(c.hp * m),
    dodge: Math.round(c.dodge * m),
    crit: Math.round(c.crit * m),
  };
}

// Cost for class upgrade: Oboli + XP + materials (scales with level).
export function classUpgradeCost(level: number): { gold: number; xp: number; items: { item: ItemKey; qty: number }[] } {
  const gold = Math.ceil(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, Math.max(0, level - 1)));
  const xp = UPGRADE_XP_COST;
  const items: { item: ItemKey; qty: number }[] = [
    { item: "fragment_cenusa", qty: level * 2 },
    { item: "sange_monstru",   qty: Math.ceil(level / 2) },
  ];
  if (level >= 3) items.push({ item: "esenta_umbrei", qty: Math.ceil(level / 3) });
  if (level >= 5) items.push({ item: "picatura_otr",    qty: Math.ceil(level / 5) });
  return { gold, xp, items };
}

// ─── Shop economy: companions & abilities ─────────────────────────────────────
// Companions and abilities are bought with Oboli (gold) and then leveled up.
// Each upgrade consumes XP and Oboli; cost grows 15%/level, the offered bonus
// grows 5%/level (compound). Companions evolve (legendary art) at EVOLVE_LEVEL.
export const COMPANION_BUY_COST = 300; // one-time, Oboli
export const ABILITY_BUY_COST = 250; // per ability unlock, Oboli
export const UPGRADE_BASE_COST = 200; // Oboli for the first upgrade
export const UPGRADE_COST_GROWTH = 1.15;
export const UPGRADE_BONUS_GROWTH = 1.05;
export const UPGRADE_XP_COST = 100; // XP consumed per upgrade
export const COMPANION_EVOLVE_LEVEL = 5; // companion level at which art evolves

// Oboli cost to go from `level` to `level+1`.
export function upgradeCost(level: number): number {
  return Math.ceil(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, Math.max(0, level - 1)));
}
// Multiplier applied to a base bonus at a given level (level 1 = ×1).
export function bonusMult(level: number): number {
  return Math.pow(UPGRADE_BONUS_GROWTH, Math.max(0, level - 1));
}
// Empower (Lovitura Umbrei): ×2 at level 1, the +100% bonus grows 5%/level.
export function empowerMult(level: number): number {
  if (level < 1) return 1;
  return 1 + bonusMult(level);
}
// Shield (Scut de Cenușă): 50% damage reduction at level 1, grows 5%/level (cap 90%).
export function shieldReduction(level: number): number {
  if (level < 1) return 0;
  return Math.min(0.9, 0.5 * bonusMult(level));
}

export type CompanionKey = "lup" | "corb" | "spirit" | "golem";
export const COMPANIONS: Record<CompanionKey, {
  label: string; emoji: string; desc: string; evoLabel: string; lore: string;
  attack: number; hp: number; crit: number; defense: number;
}> = {
  lup: { label: "Lupul de Cenușă", emoji: "🐺", desc: "+2 daune", evoLabel: "Alfa de Cenușă", lore: "Un lup spectral, credincios până în Abis.", attack: 2, hp: 0, crit: 0, defense: 0 },
  corb: { label: "Corbul Umbrelor", emoji: "🐦‍⬛", desc: "+3% critic", evoLabel: "Corbul de Jar", lore: "Ochii lui văd slăbiciunea oricărui monstru.", attack: 0, hp: 0, crit: 3, defense: 0 },
  spirit: { label: "Spiritul Stins", emoji: "👻", desc: "+5 HP", evoLabel: "Străjerul Eteric", lore: "O umbră blândă ce te ține în viață.", attack: 0, hp: 5, crit: 0, defense: 0 },
  golem: { label: "Golem de Fum", emoji: "🗿", desc: "-1 daune primite", evoLabel: "Colosul de Magmă", lore: "Un zid de cenușă între tine și moarte.", attack: 0, hp: 0, crit: 0, defense: 1 },
};
export function isCompanionKey(k: string): k is CompanionKey { return k in COMPANIONS; }

export function isCompanionEvolved(companionLevel: number): boolean {
  return companionLevel >= COMPANION_EVOLVE_LEVEL;
}

// Effective bonuses for a companion at a given level (base × 1.05^(level-1)).
export function companionStats(key: CompanionKey, level: number): { attack: number; hp: number; crit: number; defense: number } {
  const c = COMPANIONS[key];
  const m = bonusMult(level);
  return {
    attack: Math.round(c.attack * m),
    hp: Math.round(c.hp * m),
    crit: Math.round(c.crit * m),
    defense: Math.round(c.defense * m),
  };
}
// Precise (unrounded) effective bonus for display, e.g. "+2.6 daune".
export function companionEffectiveDesc(key: CompanionKey, level: number): string {
  const c = COMPANIONS[key];
  const m = bonusMult(level);
  if (c.attack) return `+${(c.attack * m).toFixed(1)} daune`;
  if (c.crit) return `+${(c.crit * m).toFixed(1)}% critic`;
  if (c.hp) return `+${(c.hp * m).toFixed(1)} HP`;
  if (c.defense) return `-${(c.defense * m).toFixed(1)} daune primite`;
  return c.desc;
}

export const ABILITIES = {
  empower: { label: "Lovitura Umbrei", emoji: "🌑", desc: "Următoarea lovitură ×2 (crește 5%/nivel)" },
  shield: { label: "Scut de Cenușă", emoji: "🛡️", desc: "Următorul atac primit -50% (crește 5%/nivel)" },
} as const;
export type AbilityKey = keyof typeof ABILITIES;
export function isAbilityKey(k: string): k is AbilityKey { return k in ABILITIES; }

// Effective ability bonus at a given level, for display ("+105% daune", "-52% daune primite").
export function abilityEffectiveDesc(kind: AbilityKey, level: number): string {
  if (kind === "empower") {
    const pct = Math.round((empowerMult(level) - 1) * 100);
    return `+${pct}% daune la următoarea lovitură`;
  }
  const pct = Math.round(shieldReduction(level) * 100);
  return `-${pct}% daune la următorul atac primit`;
}

// ─── Item drop system ─────────────────────────────────────────────────────────
export const ITEMS = {
  fragment_cenusa: { label: "Fragment de Cenușă",  emoji: "🪨", rarity: "common" },
  esenta_umbrei:   { label: "Esența Umbrei",        emoji: "🌫️", rarity: "common" },
  sange_monstru:   { label: "Sânge de Monstru",    emoji: "🩸", rarity: "common" },
  picatura_otr:    { label: "Picătură de Otravă",  emoji: "💧", rarity: "common" },
  coama_dragonului:{ label: "Coamă de Dragon",     emoji: "🐉", rarity: "rare"   },
  inima_abisului:  { label: "Inimă a Abisului",    emoji: "🌑", rarity: "rare"   },
} as const;
export type ItemKey = keyof typeof ITEMS;
export function isItemKey(k: string): k is ItemKey { return k in ITEMS; }

/** Returns an item key that dropped, or null if nothing dropped. */
export function rollItemDrop(monsterLevel: number): ItemKey | null {
  if (Math.random() > 0.20) return null;
  const common: ItemKey[] = ["fragment_cenusa", "esenta_umbrei", "sange_monstru", "picatura_otr"];
  if (monsterLevel < 20) {
    return common[Math.floor(Math.random() * common.length)]!;
  }
  if (monsterLevel < 50) {
    return common[Math.floor(Math.random() * common.length)]!;
  }
  if (Math.random() < 0.10) return "coama_dragonului";
  return common[Math.floor(Math.random() * common.length)]!;
}

// ─── Daily quest system ───────────────────────────────────────────────────────

export const DAILY_QUESTS = {
  kill_10: {
    label: "Ucide 10 monștri",
    description: "Combate 10 monștri în Ora Umbrelor.",
    target: 10,
    reward: { itemKey: "coama_dragonului" as ItemKey, qty: 1 },
    emoji: "⚔️",
  },
} as const;

export type DailyQuestKey = keyof typeof DAILY_QUESTS;

export function buildProgressBar(current: number, target: number, width: number): string {
  const pct = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  let filled = Math.round(pct * width);
  if (current > 0 && filled === 0) filled = 1;
  return "🟦".repeat(filled) + "⬛".repeat(width - filled);
}

export function buildMissionEmbed(
  questKey: DailyQuestKey,
  progress: number,
  completed: boolean,
  rewardGiven: boolean,
  questDate: string | null,
  today: string,
): EmbedBuilder {
  const quest = DAILY_QUESTS[questKey];
  const isToday = questDate === today;
  const cur = isToday ? progress : 0;
  const done = isToday && completed;
  const bar = buildProgressBar(cur, quest.target, 10);
  const rewardItem = ITEMS[quest.reward.itemKey];

  let statusLine: string;
  if (done && isToday && rewardGiven) {
    statusLine = "✅ **Misiune completată!** Recompensa a fost acordată.";
  } else if (done && isToday && !rewardGiven) {
    statusLine = "✅ **Misiune completată!** Recompensa va fi acordată la uciderea unui monstru.";
  } else {
    statusLine = `${quest.emoji} ${bar} **${cur}/${quest.target}**`;
  }

  return new EmbedBuilder()
    .setTitle("📜 Misiunea Zilnică")
    .setColor(THEME_COLOR)
    .setDescription(
      `${sectionTitle("Misiunea de Azi")}\n` +
      `**${quest.label}**\n` +
      `${quest.description}\n\n` +
      `${statusLine}\n\n` +
      `${sectionTitle("Recompensă")}\n` +
      `${rewardItem.emoji} **${quest.reward.qty}× ${rewardItem.label}**\n\n` +
      `*Misiunile se resetează automat la miezul nopții (UTC).*`,
    )
    .setFooter({ text: BRAND_FOOTER });
}

// ─── Talisman system ──────────────────────────────────────────────────────────
// Each talisman has 5 levels; `values[level-1]` is the passive's magnitude at
// that level. Levels 1-2 keep the original (pre-Nv.3) values for backwards compat.
export const TALISMAN_MAX_LEVEL = 5;
export const TALISMANS = {
  crista_vietii: {
    label: "Crista Vieții", emoji: "🔮", price: 250,
    passiveLabel: "Regen de viață",
    values: [15, 30, 45, 65, 90],
    fmt: (v: number) => `+${v} HP după uciderea unui monstru`,
    upgradeItems: { common: "fragment_cenusa" as ItemKey, rare: "coama_dragonului" as ItemKey },
  },
  runa_sangelui: {
    label: "Runa Sângelui", emoji: "🩸", price: 300,
    passiveLabel: "Furt de viață",
    values: [8, 18, 28, 40, 55],
    fmt: (v: number) => `+${v} HP la fiecare lovitură critică`,
    upgradeItems: { common: "sange_monstru" as ItemKey, rare: "inima_abisului" as ItemKey },
  },
  giulgiul_stins: {
    label: "Giulgiul Stins", emoji: "🌫️", price: 280,
    passiveLabel: "Reducere daune",
    values: [3, 7, 11, 16, 22],
    fmt: (v: number) => `-${v} din daunele primite de la monștri`,
    upgradeItems: { common: "esenta_umbrei" as ItemKey, rare: "coama_dragonului" as ItemKey },
  },
  sfera_abisului: {
    label: "Sfera Abisului", emoji: "🌑", price: 350,
    passiveLabel: "Percepție abisală",
    values: [5, 12, 18, 25, 35],
    fmt: (v: number) => `+${v}% șansă de lovitură critică`,
    upgradeItems: { common: "picatura_otr" as ItemKey, rare: "inima_abisului" as ItemKey },
  },
  piatra_eco: {
    label: "Piatra Eco", emoji: "🪨", price: 320,
    passiveLabel: "Rezonanță XP",
    values: [25, 60, 95, 135, 180],
    fmt: (v: number) => `+${v}% XP din fiecare monstru ucis`,
    upgradeItems: { common: "esenta_umbrei" as ItemKey, rare: "coama_dragonului" as ItemKey },
  },
} as const;
export type TalismanKey = keyof typeof TALISMANS;
export function isTalismanKey(k: string): k is TalismanKey { return k in TALISMANS; }

/** Passive magnitude for a talisman at a given level (clamped to 1..TALISMAN_MAX_LEVEL). */
export function talismanValue(key: TalismanKey, level: number): number {
  const idx = Math.min(Math.max(1, level), TALISMAN_MAX_LEVEL) - 1;
  return TALISMANS[key].values[idx];
}

/** Human-readable passive description for a talisman at a given level. */
export function talismanDesc(key: TalismanKey, level: number): string {
  return TALISMANS[key].fmt(talismanValue(key, level));
}

/** Material cost to upgrade a talisman from `fromLevel` to `fromLevel + 1`. */
export function talismanUpgradeCost(key: TalismanKey, fromLevel: number): { common: ItemKey; commonQty: number; rare: ItemKey; rareQty: number } {
  const t = TALISMANS[key].upgradeItems;
  return { common: t.common, commonQty: fromLevel + 2, rare: t.rare, rareQty: fromLevel };
}

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function hpBar(cur: number, max: number) {
  const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  let f = Math.round(pct * 10);
  if (cur > 0 && f === 0) f = 1;
  const color = pct > 0.6 ? "🟩" : pct > 0.3 ? "🟨" : "🟥";
  return color.repeat(f) + "⬛".repeat(10 - f);
}

export type CombatResult = {
  playerDmg: number; isCrit: boolean;
  /** Damage before crit/empower/battle-event multipliers — for the breakdown line. */
  baseDmg: number;
  monsterDefeated: boolean;
  monsterHit: boolean; monsterDmg: number; playerDodged: boolean;
  playerDied: boolean;
  newMonsterHp: number; newPlayerHp: number;
  xpGained: number; oboliGained: number;
  levelUp: boolean; newMonsterLevel: number; newMonsterRarity: Rarity;
  usedEmpower: boolean; usedShield: boolean;
  stormDrain: number; battleEventEmoji: string;
  /** HP restored by talisman passives (runa_sangelui life steal on crit). */
  hpRegen: number;
  /** Boss ability charge after this round (persisted on the participant). */
  newBossCharge: number;
  /** True when the boss's special ability fired this round. */
  abilityFired: boolean;
  /** Damage the ability dealt to the player (0 if not fired). */
  abilityDmg: number;
  /** HP the boss healed via lifesteal ability (0 if none). */
  abilityHeal: number;
};

export function doCombat(p: EventParticipant, talismanKey?: string | null, talismanLevel = 1, bossKills?: Record<string, number> | null): CombatResult {
  const vetRank = veteranRankFor(p.monsterLevel, p.monsterRarity, bossKills);
  const vetMult = veteranMult(vetRank);
  const battle = getActiveBattleEvent();
  const mods = getCombatModifiers(p.discordId);
  const usedEmpower = p.empowerNext;
  const usedShield = p.shieldNext;

  // sfera_abisului: bonus crit permanent per round
  const talismanCritAdd =
    talismanKey === "sfera_abisului" ? talismanValue("sfera_abisului", talismanLevel) : 0;

  const isCrit = Math.random() * 100 < Math.min(100, Math.max(0, p.critBonus + mods.critAdd + talismanCritAdd));
  const baseDmg = rand(10, 20) + p.attackBonus;
  let base = baseDmg;
  if (isCrit) base *= 2;
  if (usedEmpower) base = Math.round(base * empowerMult(p.empowerLevel));
  if (battle) base = Math.round(base * battle.damageMult);
  if (mods.damageMult !== 1) base = Math.round(base * mods.damageMult);
  const playerDmg = base;
  const newMHp = Math.max(0, p.monsterCurrentHp - playerDmg);
  const monsterDefeated = newMHp <= 0;

  let xpGained = 0, oboliGained = 0, newMonsterLevel = p.monsterLevel, levelUp = false;
  let newMonsterRarity: Rarity = p.monsterRarity as Rarity;
  if (monsterDefeated) {
    const r = monsterReward(p.monsterLevel, p.monsterRarity as Rarity);
    xpGained = r.xp + p.xpPerKill; oboliGained = r.oboli;
    newMonsterLevel = p.monsterLevel + 1;
    newMonsterRarity = rollRarity(newMonsterLevel);
    levelUp = newMonsterLevel % LEVELUP_INTERVAL === 0;
  }

  // Smoke-storm drain hits the fighter once, regardless of the monster's turn.
  const stormDrain = consumeStormDrain(p.eventId, p.discordId);
  let newPlayerHp = Math.max(0, p.currentHp - stormDrain);
  let monsterHit = false, monsterDmg = 0, playerDodged = false, playerDied = newPlayerHp <= 0;

  if (!monsterDefeated && !playerDied) {
    const missBonus = battle?.monsterMissBonus ?? 0;
    monsterHit = Math.random() * 100 < monsterHitPct(p.monsterLevel, p.monsterRarity) - missBonus;
    if (monsterHit) {
      playerDodged = Math.random() * 100 < p.dodgeBonus;
      if (!playerDodged) {
        const [mn, mx] = monsterDmgRange(p.monsterLevel, p.monsterRarity);
        monsterDmg = Math.max(1, Math.round(rand(mn, mx) * vetMult) - p.defenseBonus);
        // giulgiul_stins: flat damage reduction from monsters (can reduce to 0)
        if (talismanKey === "giulgiul_stins") {
          const reduction = talismanValue("giulgiul_stins", talismanLevel);
          monsterDmg = Math.max(0, monsterDmg - reduction);
        }
        if (usedShield) monsterDmg = Math.max(1, Math.round(monsterDmg * (1 - shieldReduction(p.shieldLevel))));
        if (mods.damageTakenMult !== 1) monsterDmg = Math.max(1, Math.round(monsterDmg * mods.damageTakenMult));
        newPlayerHp = Math.max(0, newPlayerHp - monsterDmg);
        playerDied = newPlayerHp <= 0;
      }
    }
  }

  // Boss ability charge bar: fills +1 each round in a mini-boss fight; when
  // full, the boss unleashes its special ability (% of the player's max HP,
  // some bosses also heal for that amount), then the bar resets.
  let newBossCharge = p.bossCharge ?? 0;
  let abilityFired = false, abilityDmg = 0, abilityHeal = 0;
  let finalMonsterHp = monsterDefeated ? monsterSpawnHp(newMonsterLevel, newMonsterRarity, bossKills) : newMHp;
  if (isBossFight(p.monsterLevel, p.monsterRarity as Rarity) && !monsterDefeated) {
    newBossCharge += 1;
    if (newBossCharge >= BOSS_CHARGE_MAX && !playerDied) {
      const ab = BOSSES[bossIndex(p.monsterLevel)]!.ability;
      abilityFired = true;
      abilityDmg = Math.max(1, Math.round((p.maxHp * ab.pct) / 100));
      newPlayerHp = Math.max(0, newPlayerHp - abilityDmg);
      playerDied = newPlayerHp <= 0;
      if (ab.steal) {
        abilityHeal = abilityDmg;
        finalMonsterHp = Math.min(Math.round(monsterMaxHp(p.monsterLevel, p.monsterRarity as Rarity) * vetMult), finalMonsterHp + abilityHeal);
      }
      newBossCharge = 0;
    }
  } else if (monsterDefeated) {
    newBossCharge = 0;
  }

  // runa_sangelui: life steal on crit — only if player survived
  const hpRegen =
    talismanKey === "runa_sangelui" && isCrit && !playerDied
      ? talismanValue("runa_sangelui", talismanLevel)
      : 0;

  return {
    playerDmg, isCrit, baseDmg, monsterDefeated, monsterHit, monsterDmg, playerDodged,
    playerDied, newMonsterHp: finalMonsterHp,
    newPlayerHp, xpGained, oboliGained, levelUp, newMonsterLevel, newMonsterRarity,
    usedEmpower, usedShield, stormDrain, battleEventEmoji: battle?.emoji ?? "", hpRegen,
    newBossCharge, abilityFired, abilityDmg, abilityHeal,
  };
}

export function buildStartEmbed(expiresAt?: Date): EmbedBuilder {
  const timerLine = expiresAt
    ? `\n${sectionTitle("Timp rămas")}\n⏳ Evenimentul se încheie **<t:${Math.floor(expiresAt.getTime() / 1000)}:R>**`
    : "";
  return new EmbedBuilder()
    .setColor(0x1a0000)
    .setTitle("⚔️🔥  ORA UMBRELOR A ÎNCEPUT  🔥⚔️")
    .setDescription(
      "Umbrele se ridică din adâncuri, iar cenușa dansează în aer.\n" +
      "Regatul Cenușii cheamă luptătorii să își dovedească puterea.\n\n" +
      "Un val nesfârșit de creaturi se pregătește să vă înfrunte.\n" +
      "Apasă pe butonul sacru și intră în luptă.\n" +
      sectionTitle("Atenție") + "\n" +
      "💀 Moartea în acest eveniment este **definitivă**.\n" +
      "Cei căzuți în Umbre nu mai pot continua până la următoarea chemare.\n" +
      "🗝️ Învingând Dragonul poți găsi și **chei** ascunse în pradă." +
      timerLine,
    )
    .setTimestamp();
}

export function buildCombatEmbed(p: EventParticipant, extra = "", avatarUrl?: string | null, player?: Player | null): EmbedBuilder {
  const rarity = (p.monsterRarity as Rarity) ?? "comun";
  const [mn, mx] = monsterDmgRange(p.monsterLevel, rarity);
  const vetRank = veteranRankFor(p.monsterLevel, rarity, player?.bossKills);
  const mMaxHp = Math.round(monsterMaxHp(p.monsterLevel, rarity) * veteranMult(vetRank));
  const meta = RARITY[rarity] ?? RARITY.comun;
  const reward = monsterReward(p.monsterLevel, rarity);
  const zone = zoneFor(p.monsterLevel);
  const boss = isBossFight(p.monsterLevel, rarity);
  const title = boss
    ? `🔥 MINI-BOSS NIVEL ${p.monsterLevel} – ${monsterName(p.monsterLevel, rarity)} 🔥`
    : `${meta.emoji} MONSTRU ${meta.label.toUpperCase()} NIVEL ${p.monsterLevel} – ${monsterName(p.monsterLevel, rarity)}`;
  const battle = getActiveBattleEvent();
  const effectsText = formatCombatEffects(p.discordId);
  const effectsSection = effectsText
    ? `\n\n🔮 **Efectele tale active:**\n${effectsText}`
    : "";
  const bonusLines: string[] = [];
  if (player?.class && isClassKey(player.class)) {
    const cls = CLASSES[player.class];
    const clsLvl = player.classLevel ?? 1;
    const cs = classStats(player.class, clsLvl);
    const clsParts = [
      cs.attack > 0 ? `+${cs.attack} daune` : "",
      cs.hp > 0 ? `+${cs.hp} HP` : "",
      cs.dodge > 0 ? `+${cs.dodge}% evitare` : "",
      cs.crit > 0 ? `+${cs.crit}% critic` : "",
      cls.xpMult !== 1 ? `XP ×${cls.xpMult}` : "",
      cls.oboliMult !== 1 ? `Oboli ×${cls.oboliMult}` : "",
    ].filter(Boolean).join(", ");
    bonusLines.push(`${cls.emoji} **${cls.label}** Nv.${clsLvl} — ${clsParts || cls.desc}`);
  }
  if (player?.companion && isCompanionKey(player.companion)) {
    const comp = COMPANIONS[player.companion];
    const compLvl = player.companionLevel ?? 1;
    const evolved = isCompanionEvolved(compLvl);
    bonusLines.push(
      `${comp.emoji} **${evolved ? comp.evoLabel : comp.label}** Nv.${compLvl}${evolved ? " ✨" : ""} — ${companionEffectiveDesc(player.companion, compLvl)}`,
    );
  }
  const talKey = player?.talisman && isTalismanKey(player.talisman) ? player.talisman : null;
  if (talKey) {
    const t = TALISMANS[talKey];
    const tLvl = player?.talismanLevel ?? 1;
    bonusLines.push(`${t.emoji} **${t.label}** Nv.${tLvl} — ${talismanDesc(talKey, tLvl)}`);
  }
  if (p.xpPerKill > 0) bonusLines.push(`🔹 **+${p.xpPerKill} XP** la fiecare monstru ucis *(bonus level-up)*`);
  const bonusSection = bonusLines.length
    ? `\n\n📌 **Bonusurile tale:**\n${bonusLines.join("\n")}`
    : "";
  const rewardXpStr = p.xpPerKill > 0
    ? `${reward.xp} XP *(+${p.xpPerKill} bonus)*`
    : `${reward.xp} XP`;
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(title)
    .setDescription(
      `🗺️ *${zone.name}* — ${zone.intro}\n\n` +
      (boss
        ? `👁️ *${BOSSES[bossIndex(p.monsterLevel)]!.desc}*\n` +
          `☠️ Rang boss: **${bossRank(p.monsterLevel)}/10** ${"🔥".repeat(bossRank(p.monsterLevel))}${"▱".repeat(10 - bossRank(p.monsterLevel))}\n` +
          (vetRank > 0
            ? `🏅 Rang veteran: **${VETERAN_TIERS[vetRank]}** — *te-a studiat! +${vetRank * 20}% viață și daune*\n`
            : "") +
          `${BOSSES[bossIndex(p.monsterLevel)]!.ability.emoji} Abilitate: **${BOSSES[bossIndex(p.monsterLevel)]!.ability.name}** ${chargeBar(p.bossCharge ?? 0, BOSS_CHARGE_MAX)}\n` +
          `⚡ *Când bara se umple, bossul își dezlănțuie abilitatea!*\n` +
          `💀 O prezență colosală blochează drumul. Recompensă dublă pentru cel care o doboară!\n\n`
        : `👁️ *${monsterDesc(p.monsterLevel)}*\n\n`) +
      (battle ? `${battle.emoji} *${battle.title} e activ acum!*\n\n` : "") +
      (extra ? `${extra}\n\n` : "") +
      `❤️ HP Monstru: **${p.monsterCurrentHp}/${mMaxHp}** ${hpBar(p.monsterCurrentHp, mMaxHp)}\n` +
      `⚔️ Daune: **${mn} – ${mx}**\n` +
      `🎯 Șansă lovitură: **${monsterHitPct(p.monsterLevel, rarity).toFixed(0)}%**\n` +
      `💰 Recompensă: **${rewardXpStr}, ${reward.oboli} Oboli**\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `❤️ HP-ul tău: **${p.currentHp}/${p.maxHp}** ${hpBar(p.currentHp, p.maxHp)}\n` +
      `🪙 Oboli strânși în eveniment: **${p.oboli}** *(20% se pierd la moarte)*` +
      bonusSection +
      effectsSection,
    )
    .setImage(
      (boss ? bossImg(bossIndex(p.monsterLevel)) : monsterImg(monsterIndex(p.monsterLevel), p.monsterRarity)) ??
        IMG.monster,
    )
    .setFooter({ text: `⚔️ +${p.attackBonus} | 🛡️ +${p.defenseBonus} | 🌀 ${p.dodgeBonus}% | 💥 ${p.critBonus}% | ❤️ +${p.maxHp - 100}` });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

const CRIT_LINES = [
  "💥 **LOVITURĂ DEVASTATOARE** 💥\nUmbrele se rup în două sub puterea ta!\nAi provocat **{dmg} daune critice**!",
  "🔥 **FURIA CENUȘII SE DEZLĂNȚUIE** 🔥\nLovitura ta a sfâșiat creatura pentru **{dmg} daune**!",
  "⚡ **IMPACT CATACLISMIC** ⚡\nCenușa explodează în jurul creaturii — **{dmg} daune**!",
];

export type RewardBreakdown = {
  /** XP/Oboli before class/effect/talisman multipliers (r.xpGained/oboliGained hold the final values). */
  baseXp: number;
  baseOboli: number;
  /** HP restored by Crista Vieții after the kill (0 = none). */
  cristaHeal?: number;
};

export function buildResultText(r: CombatResult, itemDrop?: ItemKey | null, breakdown?: RewardBreakdown): string {
  let txt = "";
  if (r.usedEmpower) txt += "🌑 **LOVITURA UMBREI!** Puterea Umbrelor îți dublează lovitura!\n";
  if (r.usedShield) txt += "🛡️ **SCUT DE CENUȘĂ activ!** Daunele primite sunt înjumătățite.\n";
  if (r.isCrit) {
    txt += CRIT_LINES[Math.floor(Math.random() * CRIT_LINES.length)]!.replace("{dmg}", String(r.playerDmg)) + "\n";
  } else {
    txt += `⚔️ **AI LOVIT MONSTRUL!**\nLovitura ta a atins creatura pentru **${r.playerDmg} daune**.\nUmbrele se clatină în jurul ei.\n`;
  }
  if (r.playerDmg !== r.baseDmg) {
    const parts: string[] = [];
    if (r.isCrit) parts.push("💥 critică ×2");
    if (r.usedEmpower) parts.push("🌑 abilitate");
    if (r.battleEventEmoji) parts.push(`${r.battleEventEmoji} eveniment`);
    txt += `🗡️ Daune normale: **${r.baseDmg}** → cu ${parts.length ? parts.join(" + ") : "bonusuri"}: **${r.playerDmg}**\n`;
  }
  txt += "\n";
  if (r.abilityFired && r.abilityDmg > 0) {
    txt += `⚡ **BOSSUL ÎȘI DEZLĂNȚUIE ABILITATEA!** Suferi **${r.abilityDmg} daune**!` +
      (r.abilityHeal > 0 ? ` Bossul îți absoarbe viața și se vindecă cu **+${r.abilityHeal} HP**!` : "") + "\n";
  }
  if (r.stormDrain > 0) txt += `🌪️ Furtuna de Fum îți arde **${r.stormDrain} HP**!\n`;
  if (r.hpRegen > 0) txt += `🩸 **Runa Sângelui pulsează!** Absorbi **+${r.hpRegen} HP** din rana creaturii.\n`;
  if (breakdown?.cristaHeal) txt += `🔮 **Crista Vieții strălucește!** Recuperezi **+${breakdown.cristaHeal} HP** după victorie.\n`;
  if (r.monsterDefeated) {
    const xpStr =
      breakdown && breakdown.baseXp !== r.xpGained
        ? `+${r.xpGained} XP *(normal ${breakdown.baseXp})*`
        : `+${r.xpGained} XP`;
    const oboliStr =
      breakdown && breakdown.baseOboli !== r.oboliGained
        ? `+${r.oboliGained} Oboli *(normal ${breakdown.baseOboli})*`
        : `+${r.oboliGained} Oboli`;
    txt += `💀 **MONSTRUL A CĂZUT!** ${xpStr}, ${oboliStr}\n`;
    if (itemDrop) {
      txt += `${ITEMS[itemDrop].emoji} **${ITEMS[itemDrop].label}** a căzut din monstru!\n`;
    }
    if (!r.levelUp) {
      const meta = RARITY[r.newMonsterRarity] ?? RARITY.comun;
      const label = r.newMonsterRarity === "boss" ? "🔥 UN MINI-BOSS" : `${meta.emoji} Un monstru ${meta.label}`;
      txt += `👁️ ${label} se ridică… **Nivel ${r.newMonsterLevel}**`;
    }
  } else if (r.monsterHit) {
    if (r.playerDodged) txt += "🌀 **AI EVITAT ATACUL!** Umbrele te-au ferit.";
    else txt += `💀 **MONSTRUL RIPOSTEAZĂ!**\nCreatura îți aplică **${r.monsterDmg} daune**.\nUmbrele îți apasă umerii, iar sângele îți pulsează în tâmple.`;
  } else {
    txt += "💨 Monstrul a ratat atacul!";
  }
  return txt;
}

/** "🎒 Pradă adunată: ..." line for the event summary (empty string when nothing was farmed). */
export function formatItemsFarmed(items?: Record<string, number> | null): string {
  if (!items) return "";
  const parts = Object.entries(items)
    .filter(([k, qty]) => qty > 0 && isItemKey(k))
    .map(([k, qty]) => `${ITEMS[k as ItemKey].emoji} **${qty}× ${ITEMS[k as ItemKey].label}**`);
  return parts.length ? `🎒 Pradă adunată: ${parts.join(" · ")}\n` : "";
}

function formatEventReward(emoji: string, label: string, final: number, base: number): string {
  if (final <= 0) return "";
  if (final !== base && base > 0) {
    return `${emoji} **${final.toLocaleString()} ${label}** *(baza: ${base.toLocaleString()})*\n`;
  }
  return `${emoji} **${final.toLocaleString()} ${label}**\n`;
}

export function buildDeathEmbed(opts: {
  lostOboli?: number;
  totalDamage?: number;
  oboli?: number;
  xp?: number;
  baseOboli?: number;
  baseXp?: number;
  itemsFarmed?: Record<string, number> | null;
} = {}): EmbedBuilder {
  const { lostOboli = 0, totalDamage = 0, oboli = 0, xp = 0, baseOboli = 0, baseXp = 0, itemsFarmed } = opts;
  const oboliLine = formatEventReward("🪙", "Oboli", oboli, baseOboli);
  const xpLine = formatEventReward("⭐", "XP", xp, baseXp);
  const itemsLine = formatItemsFarmed(itemsFarmed);
  const summary = totalDamage > 0 || oboli > 0 || xp > 0 || itemsLine
    ? `\n${sectionTitle("Rezumat Eveniment")}\n⚔️ Daune totale: **${totalDamage.toLocaleString()}**\n${oboliLine}${xpLine}${itemsLine}\n`
    : "";
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("💀  AI CĂZUT ÎN UMBRE 💀")
    .setDescription(
      "Umbrele te-au revendicat, iar cenușa îți acoperă pașii.\n" +
      "Nu mai poți continua acest eveniment.\n\n" +
      (lostOboli > 0 ? `🪙 Ai pierdut **${lostOboli} Oboli** (20% din ce ai strâns în eveniment).\n\n` : "") +
      summary +
      "Trupul tău pământesc a cedat,\n" +
      "dar numele tău va rămâne scris în cronica celor căzuți.\n\n" +
      "Magazinul rămâne deschis — folosește **/magazin** ca să te întărești pentru următoarea chemare.",
    )
    .setImage(IMG.death);
}

export function buildProfileEmbed(player: Player, title?: string, avatarUrl?: string | null, items: PlayerItem[] = []): EmbedBuilder {
  const cls = player.class && isClassKey(player.class) ? CLASSES[player.class] : null;
  const rank = levelTitle(player.maxLevel);

  const classValue = cls ? `${cls.emoji} **${cls.label}**` : "*Fără clasă* — `/clasa`";
  const compValue = player.companion && isCompanionKey(player.companion)
    ? `${COMPANIONS[player.companion].emoji} **${isCompanionEvolved(player.companionLevel) ? COMPANIONS[player.companion].evoLabel : COMPANIONS[player.companion].label}** Nv.${player.companionLevel}${isCompanionEvolved(player.companionLevel) ? " ✨" : ""}`
    : "*Fără companion* — `/magazin`";
  const abilValue = (player.abilityEmpowerLevel >= 1 || player.abilityShieldLevel >= 1)
    ? [
        player.abilityEmpowerLevel >= 1 ? `${ABILITIES.empower.emoji} ${ABILITIES.empower.label} Nv.${player.abilityEmpowerLevel} (${abilityEffectiveDesc("empower", player.abilityEmpowerLevel)})` : null,
        player.abilityShieldLevel >= 1 ? `${ABILITIES.shield.emoji} ${ABILITIES.shield.label} Nv.${player.abilityShieldLevel} (${abilityEffectiveDesc("shield", player.abilityShieldLevel)})` : null,
      ].filter(Boolean).join("\n")
    : "*Fără abilități* — `/magazin`";

  const equippedTalismanKey = player.talisman && isTalismanKey(player.talisman) ? player.talisman : null;
  const talismanValue = equippedTalismanKey
    ? `${TALISMANS[equippedTalismanKey].emoji} **${TALISMANS[equippedTalismanKey].label}** Nv.${player.talismanLevel ?? 1}\n↳ ${TALISMANS[equippedTalismanKey].passiveLabel}: ${talismanDesc(equippedTalismanKey, player.talismanLevel ?? 1)}`
    : "*Fără talisman* — `/magazin`";

  const deathInfo = player.deaths > 0
    ? `${player.deaths}× (ultima: Nivel ${player.deathLevel})`
    : "Neînvins";
  const retreatInfo = player.retreats > 0
    ? `${player.retreats}× (ultima: Nivel ${player.retreatLevel})`
    : "Niciodată";

  const totalKeys = player.keyRar + player.keyEpic + player.keyRegal;
  const keysValue = totalKeys > 0
    ? `${KEY_EMOJI["rar"]} **${player.keyRar}** ${KEY_LABEL["rar"]}   ·   ${KEY_EMOJI["epic"]} **${player.keyEpic}** ${KEY_LABEL["epic"]}   ·   ${KEY_EMOJI["regal"]} **${player.keyRegal}** ${KEY_LABEL["regal"]}`
    : "*Niciun trofeu sub formă de cheie încă — caută cuferele de chei!*";

  const prestigeValue = player.prestigeLevel > 0
    ? `⭐ **Nivel ${player.prestigeLevel}**\n⚔️ +${player.prestigeAttackBonus} · 🛡️ +${player.prestigeDefenseBonus} · 🌀 +${player.prestigeDodgeBonus}% · 💥 +${player.prestigeCritBonus}% · ❤️ +${player.prestigeHpBonus} · 🪙 +${player.prestigeLevel * PRESTIGE_GOLD_BONUS}%`
    : "*Fără prestigiu* — `/magazin → Prestigiu`";

  const hasShopUpgrades = player.shopAttackCount > 0 || player.shopDefenseCount > 0 || player.shopDodgeCount > 0 || player.shopCritCount > 0 || player.shopHpCount > 0;
  const shopStatsValue = hasShopUpgrades
    ? `⚔️ +${player.attackBonus} daune (${player.shopAttackCount}×) · 🛡️ -${player.defenseBonus} daune primite (${player.shopDefenseCount}×)\n` +
      `🌀 ${player.dodgeBonus}% evitare (${player.shopDodgeCount}×) · 💥 ${player.critBonus}% critic (${player.shopCritCount}×) · ❤️ +${player.maxHpBonus} HP (${player.shopHpCount}×)`
    : "*Fără upgrade-uri de putere* — `/magazin → Puteri`";

  const visibleItems = items.filter((i) => i.quantity > 0);
  const inventoryValue = visibleItems.length > 0
    ? visibleItems.map((i) => `${isItemKey(i.itemKey) ? ITEMS[i.itemKey].emoji : "❓"} **×${i.quantity}** ${isItemKey(i.itemKey) ? ITEMS[i.itemKey].label : i.itemKey}`).join("  ·  ")
    : "*Inventar gol — ucide monștri pentru iteme!*";

  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle(title ?? `📜 Profilul lui ${player.username}`)
    .setDescription(
      `🎖️ **${rank}** *(Nivel max: ${player.maxLevel})*` +
      (player.honorTitle ? `\n👑 **${player.honorTitle}**` : "") +
      (player.discordId === SUPER_ADMIN_ID ? "\n🧙‍♂️ **Fondatorul Regatului Cenușii**" : ""),
    )
    .addFields(
      { name: "🧬 Clasă", value: classValue, inline: true },
      { name: "🐾 Companion", value: compValue, inline: true },
      { name: "🔮 Talisman", value: talismanValue, inline: true },
      { name: "🎯 Abilități", value: abilValue, inline: false },
      { name: "━━━ Prestigiu ━━━", value: prestigeValue, inline: false },
      { name: "━━━ Puteri din Magazin ━━━", value: shopStatsValue, inline: false },
      { name: "━━━ Resurse ━━━", value: `⭐ **${player.xp}** XP   ·   🪙 **${player.gold}** Oboli   ·   🏅 **${player.reputation}** Reputație`, inline: false },
      { name: "━━━ Chei ━━━", value: keysValue, inline: false },
      { name: "━━━ Inventar ━━━", value: inventoryValue, inline: false },
      { name: "━━━ Istoric de luptă ━━━", value: `💀 Morți: **${deathInfo}**\n🏳️ Retrageri: **${retreatInfo}**`, inline: false },
    )
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
  const effects = formatActiveEffects(player.discordId);
  if (effects) embed.addFields({ name: "━━━ Binecuvântări & Blesteme ━━━", value: effects, inline: false });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

export interface ChestRarity {
  key: string;
  label: string;
  emoji: string;
  color: number;
  min: number;
  max: number;
  weight: number;
}

export const CHEST_RARITIES: ChestRarity[] = [
  { key: "bronz",  label: "Cufăr de Bronz",  emoji: "🪙",  color: 0xcd7f32, min: 10,  max: 40,  weight: 58 },
  { key: "argint", label: "Cufăr de Argint", emoji: "🥈",  color: 0xc0c0c0, min: 40,  max: 90,  weight: 28 },
  { key: "aur",    label: "Cufăr de Aur",    emoji: "🥇",  color: 0xffd700, min: 90,  max: 180, weight: 11 },
  { key: "mitic",  label: "Cufăr Mitic",     emoji: "💎",  color: 0xb026ff, min: 180, max: 350, weight: 3  },
  { key: "regal",  label: "Cufărul Regal",   emoji: "👑",  color: 0x1a3a8c, min: 600, max: 1500, weight: 0 },
];

// ─── Key chain system ─────────────────────────────────────────────────────────
// Which key type does each chest rarity drop (and at what chance)?
export const KEY_DROP: Record<string, { keyType: string; chance: number } | null> = {
  bronz:  { keyType: "rar",   chance: 0.40 },
  argint: { keyType: "epic",  chance: 0.30 },
  aur:    { keyType: "regal", chance: 0.20 },
  mitic:  { keyType: "regal", chance: 0.12 },
  regal:  null,
};

// Which key type is required to open a locked chest of each rarity?
export const CHEST_KEY_REQUIRED: Record<string, string> = {
  argint: "rar",
  aur:    "epic",
  regal:  "regal",
};

export const KEY_LABEL: Record<string, string> = {
  rar:   "Cheie de Rar",
  epic:  "Cheie de Epic",
  regal: "Cheie Regală",
};

// Human-readable name for the source chest that drops each key
export const KEY_SOURCE_LABEL: Record<string, string> = {
  rar:   "cufere de Bronz",
  epic:  "cufere de Argint",
  regal: "cufere de Aur sau Mitic",
};

// Target locked chest name for each key type
export const KEY_TARGET_LABEL: Record<string, string> = {
  rar:   "Cufăr Blocat de Argint",
  epic:  "Cufăr Blocat de Aur",
  regal: "Cufărul Regal",
};

// Accent emoji per key type (used in messages + profile)
export const KEY_EMOJI: Record<string, string> = {
  rar:   "🗝️",
  epic:  "🔑",
  regal: "⚜️",
};

// Color per key type (silver / gold / royal blue)
export const KEY_COLOR: Record<string, number> = {
  rar:   0xc0c0c0,
  epic:  0xffd700,
  regal: 0x1a3a8c,
};

// ─── Dedicated key chests ───────────────────────────────────────────────────
// Standalone chests whose reward IS a key (separate from the gold chests).
// Lower tiers are common, the Regal key is a rare prize.
export const KEY_CHEST_WEIGHTS: Array<{ keyType: string; weight: number }> = [
  { keyType: "rar",   weight: 60 },
  { keyType: "epic",  weight: 30 },
  { keyType: "regal", weight: 10 },
];

/** Pick a key type for a random key-chest spawn (weighted toward lower tiers). */
export function rollKeyChestType(): string {
  const total = KEY_CHEST_WEIGHTS.reduce((s, k) => s + k.weight, 0);
  let roll = Math.random() * total;
  for (const k of KEY_CHEST_WEIGHTS) {
    if (roll < k.weight) return k.keyType;
    roll -= k.weight;
  }
  return "rar";
}

// ─── Locked-chest jackpot economy ───────────────────────────────────────────
// Locked chests cost a key to open, so they pay much MORE Oboli than the
// matching free chest — the Regal one is a true jackpot.
export const LOCKED_CHEST_GOLD: Record<string, { min: number; max: number }> = {
  argint: { min: 150,  max: 350  },
  aur:    { min: 400,  max: 800  },
  regal:  { min: 2000, max: 5000 },
};

/** Roll the Oboli payout for a locked chest of a given rarity (boosted ranges). */
export function spawnLockedChest(rarityKey: string): { rarity: ChestRarity; gold: number } | null {
  const rarity = CHEST_RARITIES.find((r) => r.key === rarityKey);
  if (!rarity) return null;
  const range = LOCKED_CHEST_GOLD[rarityKey] ?? { min: rarity.min * 2, max: rarity.max * 2 };
  const gold = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  return { rarity, gold };
}

// ─── Event key drops ────────────────────────────────────────────────────────
// During events, fighters can randomly find keys. Each gets a chance to drop
// a single weighted key.
const EVENT_KEY_DROP_CHANCE = 0.35;

/** Roll key drops for a set of event participants → map of who found which key. */
export function rollEventKeyDrops(discordIds: string[]): Map<string, string> {
  const drops = new Map<string, string>();
  for (const id of discordIds) {
    if (Math.random() < EVENT_KEY_DROP_CHANCE) {
      drops.set(id, rollKeyChestType());
    }
  }
  return drops;
}

export function rollChest(): { rarity: ChestRarity; gold: number } {
  const total = CHEST_RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  let rarity = CHEST_RARITIES[0]!;
  for (const r of CHEST_RARITIES) {
    if (roll < r.weight) { rarity = r; break; }
    roll -= r.weight;
  }
  const gold = Math.floor(Math.random() * (rarity.max - rarity.min + 1)) + rarity.min;
  return { rarity, gold };
}

/** Spawn a chest of a specific rarity (admin override). */
export function spawnChest(rarityKey: string): { rarity: ChestRarity; gold: number } | null {
  const rarity = CHEST_RARITIES.find((r) => r.key === rarityKey);
  if (!rarity) return null;
  const gold = Math.floor(Math.random() * (rarity.max - rarity.min + 1)) + rarity.min;
  return { rarity, gold };
}

export function buildChestEmbed(gold: number, rarity?: ChestRarity, forcedMult?: 2 | 3): EmbedBuilder {
  const r = rarity ?? CHEST_RARITIES[0]!;
  const image = CHEST_IMG[r.key] ?? IMG.chest;
  const bonusLine = forcedMult != null
    ? `\n🔮 **Cufăr binecuvântat — ×${forcedMult} Oboli garantat!** Câștigă **${gold * forcedMult}** Oboli!`
    : `\n🎲 **Norocul Cenușii:** la deschidere Obolii pot fi înmulțiți **×1, ×2 sau ×3** — nimeni nu știe până nu apeși!`;
  const keyDrop = KEY_DROP[r.key];
  const keyHintLine = keyDrop
    ? `\n🗝️ *Poate ascunde o ${KEY_LABEL[keyDrop.keyType]}...*`
    : "";
  const effectHintLine = "\n🔮 *Se zvonește că unele cufere ascund o **binecuvântare**… sau un **blestem**!*";
  return new EmbedBuilder()
    .setColor(r.color)
    .setTitle(`${r.emoji}✨  ${r.label.toUpperCase()} A APĂRUT ÎN REGAT!  ✨${r.emoji}`)
    .setDescription(
      "Cenușa s-a ridicat și a dezvăluit un cufăr misterios!\n" +
      "Obolii zac în el, așteptând mâna celui mai rapid.\n\n" +
      `💰 **${gold} Oboli** pentru primul care revendică!${bonusLine}${keyHintLine}${effectHintLine}\n\n` +
      "⚡ Fii primul — cufărul dispare în fumul umbrelor!",
    )
    .setImage(image)
    .setFooter({ text: "Primul click câștigă!" });
}

/**
 * Surprise reward multiplier rolled at claim time, not at spawn. Most chests
 * give ×1 (no bonus); ×2 is uncommon and ×3 is rare — the gamble at open is
 * the whole point. Used only when the chest has no admin-forced multiplier.
 */
export function rollChestMultiplier(): 1 | 2 | 3 {
  const roll = Math.random();
  if (roll < 0.08) return 3; // 8%
  if (roll < 0.30) return 2; // 22%
  return 1; // 70%
}

export function buildExpiredChestEmbed(gold: number, rarity?: ChestRarity, forcedMult?: 2 | 3): EmbedBuilder {
  const r = rarity ?? CHEST_RARITIES[0]!;
  const image = CHEST_IMG[r.key] ?? IMG.chest;
  if (forcedMult != null) {
    return new EmbedBuilder()
      .setColor(0x555555)
      .setTitle(`💨  ${r.label.toUpperCase()} — NERECLAMAT  💨`)
      .setDescription(
        `Cufărul binecuvântat a dispărut nereclamat în fumul umbrelor.\n\n` +
        `💰 ~~${gold} Oboli~~\n` +
        `🔮 ~~Cufăr binecuvântat — ×${forcedMult} Oboli~~ *(bonus pierdut)*\n\n` +
        `*Nimeni nu a fost destul de rapid de data aceasta…*`,
      )
      .setImage(image)
      .setFooter({ text: "Cufărul a dispărut." });
  }
  return new EmbedBuilder()
    .setColor(0x555555)
    .setTitle(`💨  ${r.label.toUpperCase()} — DISPĂRUT  💨`)
    .setDescription(
      `Cufărul a dispărut în fumul umbrelor, nereclamat.\n\n` +
      `💰 ~~${gold} Oboli~~\n\n` +
      `*Nimeni nu a fost destul de rapid de data aceasta…*`,
    )
    .setImage(image)
    .setFooter({ text: "Cufărul a dispărut." });
}

export function buildLockedChestEmbed(rarityKey: string, gold: number): EmbedBuilder {
  const rarity = CHEST_RARITIES.find((r) => r.key === rarityKey) ?? CHEST_RARITIES[0]!;
  const keyType = CHEST_KEY_REQUIRED[rarityKey] ?? "rar";
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const sourceLabel = KEY_SOURCE_LABEL[keyType] ?? "cufere comune";
  const chestImage = CHEST_IMG[rarityKey] ?? IMG.chest;
  const keyImage = KEY_IMG[keyType];

  const keyEmoji = KEY_EMOJI[keyType] ?? "🗝️";
  const isRegal = rarityKey === "regal";
  const jackpotLine = isRegal
    ? "\n\n👑 *Comoara coroanei — cea mai bogată pradă din tot Regatul!*"
    : "";
  const blessingLine = isRegal
    ? "\n✨ **Binecuvântare garantată** la deschidere — fără blesteme!"
    : "\n✨ *Poate ascunde o **binecuvântare** — cuferele blocate nu blestemă niciodată!*";

  return new EmbedBuilder()
    .setColor(rarity.color)
    .setTitle(`🔒 ${rarity.emoji}  ${rarity.label.toUpperCase()} — BLOCAT  ${rarity.emoji} 🔒`)
    .setDescription(
      `*O forță veche ține cufărul ferecat. Doar ${keyEmoji} **${keyLabel}** îl poate deschide.*\n` +
      `${sectionTitle("Pradă")}\n` +
      `💰 **${gold.toLocaleString()} Oboli** ascunși înăuntru — mult peste un cufăr obișnuit!\n` +
      blessingLine + "\n" +
      `${sectionTitle("Cheia")}\n` +
      `${keyEmoji} Necesită: **${keyLabel}**\n` +
      `📜 O găsești în **cufere de chei** sau revendicând **${sourceLabel}**` +
      jackpotLine +
      `\n\n⚡ Un singur jucător poate folosi cheia — fii primul!`,
    )
    .setThumbnail(keyImage)
    .setImage(chestImage)
    .setFooter({ text: "Cufăr blocat — expiră în 10 minute" });
}

/** Embed for a dedicated key chest — the prize is a key, not Oboli. */
export function buildKeyChestEmbed(keyType: string): EmbedBuilder {
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const keyEmoji = KEY_EMOJI[keyType] ?? "🗝️";
  const targetLabel = KEY_TARGET_LABEL[keyType] ?? "cufăr blocat";
  const keyImage = KEY_IMG[keyType];
  const color = KEY_COLOR[keyType] ?? 0xc0c0c0;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${keyEmoji}✨  CUFĂR DE CHEI A APĂRUT!  ✨${keyEmoji}`)
    .setDescription(
      "Cenușa s-a despicat și a scos la iveală un cufăr ce nu ascunde Oboli, ci o **cheie prețioasă**!\n" +
      `${sectionTitle("Răsplata")}\n` +
      `${keyEmoji} O **${keyLabel}** pentru primul care revendică!\n` +
      `🔓 Deschide cu ea un **${targetLabel}** și ia comoara dinăuntru.\n\n` +
      "⚡ Fii primul — cheia se topește în fumul umbrelor!",
    )
    .setImage(keyImage)
    .setFooter({ text: "Primul click ia cheia!" });
}

/** Message shown when a player claims a key chest. */
export function buildKeyChestClaimMessage(username: string, keyType: string): string {
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const keyEmoji = KEY_EMOJI[keyType] ?? "🗝️";
  const targetLabel = KEY_TARGET_LABEL[keyType] ?? "cufăr blocat";
  return (
    `${keyEmoji} **${username}** a revendicat **${keyLabel}**!\n` +
    `Păstreaz-o pentru a deschide un **${targetLabel}**.`
  );
}

export function buildKeyDropMessage(fromRarityKey: string, keyType: string): string {
  const rarity = CHEST_RARITIES.find((r) => r.key === fromRarityKey);
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie Misterioasă";
  const targetLabel = KEY_TARGET_LABEL[keyType] ?? "cufăr blocat";
  const emoji = rarity?.emoji ?? "📦";
  return (
    `🗝️ **${emoji} ${rarity?.label ?? fromRarityKey}** a dezvăluit o **${keyLabel}**!\n` +
    `Folosește-o pentru a deschide un **${targetLabel}**!`
  );
}

export type ShopCategory = "overview" | "stats" | "comp" | "abil" | "prestige" | "class" | "talisman";

const SHOP_BALANCE = (p: Player) => {
  const prestigeLine = p.prestigeLevel > 0 ? `   ·   ⭐ Prestigiu **${p.prestigeLevel}**` : "";
  return `🪙 **Oboli: ${p.gold}**   ·   ⭐ **XP: ${p.xp}**${prestigeLine}`;
};

// Five permanent stat upgrades — shows current bonus → value after purchase,
// with the price in bold so the cost is unmistakable.
export const STAT_BAR_MAX = 20;
export const STAT_RANK_MAX = 100;

/** Purely visual rank system: every STAT_BAR_MAX purchases = +1 rank (cap 100).
 *  Nothing is reset — the purchase count and all bonuses keep accumulating;
 *  the bar simply shows progress inside the current rank. */
export function statRankInfo(count: number): { rank: number; inRank: number } {
  const rank = Math.min(STAT_RANK_MAX, Math.floor(count / STAT_BAR_MAX));
  const inRank = rank >= STAT_RANK_MAX ? STAT_BAR_MAX : count % STAT_BAR_MAX;
  return { rank, inRank };
}

/** Rank-style bar line for uncapped upgrade levels (companion, abilities, prestige). */
function rankBarLine(level: number): string {
  const { rank, inRank } = statRankInfo(level);
  const bar = buildProgressBar(inRank, STAT_BAR_MAX, 10);
  return rank > 0 ? `${bar} 🏅 **Rank ${rank}**` : bar;
}

function shopStatsText(p: Player): string {
  const line = (key: ShopKey, emoji: string, label: string, now: string, next: string) => {
    const count = p[SHOP_COUNT_KEY[key]] as number;
    const price = shopPrice(key, count);
    const { rank, inRank } = statRankInfo(count);
    const bar = buildProgressBar(inRank, STAT_BAR_MAX, 10);
    const rankStr = rank > 0 ? ` · 🏅 **Rank ${rank}**` : "";
    return `${emoji} **${label}** (Nv.${inRank}/${STAT_BAR_MAX})${rankStr} — **${price} Oboli**\n${bar}\n   ↳ acum ${now} → ${next}\n`;
  };
  return (
    line("atac", "⚔️", "Atac", `+${p.attackBonus} daune`, `+${p.attackBonus + 2} daune`) +
    line("def", "🛡️", "Apărare", `-${p.defenseBonus} daune primite`, `-${p.defenseBonus + 2} daune primite`) +
    line("dodge", "🌀", "Evitare", `${p.dodgeBonus}%`, `${p.dodgeBonus + 3}%`) +
    line("crit", "💥", "Critic", `${p.critBonus}%`, `${p.critBonus + 2}%`) +
    line("hp", "❤️", "HP maxim", `+${p.maxHpBonus} HP`, `+${p.maxHpBonus + 10} HP`)
  );
}

function shopCompText(p: Player): string {
  if (p.companion && isCompanionKey(p.companion)) {
    const c = COMPANIONS[p.companion];
    const evolved = isCompanionEvolved(p.companionLevel);
    const cost = upgradeCost(p.companionLevel);
    return (
      `${c.emoji} **${evolved ? c.evoLabel : c.label}** Nv.${p.companionLevel}${evolved ? " ✨" : ""}\n` +
      `${rankBarLine(p.companionLevel)}\n` +
      `🎁 Bonus activ: **${companionEffectiveDesc(p.companion, p.companionLevel)}**\n\n` +
      `🔼 **Îmbunătățire Nv.${p.companionLevel} → ${p.companionLevel + 1}**\n` +
      `   ↳ bonus nou: **${companionEffectiveDesc(p.companion, p.companionLevel + 1)}**\n` +
      `   ↳ cost: **${cost} Oboli + ${UPGRADE_XP_COST} XP**\n` +
      (evolved ? "" : `   ↳ evoluează la Nv.${COMPANION_EVOLVE_LEVEL} în forma legendară\n`)
    );
  }
  return (
    `🛒 Cumpără un companion (**${COMPANION_BUY_COST} Oboli**):\n\n` +
    Object.values(COMPANIONS).map((c) => `${c.emoji} **${c.label}** — ${c.desc}`).join("\n") +
    `\n\n✨ La Nv.${COMPANION_EVOLVE_LEVEL} companionul evoluează în forma legendară.`
  );
}

function shopAbilText(p: Player): string {
  const line = (kind: AbilityKey) => {
    const lvl = kind === "empower" ? p.abilityEmpowerLevel : p.abilityShieldLevel;
    const a = ABILITIES[kind];
    if (lvl >= 1) {
      const cost = upgradeCost(lvl);
      return (
        `${a.emoji} **${a.label}** Nv.${lvl}\n` +
        `${rankBarLine(lvl)}\n` +
        `   🎁 Bonus activ: **${abilityEffectiveDesc(kind, lvl)}**\n` +
        `   🔼 Îmbunătățire → Nv.${lvl + 1}: **${abilityEffectiveDesc(kind, lvl + 1)}**\n` +
        `   ↳ cost: **${cost} Oboli + ${UPGRADE_XP_COST} XP**\n`
      );
    }
    return (
      `${a.emoji} 🔒 **${a.label}**\n` +
      `   ↳ ${a.desc}\n` +
      `   ↳ la Nv.1: **${abilityEffectiveDesc(kind, 1)}**\n` +
      `   🛒 Deblochează: **${ABILITY_BUY_COST} Oboli**\n`
    );
  };
  return line("empower") + "\n" + line("shield");
}

// Category-aware shop: each sub-page renders ONLY its own category so the embed
// matches the buttons shown below it. Prices are always bold for clarity.
export function buildShopEmbed(p: Player, category: ShopCategory = "overview"): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setFooter({ text: BRAND_FOOTER })
    .setThumbnail(IMG.shop);

  if (category === "stats") {
    return embed
      .setTitle("⚔️ Forja Cenușii — Puteri")
      .setDescription(
        SHOP_BALANCE(p) + "\n\n" +
        sectionTitle("Statistici permanente") + "\n" +
        "*Efect imediat, chiar și în lupta curentă.*\n\n" +
        shopStatsText(p) +
        "\n*Prețul fiecărei puteri crește cu 35% după fiecare cumpărare.*",
      );
  }

  if (category === "comp") {
    return embed
      .setTitle("🐾 Forja Cenușii — Companion")
      .setDescription(
        SHOP_BALANCE(p) + "\n\n" +
        sectionTitle("Companionul tău") + "\n" +
        shopCompText(p) +
        "\n*Companionul nou se aplică din următoarea Ora Umbrelor.*" +
        (p.companion && isCompanionKey(p.companion)
          ? "\n🔄 *Poți elibera companionul cu butonul de mai jos — nivelul lui se pierde.*"
          : ""),
      );
  }

  if (category === "abil") {
    return embed
      .setTitle("🎯 Forja Cenușii — Abilități")
      .setDescription(
        SHOP_BALANCE(p) + "\n\n" +
        sectionTitle("Abilități de luptă") + "\n" +
        shopAbilText(p) +
        "\n*Abilitățile se aplică imediat, chiar în lupta curentă.*",
      );
  }

  if (category === "class") {
    const clsKey = p.class && isClassKey(p.class) ? p.class : null;
    if (clsKey) {
      const cls = CLASSES[clsKey];
      const level = Math.min(p.classLevel ?? 1, 10);
      const stats = classStats(clsKey, level);
      const next = level < 10 ? classStats(clsKey, level + 1) : null;
      const statLine = (s: { attack: number; hp: number; dodge: number; crit: number }) =>
        [
          s.attack > 0 ? `⚔️ +${s.attack} daune` : "",
          s.hp > 0 ? `❤️ +${s.hp} HP` : "",
          s.dodge > 0 ? `🌀 +${s.dodge}% evitare` : "",
          s.crit > 0 ? `💥 +${s.crit}% critic` : "",
          cls.xpMult !== 1 ? `📚 XP ×${cls.xpMult}` : "",
          cls.oboliMult !== 1 ? `💰 Oboli ×${cls.oboliMult}` : "",
        ].filter(Boolean).join(", ");
      const cost = level < 10 ? classUpgradeCost(level) : null;
      const costLines = cost
        ? `   ↳ cost: **${cost.gold} Oboli + ${cost.xp} XP**` +
          (cost.items.length
            ? "\n" + cost.items.map((req) => `   ↳ ${req.qty}× ${ITEMS[req.item].emoji} ${ITEMS[req.item].label}`).join("\n")
            : "")
        : "";
      return embed
        .setTitle("🧬 Forja Cenușii — Clasă")
        .setDescription(
          SHOP_BALANCE(p) + "\n\n" +
          sectionTitle("Calea ta") + "\n" +
          `${cls.emoji} **${cls.label}** (Nv.${level}/10)\n` +
          `${buildProgressBar(level, 10, 10)}\n` +
          `> *${cls.desc}*\n\n` +
          `🎁 Bonus activ: **${statLine(stats)}**\n` +
          (next
            ? `🔼 **La Nv.${level + 1} primești:** ${statLine(next)}\n${costLines}\n`
            : "⭐ **Nivel maxim atins!** Calea ta este desăvârșită.\n") +
          "\nBonusurile clasei se aplică automat la fiecare intrare în Ora Umbrelor.\n" +
          "🔄 *Poți renunța la calea ta cu butonul de mai jos — nivelul clasei se pierde.*",
        );
    }
    return embed
      .setTitle("🧬 Forja Cenușii — Clasă")
      .setDescription(
        SHOP_BALANCE(p) + "\n\n" +
        sectionTitle("Alege-ți calea") + "\n" +
        "⚠️ *Cântărește alegerea cu grijă — dacă renunți la clasă mai târziu, nivelul ei se pierde.*\n\n" +
        Object.values(CLASSES)
          .map((c) => `${c.emoji} **${c.label}**\n   ↳ ${c.desc}`)
          .join("\n") +
        "\n\n👇 Apasă butonul clasei dorite pentru a o alege.",
      );
  }

  if (category === "prestige") {
    const cost = prestigeCost(p.prestigeLevel);
    const total = prestigeTotalBonuses(p);
    const next = prestigeNextBonuses(p.prestigeLevel);
    return embed
      .setTitle("💎 Forja Cenușii — Prestigiu")
      .setDescription(
        SHOP_BALANCE(p) + "\n\n" +
        sectionTitle("Prestigiu Permanent") + "\n" +
        "Fiecare nivel de prestigiu consumă **XP** și oferă bonusuri permanente\n" +
        "care se aplică în **TOATE** luptele normale și în lupta cu Dragonul Stins.\n\n" +
        (p.prestigeLevel > 0
          ? `**🎯 Nivel Prestigiu: ${p.prestigeLevel}**\n${rankBarLine(p.prestigeLevel)}\n${total}\n\n`
          : "") +
        `**🔰 Următorul nivel (${p.prestigeLevel + 1}):**\n` +
        `   → ${next}\n` +
        `   → cost: **${cost.toLocaleString("ro-RO")} XP**\n\n` +
        "*Costul crește cu 50% la fiecare nivel de prestigiu.*",
      );
  }

  return embed
    .setThumbnail(null)
    .setImage(IMG.shop)
    .setTitle("🔥🏺 Forja Cenușii — Magazinul Regal")
    .setDescription(
      "În adâncul cetății, focul nu se stinge niciodată.\n" +
      "Aici puterea se cumpără cu Oboli de Cenușă.\n\n" +
      SHOP_BALANCE(p) + "\n\n" +
      sectionTitle("Alege o categorie") + "\n" +
      "⚔️ **Puteri** — statistici permanente (atac, apărare, evitare, critic, HP)\n" +
      "🐾 **Companion** — un aliat de luptă care crește odată cu tine\n" +
      "🎯 **Abilități** — puteri active folosite în luptă\n" +
      "🧬 **Clasă** — alege-ți calea și bonusul permanent\n" +
      "⭐ **Prestigiu** — sacrifică XP pentru putere nemuritoare\n" +
      "🔮 **Talismane** — echipamente cu pasive unice, evoluabile cu iteme rare\n\n" +
      "🗝️ *Caută cuferele de chei — cu ele deschizi cuferele blocate pline de Oboli.*\n\n" +
      "👇 Apasă un buton de mai jos pentru a deschide o categorie.",
    );
}

export function buildLevelupEmbed(newLevel: number, dropLine?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`✨  AI AVANSAT LA NIVELUL ${newLevel}  ✨`)
    .setDescription(
      "Cenușa se ridică în jurul tău, iar Umbrele îți recunosc puterea.\n" +
      "Regatul Cenușii îți oferă un dar pentru progresul tău.\n\n" +
      (dropLine ? `${dropLine}\n\n` : "") +
      "**Alege un bonus special:**\n\n" +
      "🔹 **+5 XP bonus** la fiecare monstru ucis\n" +
      "🔹 **+3% șansă de evitare**\n" +
      "🔹 **+2 daune** permanent\n" +
      "🔹 **+5 HP** permanent (și vindecare)\n" +
      "🔹 **+1% șansă critică**\n\n" +
      "Fiecare alegere îți schimbă destinul.\nUmbrele privesc… și judecă.",
    );
}

export function buildExpiredCronica(
  survivors: { username: string; monsterLevel: number }[],
  fallen: { username: string; monsterLevel: number }[],
  fled: { username: string; monsterLevel: number }[] = [],
): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];
  const top = survivors
    .sort((a, b) => b.monsterLevel - a.monsterLevel)
    .slice(0, 5)
    .map((p, i) => `${medals[i] ?? `**${i + 1}.**`} **${p.username}** — Nivel ${p.monsterLevel}`)
    .join("\n") || "*Nimeni nu a supraviețuit.*";

  const topFallen = fallen
    .sort((a, b) => b.monsterLevel - a.monsterLevel)
    .slice(0, 3)
    .map((p) => `💀 **${p.username}** — Căzut la Nivel ${p.monsterLevel}`)
    .join("\n") || "*Nimeni nu a căzut.*";

  const topFled = fled
    .sort((a, b) => b.monsterLevel - a.monsterLevel)
    .slice(0, 3)
    .map((p) => `🏳️ **${p.username}** — A abandonat și a fugit la Nivel ${p.monsterLevel}`)
    .join("\n");

  return new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle("🏆📜  CRONICA SUPRAVIEȚUITORILOR  📜🏆")
    .setDescription(
      "Evenimentul s-a încheiat.\nUmbrele se retrag, iar cenușa cade încet peste Regat.\n\n" +
      `**Eroii care au rezistat cel mai mult:**\n${top}\n\n` +
      `**Cei Căzuți în Umbre:**\n${topFallen}\n\n` +
      (topFled ? `**Cei care au abandonat și au fugit:**\n${topFled}\n\n` : "") +
      "Regatul Cenușii își amintește de fiecare pas,\nde fiecare lovitură și de fiecare cădere.\nUmbrele îți mulțumesc pentru luptă.",
    );
}

export function buildEventLeaderboard(
  participants: Array<{
    username: string;
    discordId: string;
    monsterLevel: number;
    monsterRarity: string;
    totalDamage: number;
    oboli: number;
    isAlive: boolean;
    fled: boolean;
    currentHp: number;
    maxHp: number;
  }>,
): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];

  const ranked = [...participants].sort((a, b) => {
    if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
    if (b.monsterLevel !== a.monsterLevel) return b.monsterLevel - a.monsterLevel;
    if (b.totalDamage !== a.totalDamage) return b.totalDamage - a.totalDamage;
    return b.oboli - a.oboli;
  });

  const lines = ranked.slice(0, 10).map((p, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    const rarityEmoji = RARITY[p.monsterRarity as Rarity]?.emoji ?? "👹";

    let status: string;
    if (!p.isAlive && p.fled) {
      status = "🏳️ A fugit";
    } else if (!p.isAlive) {
      status = "💀 Căzut";
    } else {
      status = `❤️ ${p.currentHp}/${p.maxHp} HP`;
    }

    return (
      `${medal} **${p.username}** — ${rarityEmoji} Niv.${p.monsterLevel} | ` +
      `⚔️ ${p.totalDamage.toLocaleString()} daune | 🪙 ${p.oboli} Oboli | ${status}`
    );
  });

  const survivorCount = participants.filter((p) => p.isAlive).length;
  const fallenCount = participants.filter((p) => !p.isAlive && !p.fled).length;
  const fledCount = participants.filter((p) => !p.isAlive && p.fled).length;

  return new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle("🏆 CLASAMENT EVENIMENT — Ora Umbrelor")
    .setDescription(
      `👤 **${participants.length}** participanți | ` +
      `❤️ **${survivorCount}** supraviețuitori | ` +
      `💀 **${fallenCount}** căzuți | ` +
      `🏳️ **${fledCount}** au fugit\n\n` +
      (lines.length > 0 ? lines.join("\n") : "_Niciun participant._"),
    )
    .setFooter({ text: "Clasament generat la finalul evenimentului." })
    .setTimestamp();
}

export function combatRow(eventId: number, p?: EventParticipant): ActionRowBuilder<ButtonBuilder> {
  const onCooldown = p?.abilityReadyAt ? p.abilityReadyAt.getTime() > Date.now() : false;
  const hasEmpower = (p?.empowerLevel ?? 0) >= 1;
  const hasShield = (p?.shieldLevel ?? 0) >= 1;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ora_attack_${eventId}`).setLabel("Atacă").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ora_ability_${eventId}_empower`).setLabel(hasEmpower ? "Lovitura Umbrei" : "🔒 Lovitura Umbrei").setEmoji("🌑").setStyle(ButtonStyle.Primary).setDisabled(onCooldown || !hasEmpower),
    new ButtonBuilder().setCustomId(`ora_ability_${eventId}_shield`).setLabel(hasShield ? "Scut de Cenușă" : "🔒 Scut de Cenușă").setEmoji("🛡️").setStyle(ButtonStyle.Primary).setDisabled(onCooldown || !hasShield),
    new ButtonBuilder().setCustomId(`ora_retreat_${eventId}`).setLabel("Retragere").setEmoji("🏳️").setStyle(ButtonStyle.Secondary),
  );
}

export function formatCooldown(readyAt: Date | null): string {
  if (!readyAt) return "gata";
  const ms = readyAt.getTime() - Date.now();
  if (ms <= 0) return "gata";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function buildRetreatEmbed(level: number, opts?: {
  totalDamage?: number;
  oboli?: number;
  xp?: number;
  baseOboli?: number;
  baseXp?: number;
  itemsFarmed?: Record<string, number> | null;
}): EmbedBuilder {
  const { totalDamage = 0, oboli = 0, xp = 0, baseOboli = 0, baseXp = 0, itemsFarmed } = opts ?? {};
  const oboliLine = formatEventReward("🪙", "Oboli", oboli, baseOboli);
  const xpLine = formatEventReward("⭐", "XP", xp, baseXp);
  const itemsLine = formatItemsFarmed(itemsFarmed);
  const summary = totalDamage > 0 || oboli > 0 || xp > 0 || itemsLine
    ? `\n${sectionTitle("Rezumat Eveniment")}\n⚔️ Daune totale: **${totalDamage.toLocaleString()}**\n${oboliLine}${xpLine}${itemsLine}\n`
    : "";
  return new EmbedBuilder()
    .setColor(0x555555)
    .setTitle("🏳️  TE-AI RETRAS DIN LUPTĂ 🏳️")
    .setDescription(
      "Ai întors spatele Umbrelor și ai fugit din fața monstrului.\n" +
      `Ai abandonat lupta la **Nivelul ${level}**.\n\n` +
      "🪙 Obolii strânși rămân ai tăi — fuga ți-a salvat câștigul.\n" +
      "Dar Regatul își amintește de cei care au fugit…\n\n" +
      summary +
      "Numele tău va purta pecetea celui care **a abandonat și a fugit**.\n" +
      "Folosește **/magazin** ca să te întărești pentru următoarea chemare.",
    );
}

export const SHOP_COUNT_KEY: Record<ShopKey, keyof Player> = {
  atac: "shopAttackCount",
  def: "shopDefenseCount",
  dodge: "shopDodgeCount",
  crit: "shopCritCount",
  hp: "shopHpCount",
};

// ─── Shop navigation ─────────────────────────────────────────────────────────

/** Main nav row — category buttons shown on the landing page. */
export function shopNavRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("shop_nav_stats").setLabel("Puteri").setEmoji("⚔️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_nav_comp").setLabel("Companion").setEmoji("🐾").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_nav_abil").setLabel("Abilități").setEmoji("🎯").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_nav_class").setLabel("Clasă").setEmoji("🧬").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_nav_prestige").setLabel("Prestigiu").setEmoji("⭐").setStyle(ButtonStyle.Secondary),
  );
}

/** Back button row — shown at the bottom of every sub-page. */
export function shopBackRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("shop_back").setLabel("← Înapoi").setStyle(ButtonStyle.Secondary),
  );
}

/** Second nav row — Talismane (kept separate because shopNavRow hits Discord's 5-button limit). */
export function shopNavRow2(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("shop_nav_talisman").setLabel("Talismane").setEmoji("🔮").setStyle(ButtonStyle.Secondary),
  );
}

/** Main page rows (both nav rows). */
export function shopRows(_p: Player): ActionRowBuilder<ButtonBuilder>[] {
  return [shopNavRow(), shopNavRow2()];
}

function prestigeCost(level: number): number {
  return Math.floor(10_000 * Math.pow(1.5, level));
}

/** Extra gold from monster kills and boss rewards, in % per prestige level. */
export const PRESTIGE_GOLD_BONUS = 5;

/** Gold multiplier from prestige (e.g. level 3 → ×1.15). */
export function prestigeGoldMult(prestigeLevel: number): number {
  return 1 + (Math.max(0, prestigeLevel) * PRESTIGE_GOLD_BONUS) / 100;
}

export function prestigeStartLevel(_prestigeLevel: number): number {
  return 1; // Prestige no longer raises the event start level; bonuses only
}

function prestigeNextBonuses(level: number): string {
  const next = level + 1;
  const mult = Math.pow(1.5, level - 1);
  const atk  = Math.round(5 * mult);
  const def  = Math.round(5 * mult);
  const dodge = Math.round(3 * mult);
  const crit  = Math.round(3 * mult);
  const hp    = Math.round(20 * mult);
  return `⚔️ +${atk} daune · 🛡️ +${def} apărare · 🌀 +${dodge}% evitare · 💥 +${crit}% critic · ❤️ +${hp} HP · 🪙 +${PRESTIGE_GOLD_BONUS}% Oboli`;
}

function prestigeTotalBonuses(p: Player): string {
  if (p.prestigeLevel <= 0) return "";
  return (
    `⚔️ +${p.prestigeAttackBonus} daune · 🛡️ +${p.prestigeDefenseBonus} apărare\n` +
    `🌀 +${p.prestigeDodgeBonus}% evitare · 💥 +${p.prestigeCritBonus}% critic · ❤️ +${p.prestigeHpBonus} HP\n` +
    `🪙 +${p.prestigeLevel * PRESTIGE_GOLD_BONUS}% Oboli din monștri și boss`
  );
}

/** Puteri (stat upgrades) sub-page rows. */
export function shopStatsRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  const mk = (key: ShopKey, emoji: string, label: string) => {
    const count = p[SHOP_COUNT_KEY[key]] as number;
    const price = shopPrice(key, count);
    return new ButtonBuilder()
      .setCustomId(`shop_buy_${key}`)
      .setLabel(`${label} (${price})`)
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(p.gold < price);
  };
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      mk("atac", "⚔️", "Atac"),
      mk("def", "🛡️", "Apărare"),
      mk("dodge", "🌀", "Evitare"),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      mk("crit", "💥", "Critic"),
      mk("hp", "❤️", "HP maxim"),
    ),
    shopBackRow(),
  ];
}

/** Companion sub-page rows (buy or upgrade). */
export function shopCompRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  if (p.companion && isCompanionKey(p.companion)) {
    const cost = upgradeCost(p.companionLevel);
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("shop_compup")
          .setLabel(`Îmbunătățire Nv.${p.companionLevel} → ${p.companionLevel + 1} (${cost} Oboli + ${UPGRADE_XP_COST} XP)`)
          .setEmoji(COMPANIONS[p.companion].emoji)
          .setStyle(ButtonStyle.Success)
          .setDisabled(p.gold < cost || p.xp < UPGRADE_XP_COST),
        new ButtonBuilder()
          .setCustomId("shop_compreset")
          .setLabel("Eliberează companionul")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Danger),
      ),
      shopBackRow(),
    ];
  }
  const keys = Object.keys(COMPANIONS) as CompanionKey[];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      keys.slice(0, 4).map((k) =>
        new ButtonBuilder()
          .setCustomId(`shop_compbuy_${k}`)
          .setLabel(`${COMPANIONS[k].label} (${COMPANION_BUY_COST})`)
          .setEmoji(COMPANIONS[k].emoji)
          .setStyle(ButtonStyle.Success)
          .setDisabled(p.gold < COMPANION_BUY_COST),
      ),
    ),
    shopBackRow(),
  ];
}

/** Abilități sub-page rows (buy or upgrade each ability). */
export function shopAbilRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  const abilBtn = (kind: AbilityKey) => {
    const lvl = kind === "empower" ? p.abilityEmpowerLevel : p.abilityShieldLevel;
    const a = ABILITIES[kind];
    if (lvl >= 1) {
      const cost = upgradeCost(lvl);
      return new ButtonBuilder()
        .setCustomId(`shop_abilup_${kind}`)
        .setLabel(`${a.label} Nv.${lvl} → ${lvl + 1} (${cost} + ${UPGRADE_XP_COST}XP)`)
        .setEmoji(a.emoji)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(p.gold < cost || p.xp < UPGRADE_XP_COST);
    }
    return new ButtonBuilder()
      .setCustomId(`shop_abilbuy_${kind}`)
      .setLabel(`🔒 ${a.label} — Deblochează (${ABILITY_BUY_COST} Oboli)`)
      .setEmoji(a.emoji)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(p.gold < ABILITY_BUY_COST);
  };
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(abilBtn("empower"), abilBtn("shield")),
    shopBackRow(),
  ];
}

/** Prestige sub-page rows. */
export function shopPrestigeRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  const cost = prestigeCost(p.prestigeLevel);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("shop_prestigebuy")
        .setLabel(`⭐ Prestigiu Nv.${p.prestigeLevel} → ${p.prestigeLevel + 1} (${cost.toLocaleString("ro-RO")} XP)`)
        .setEmoji("💎")
        .setStyle(ButtonStyle.Success)
        .setDisabled(p.xp < cost),
    ),
    shopBackRow(),
  ];
  return rows;
}

/** Class sub-page rows — pickers if unchosen, upgrade button once a class is set. */
export function shopClassRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  if (p.class && isClassKey(p.class)) {
    const level = p.classLevel ?? 1;
    const resetBtn = new ButtonBuilder()
      .setCustomId("shop_classreset")
      .setLabel("Renunță la clasă")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Danger);
    if (level >= 10) {
      return [new ActionRowBuilder<ButtonBuilder>().addComponents(resetBtn), shopBackRow()];
    }
    const rows: ActionRowBuilder<ButtonBuilder>[] = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("shop_classup")
          .setLabel(`\u2b06\ufe0f Upgrade Clas\u0103 Nv.${level} \u2192 ${level + 1}`)
          .setEmoji("💎")
          .setStyle(ButtonStyle.Success)
          .setDisabled(false),
        resetBtn,
      ),
      shopBackRow(),
    ];
    return rows;
  }
  const keys = Object.keys(CLASSES) as ClassKey[];
  const btn = (k: ClassKey) =>
    new ButtonBuilder()
      .setCustomId(`shop_class_${k}`)
      .setLabel(CLASSES[k].label)
      .setEmoji(CLASSES[k].emoji)
      .setStyle(ButtonStyle.Primary);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(keys.slice(0, 3).map(btn)),
    new ActionRowBuilder<ButtonBuilder>().addComponents(keys.slice(3).map(btn)),
    shopBackRow(),
  ];
}

/** Talisman sub-page embed. `savedLevels` maps talismanKey → saved level for owned talismans. */
export function buildTalismanPage(p: Player, items: PlayerItem[], savedLevels: Record<string, number> = {}): EmbedBuilder {
  const equippedKey = p.talisman && isTalismanKey(p.talisman) ? p.talisman : null;
  const equippedLevel = p.talismanLevel ?? 1;

  const talismanLines = (Object.keys(TALISMANS) as TalismanKey[]).map((key) => {
    const t = TALISMANS[key];
    const isEquipped = equippedKey === key;
    const savedLevel = savedLevels[key] ?? 0;
    const owned = isEquipped || savedLevel > 0;
    const level = isEquipped ? equippedLevel : Math.max(1, savedLevel);
    const levelTag = isEquipped
      ? ` ✅ **ECHIPAT** (Nv.${equippedLevel})`
      : savedLevel > 0
        ? ` 💾 deținut (Nv.${savedLevel})`
        : "";
    const priceTag = owned ? "*deținut*" : `**${t.price} Oboli**`;
    const upgradeInfo = isEquipped
      ? equippedLevel < TALISMAN_MAX_LEVEL
        ? (() => {
            const cost = talismanUpgradeCost(key, equippedLevel);
            return `\n   ↳ *Upgrade Nv.${equippedLevel + 1}*: ${cost.commonQty}× ${ITEMS[cost.common].emoji} ${ITEMS[cost.common].label} + ${cost.rareQty}× ${ITEMS[cost.rare].emoji} ${ITEMS[cost.rare].label}`;
          })()
        : `\n   ↳ ⭐ *Nivel maxim atins!*`
      : "";
    const barLine = owned
      ? `\n${buildProgressBar(Math.min(level, TALISMAN_MAX_LEVEL), TALISMAN_MAX_LEVEL, 10)} (Nv.${level}/${TALISMAN_MAX_LEVEL})`
      : "";
    return `${t.emoji} **${t.label}**${levelTag} — ${priceTag}${barLine}\n   ↳ ${t.passiveLabel}: ${talismanDesc(key, level)}${upgradeInfo}`;
  });

  const inventoryLine =
    items.filter((i) => i.quantity > 0).length > 0
      ? items
          .filter((i) => i.quantity > 0)
          .map((i) => `${isItemKey(i.itemKey) ? ITEMS[i.itemKey].emoji : "❓"} **×${i.quantity}** ${isItemKey(i.itemKey) ? ITEMS[i.itemKey].label : i.itemKey}`)
          .join("  ·  ")
      : "*Niciun item — ucide monștri și boși!*";

  return new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setFooter({ text: BRAND_FOOTER })
    .setThumbnail(IMG.shop)
    .setTitle("🔮 Forja Cenușii — Talismane")
    .setDescription(
      SHOP_BALANCE(p) +
      "\n\n" +
      sectionTitle("Talismane disponibile") +
      "\n" +
      "*Fiecare talisman oferă un pasiv unic (max Nv.5). Nivelul rămâne salvat când schimbi talismanul, iar cele deținute se echipează gratuit.*\n\n" +
      talismanLines.join("\n") +
      "\n\n" +
      sectionTitle("Inventarul tău de materiale") +
      "\n" +
      inventoryLine,
    );
}

/** Talisman sub-page action rows. `savedLevels` maps talismanKey → saved level for owned talismans. */
export function shopTalismanRows(p: Player, items: PlayerItem[], savedLevels: Record<string, number> = {}): ActionRowBuilder<ButtonBuilder>[] {
  const inv = Object.fromEntries(items.map((i) => [i.itemKey, i.quantity]));
  const equippedKey = p.talisman && isTalismanKey(p.talisman) ? p.talisman : null;
  const equippedLevel = p.talismanLevel ?? 1;
  const keys = Object.keys(TALISMANS) as TalismanKey[];

  const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    keys.map((key) => {
      const t = TALISMANS[key];
      const isEquipped = equippedKey === key;
      const savedLevel = savedLevels[key] ?? 0;
      const owned = isEquipped || savedLevel > 0;
      const label = isEquipped
        ? `✅ ${t.label}`
        : owned
          ? `${t.label} (Nv.${savedLevel})`
          : `${t.label} (${t.price})`;
      return new ButtonBuilder()
        .setCustomId(`shop_talisman_${key}`)
        .setLabel(label)
        .setEmoji(t.emoji)
        .setStyle(isEquipped ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(isEquipped || (!owned && p.gold < t.price));
    }),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [buyRow];

  if (equippedKey && equippedLevel < TALISMAN_MAX_LEVEL) {
    const cost = talismanUpgradeCost(equippedKey, equippedLevel);
    const hasItems =
      (inv[cost.common] ?? 0) >= cost.commonQty &&
      (inv[cost.rare] ?? 0) >= cost.rareQty;
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("shop_talisman_upgrade")
          .setLabel(`✨ Evoluează la Nv.${equippedLevel + 1} (${cost.commonQty}× ${ITEMS[cost.common].label} + ${cost.rareQty}× ${ITEMS[cost.rare].label})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(!hasItems),
      ),
    );
  }

  rows.push(shopBackRow());
  return rows;
}

export function levelupRows(eventId: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_xp`).setLabel("+5 XP/monstru").setEmoji("🔹").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_dodge`).setLabel("+3% Evitare").setEmoji("🔹").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_atac`).setLabel("+2 Daune").setEmoji("🔹").setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_hp`).setLabel("+5 HP").setEmoji("🔹").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_crit`).setLabel("+1% Critic").setEmoji("🔹").setStyle(ButtonStyle.Success),
    ),
  ];
}

// ─── Classes ─────────────────────────────────────────────────────────────────
export function buildClassEmbed(player: Player): EmbedBuilder {
  const classKey = player.class;
  if (classKey && isClassKey(classKey)) {
    const cls = CLASSES[classKey];
    const level = player.classLevel ?? 1;
    const stats = classStats(classKey, level);
    const next = level < 10 ? classStats(classKey, level + 1) : null;
      const cost = classUpgradeCost(level);

      const bonusLine = (label: string, val: number, nxt?: number | null) =>
        val > 0 || (nxt ?? 0) > 0
          ? `   · ${label}: **+${val}**${nxt && nxt > val ? ` → +${nxt}` : ""}`
          : "";

      const costLines = cost.items.length > 0
        ? cost.items.map((req) => `   · ${req.qty}× ${ITEMS[req.item].emoji} ${ITEMS[req.item].label}`).join("\n")
        : "";

      const upgradeBlock = level >= 10
        ? "⭐ **Nivel maxim atins!** Calea ta este desăvârșită."
        : `\n\n⬆️ **Upgrade la Nv.${level + 1}**\n` +
          `   · ${cost.gold} Oboli\n` +
          `   · ${cost.xp} XP${costLines ? "\n" + costLines : ""}`;

      const desc =
        `${cls.emoji} **${cls.label}** (Nv.${level})\n` +
        `> *${cls.desc}*\n\n` +
        bonusLine("⚔️ Daune", stats.attack, next?.attack) + "\n" +
        bonusLine("❤️ HP", stats.hp, next?.hp) + "\n" +
        bonusLine("🌀 Evitare", stats.dodge, next?.dodge) + "\n" +
        bonusLine("💥 Critic", stats.crit, next?.crit) + "\n" +
        (cls.xpMult !== 1 ? `   · 📚 XP ×${cls.xpMult}` : "") +
        (cls.oboliMult !== 1 ? `   · 💰 Oboli ×${cls.oboliMult}` : "") +
        `\n\n✅ Bonusurile căii tale se aplică automat. *(O poți reseta din **/magazin → Clasă**.)*` +
        upgradeBlock;

      return new EmbedBuilder()
        .setColor(0x6d28d9)
        .setTitle("🧀  CLASA TA ÎN REGATUL CENUȘII")
        .setDescription(desc)
        .setFooter({ text: BRAND_FOOTER });
  }
  return new EmbedBuilder()
    .setColor(0x6d28d9)
    .setTitle("🧬  ALEGE-ȚI CLASA")
    .setDescription(
      "Înainte de a intra în Umbre, alege-ți calea.\n" +
      "⚠️ **Dacă renunți mai târziu la clasă, nivelul ei se pierde!**\n\n" +
      Object.values(CLASSES).map((c) => `${c.emoji} **${c.label}** — ${c.desc}`).join("\n"),
    )
    .setFooter({ text: BRAND_FOOTER });
}

export function classRows(): ActionRowBuilder<ButtonBuilder>[] {
  const keys = Object.keys(CLASSES) as ClassKey[];
  const btn = (k: ClassKey) =>
    new ButtonBuilder().setCustomId(`class_pick_${k}`).setLabel(CLASSES[k].label).setEmoji(CLASSES[k].emoji).setStyle(ButtonStyle.Primary);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(keys.slice(0, 3).map(btn)),
    new ActionRowBuilder<ButtonBuilder>().addComponents(keys.slice(3).map(btn)),
  ];
}

// ─── Companions ──────────────────────────────────────────────────────────────
// Read-only status view. Companions are bought & upgraded from /magazin.
export function buildCompanionEmbed(player: Player): EmbedBuilder {
  if (player.companion && isCompanionKey(player.companion)) {
    const c = COMPANIONS[player.companion];
    const evolved = isCompanionEvolved(player.companionLevel);
    const img = COMPANION_IMG[player.companion];
    const embed = new EmbedBuilder()
      .setColor(0x2f8a4a)
      .setTitle("🐾  COMPANIONUL TĂU")
      .setDescription(
        `${c.emoji} **${evolved ? c.evoLabel : c.label}**${evolved ? "  ✨*(Evoluat)*" : ""}\n` +
        `*${c.lore}*\n\n` +
        `🏅 **Nivel ${player.companionLevel}**\n` +
        `🎁 **Bonus activ:** ${companionEffectiveDesc(player.companion, player.companionLevel)}\n` +
        `🔼 **La Nv.${player.companionLevel + 1}:** ${companionEffectiveDesc(player.companion, player.companionLevel + 1)} — îmbunătățire din **/magazin**\n\n` +
        (evolved
          ? "Companionul tău a evoluat la forma sa legendară!"
          : `🔓 Evoluează la **Nivel ${COMPANION_EVOLVE_LEVEL}** companion — fă îmbunătățire din **/magazin**.`),
      )
      .setFooter({ text: BRAND_FOOTER });
    const url = evolved ? img?.evo : img?.base;
    if (url) embed.setImage(url);
    return embed;
  }
  return new EmbedBuilder()
    .setColor(0x2f8a4a)
    .setTitle("🐾  COMPANIONI")
    .setDescription(
      "O creatură a Cenușii ți se poate alătura în luptă.\n" +
      `🛒 Cumpără un companion din **/magazin** (**${COMPANION_BUY_COST} Oboli**):\n\n` +
      Object.values(COMPANIONS).map((c) => `${c.emoji} **${c.label}** — ${c.desc}`).join("\n") +
      `\n\n✨ La **Nivel ${COMPANION_EVOLVE_LEVEL}** companionul evoluează în forma legendară.`,
    )
    .setFooter({ text: BRAND_FOOTER });
}

// ─── Oracle random messages ──────────────────────────────────────────────────
const ORACLE_LINES = [
  "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*„Nu toți cei care luptă vor supraviețui… dar toți vor fi amintiți.”*",
  "🕯️ *„Umbrele cresc… pregătește-te.”* 🕯️",
  "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*„Cenușa de azi este focul de mâine.”*",
  "🌑 *„Cei care fug trăiesc o clipă mai mult, dar mor uitați.”* 🌑",
  "🔮 *„Aud pași în Abis… ceva mare se trezește.”* 🔮",
  "🕯️ *„Forja nu doarme niciodată. Nici Umbrele.”* 🕯️",
];
export function oracleMessage(): string {
  return ORACLE_LINES[Math.floor(Math.random() * ORACLE_LINES.length)]!;
}

// ─── Final boss ──────────────────────────────────────────────────────────────
export type BossRarity = "comun" | "rar" | "epic" | "legendar";

export const BOSS_RARITY_DATA: Record<BossRarity, { label: string; emoji: string; color: number; hpMult: number }> = {
  comun:    { label: "Comun",    emoji: "⚪", color: 0x7f1d1d, hpMult: 1   },
  rar:      { label: "Rar",      emoji: "🔵", color: 0x1e3a8a, hpMult: 1.5 },
  epic:     { label: "Epic",     emoji: "🟣", color: 0x5b21b6, hpMult: 2.5 },
  legendar: { label: "Legendar", emoji: "🟠", color: 0xb45309, hpMult: 4   },
};

export function bossMaxHp(level: number, rarity: BossRarity): number {
  return Math.round(level * 2000 * BOSS_RARITY_DATA[rarity].hpMult);
}

export function buildHpBar(current: number, max: number, size = 12): string {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  let filled = Math.round(pct * size);
  if (current > 0 && filled === 0) filled = 1;
  const color = pct > 0.6 ? "🟩" : pct > 0.3 ? "🟨" : "🟥";
  return color.repeat(filled) + "⬛".repeat(size - filled);
}

export interface BossPlayerStats {
  atk: number;
  def: number;
  dodge: number;
  crit: number;
  maxHp: number;
}

export function buildFinalBossEmbed(
  level: number,
  rarity: BossRarity = "comun",
  currentHp?: number,
  maxHp?: number,
  damageBy?: Map<string, number>,
  playerNames?: Map<string, string>,
  playerHp?: Map<string, number>,
  playerStats?: Map<string, BossPlayerStats>,
  expiresAt?: number,
  charge = 0,
): EmbedBuilder {
  const rd = BOSS_RARITY_DATA[rarity];
  const defeated = currentHp !== undefined && currentHp <= 0;
  const bossIdentity = BOSSES[bossIndex(level)]!;

  // ── Header ──────────────────────────────────────────────────────────────────
  let desc = defeated
    ? "*Cenușa se ridică, iar tăcerea cuprinde câmpul de luptă.*\n\n"
    : "*Cerul Regatului se întunecă, iar cenușa se ridică în vârtejuri.*\n**Ultima încercare a Regatului a sosit.**\n\n";

  if (!defeated) {
    desc += `👁️ **${bossIdentity.name}** — *${bossIdentity.desc}*\n`;
    desc += `${bossIdentity.ability.emoji} Abilitate: **${bossIdentity.ability.name}** ${chargeBar(charge, FINAL_BOSS_CHARGE_MAX)}\n`;
    desc += `⚡ *Fiecare lovitură umple bara — când e plină, bossul își dezlănțuie abilitatea asupra tuturor!*\n\n`;
  }

  // ── HP bar ───────────────────────────────────────────────────────────────────
  if (currentHp !== undefined && maxHp !== undefined) {
    const bar = buildHpBar(currentHp, maxHp);
    const pct = Math.round((Math.max(0, currentHp) / maxHp) * 100);
    desc += `${rd.emoji} Raritate: **${rd.label}**\n`;
    desc += `❤️ **${Math.max(0, currentHp).toLocaleString()} / ${maxHp.toLocaleString()} HP**\n`;
    desc += `${bar} ${pct}%\n`;
  } else {
    desc += `${rd.emoji} Raritate: **${rd.label}**\n`;
  }

  // ── Body ─────────────────────────────────────────────────────────────────────
  if (defeated) {
    desc += "\n💀 **DRAGONUL STINS A CĂZUT! REGATUL ESTE SALVAT!**\n\nToți participanții au primit recompensa!";
  } else {
    desc +=
      "\n🐉 Lovește-l împreună cu echipa! Oricine poate participa.\n" +
      "🏅 **+50 Rep · +150 Oboli · +250 XP** pentru toți luptătorii\n" +
      "⏱️ Cooldown per jucător: **4 secunde**";
    if (expiresAt) {
      desc += `\n⏳ Bossul fuge **<t:${Math.floor(expiresAt / 1000)}:R>**`;
    }
  }

  // ── Per-player leaderboard ────────────────────────────────────────────────────
  if (damageBy && damageBy.size > 0 && playerNames) {
    const sorted = [...damageBy.entries()].sort((a, b) => b[1] - a[1]);
    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
    const lines = sorted.slice(0, 8).map(([id, dmg], i) => {
      const name = playerNames.get(id) ?? "???";
      const medal = medals[i] ?? `${i + 1}.`;
      const hp = playerHp?.get(id);
      const stats = playerStats?.get(id);
      const maxHpVal = stats?.maxHp ?? 100;

      const hpStr = hp === undefined
        ? ""
        : hp <= 0
          ? "  ·  ⚰️ Doborât"
          : `  ·  ❤️ ${hp}/${maxHpVal} HP`;

      const statsStr = stats
        ? `\n↳ ⚔️+${stats.atk} · 🛡️+${stats.def} · 🌀${stats.dodge}% · 💥${stats.crit}%`
        : "";

      return `${medal} **${name}** — 🎯 ${dmg.toLocaleString()} dmg${hpStr}${statsStr}`;
    });
    desc += `\n\n━━━━━━━━━━━━━━━━━━\n⚔️ **LUPTĂTORI (${sorted.length})**\n\n${lines.join("\n")}`;
  }

  const embed = new EmbedBuilder()
    .setColor(rd.color)
    .setTitle(`🐉  DRAGONUL STINS – NIVEL ${level}  🐉`)
    .setDescription(desc)
    .setImage(bossImg(bossIndex(level)) ?? IMG.dragon);

  return embed;
}

const RARITY_MULT: Record<BossRarity, number> = { comun: 1, rar: 1.5, epic: 2, legendar: 3 };
const BASE_REP = 50, BASE_GOLD = 150, BASE_XP = 250;

const HIT_BONUS_XP = 5, HIT_BONUS_GOLD = 3, HIT_BONUS_REP = 2;

export function computeBossRewards(
  damageBy: Map<string, number>,
  rarity: BossRarity,
  hitsBy?: Map<string, number>,
): Map<string, { rep: number; gold: number; xp: number }> {
  const rm = RARITY_MULT[rarity];
  const sorted = [...damageBy.entries()]
    .filter(([, dmg]) => dmg > 0)
    .sort((a, b) => b[1] - a[1]);
  const result = new Map<string, { rep: number; gold: number; xp: number }>();
  sorted.forEach(([id], i) => {
    const rankMult = i === 0 ? 3 : i < 3 ? 2 : 1;
    const hits = hitsBy?.get(id) ?? 0;
    const hitBonusXp = hits * HIT_BONUS_XP * rm;
    const hitBonusGold = hits * HIT_BONUS_GOLD * rm;
    const hitBonusRep = hits * HIT_BONUS_REP * rm;
    result.set(id, {
      rep:  Math.round(BASE_REP  * rankMult * rm + hitBonusRep),
      gold: Math.round(BASE_GOLD * rankMult * rm + hitBonusGold),
      xp:   Math.round(BASE_XP   * rankMult * rm + hitBonusXp),
    });
  });
  return result;
}

export function buildBossLeaderboard(
  bossInfo: { level: number; rarity: BossRarity; maxHp: number; defeated: boolean },
  damageMap: Map<string, number>,
  participants: Array<{ username: string; discordId: string; monsterLevel: number; totalDamage: number; isAlive: boolean }>,
  playerNames?: Map<string, string>,
  playerHp?: Map<string, number>,
  hitsBy?: Map<string, number>,
): EmbedBuilder {
  const rd = BOSS_RARITY_DATA[bossInfo.rarity];
  const rewards = computeBossRewards(damageMap, bossInfo.rarity, hitsBy);

  // Build a unified map of everyone who did damage
  const allIds = new Set([...damageMap.keys(), ...participants.map((p) => p.discordId)]);
  const participantMap = new Map(participants.map((p) => [p.discordId, p]));

  const ranked = [...allIds]
    .map((id) => {
      const p = participantMap.get(id);
      const name = p?.username ?? playerNames?.get(id) ?? "???";
      return {
        discordId: id,
        username: name,
        bossDamage: damageMap.get(id) ?? 0,
        monsterLevel: p?.monsterLevel ?? 0,
        totalDamage: p?.totalDamage ?? 0,
        inEvent: !!p,
      };
    })
    .sort((a, b) => b.bossDamage - a.bossDamage || b.monsterLevel - a.monsterLevel);

  const medals = ["🥇", "🥈", "🥉"];
  const lines = ranked.slice(0, 10).map((p, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;

    // HP status
    const hp = playerHp?.get(p.discordId);
    const hpStr = hp === undefined
      ? ""
      : hp <= 0
        ? " | ⚰️ Doborât"
        : ` | ❤️ ${hp} HP rămase`;

    // Reward line
    const rew = rewards.get(p.discordId);
    const rewStr = rew
      ? ` | 🏅 +${rew.rep} Rep  +${rew.gold} Oboli  +${rew.xp} XP`
      : "";

    const hits = hitsBy?.get(p.discordId) ?? 0;
    const hitsStr = hits > 0 ? ` | ⚔️ ${hits} lovituri` : "";

    const bossStr = p.bossDamage > 0
      ? `🐉 ${p.bossDamage.toLocaleString()} daune`
      : `🐉 Nu a lovit`;

    if (p.inEvent) {
      return `${medal} **${p.username}** — ${bossStr}${hitsStr}${hpStr} | 🎚️ Niv.**${p.monsterLevel}** | 💥 ${p.totalDamage.toLocaleString()} Eveniment${rewStr}`;
    }
    return `${medal} **${p.username}** — ${bossStr}${hitsStr}${hpStr}${rewStr}`;
  });

  const rarityBonus = RARITY_MULT[bossInfo.rarity] > 1 ? ` ✨ Bonus raritate ×${RARITY_MULT[bossInfo.rarity]}` : "";
  const title = bossInfo.defeated
    ? "🏆 CLASAMENT FINAL — Dragonul a Căzut!"
    : "📜 CLASAMENT FINAL — Dragonul a Scăpat…";

  return new EmbedBuilder()
    .setColor(bossInfo.defeated ? 0xffd700 : 0x555555)
    .setTitle(title)
    .setDescription(
      `${rd.emoji} **Dragon Nivel ${bossInfo.level}** — ${rd.label} | HP: ${bossInfo.maxHp.toLocaleString()}${rarityBonus}\n\n` +
      (lines.length > 0 ? lines.join("\n") : "_Niciun participant._"),
    )
    .setFooter({ text: "Recompensele au fost distribuite automat." })
    .setTimestamp();
}

export function finalBossRow(eventId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`finalboss_${eventId}`).setLabel("Lovește Dragonul").setEmoji("🐉").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bossability_${eventId}_empower`).setLabel("Lovitura Umbrei").setEmoji("🌑").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bossability_${eventId}_shield`).setLabel("Scut de Cenușă").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
  );
}
