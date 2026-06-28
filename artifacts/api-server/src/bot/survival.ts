import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { EventParticipant } from "@workspace/db";
import type { Player } from "@workspace/db";
import { IMG, COMPANION_IMG, CHEST_IMG } from "./assets";
import { getActiveBattleEvent, consumeStormDrain } from "./combat-events";

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
const RARITY_WEIGHTS: [Exclude<Rarity, "boss">, number][] = [
  ["comun", 690], ["rar", 220], ["epic", 80], ["legendar", 9], ["mitic", 1],
];

export function isMiniBoss(level: number): boolean {
  return level > 0 && level % 10 === 0;
}

export function rollRarity(level: number): Rarity {
  if (isMiniBoss(level)) return "boss";
  const total = RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of RARITY_WEIGHTS) {
    if ((roll -= w) <= 0) return r;
  }
  return "comun";
}

const MONSTER_PREFIXES = ["Umbra", "Cenușa", "Neantul", "Vidul", "Bezna", "Întunericul", "Obscuritatea", "Golul"];
const MONSTER_NOUNS = ["Devorantul", "Torturatorul", "Corumpatorul", "Distrugătorul", "Vânătorul", "Consumatorul", "Sufocatorul", "Devastatorul", "Corupătorul", "Nimicitorul"];
const BOSS_NAMES = ["Colosul Cenușii", "Avatarul Ruinei", "Tiranul Abisului", "Stăpânul Fumegând", "Coloasul Umbrelor"];

export function monsterName(level: number): string {
  if (isMiniBoss(level)) return BOSS_NAMES[(level / 10 - 1) % BOSS_NAMES.length]!;
  return `${MONSTER_PREFIXES[level % MONSTER_PREFIXES.length]} ${MONSTER_NOUNS[Math.floor(level / MONSTER_PREFIXES.length) % MONSTER_NOUNS.length]}`;
}
export function monsterMaxHp(level: number) {
  const base = 40 + level * 15;
  return isMiniBoss(level) ? Math.round(base * 2.5) : base;
}
export function monsterDmgRange(level: number): [number, number] {
  const b = (5 + level * 1.5) * (isMiniBoss(level) ? 1.4 : 1);
  return [Math.max(1, Math.floor(b - 3)), Math.ceil(b + 3)];
}
export function monsterHitPct(level: number) { return Math.min(90, 35 + level * 1.2 + (isMiniBoss(level) ? 5 : 0)); }
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

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function hpBar(cur: number, max: number) {
  const f = Math.max(0, Math.min(10, Math.round((cur / max) * 10)));
  return "█".repeat(f) + "░".repeat(10 - f);
}

export type CombatResult = {
  playerDmg: number; isCrit: boolean;
  monsterDefeated: boolean;
  monsterHit: boolean; monsterDmg: number; playerDodged: boolean;
  playerDied: boolean;
  newMonsterHp: number; newPlayerHp: number;
  xpGained: number; oboliGained: number;
  levelUp: boolean; newMonsterLevel: number; newMonsterRarity: Rarity;
  usedEmpower: boolean; usedShield: boolean;
  stormDrain: number; battleEventEmoji: string;
};

export function doCombat(p: EventParticipant): CombatResult {
  const battle = getActiveBattleEvent();
  const usedEmpower = p.empowerNext;
  const usedShield = p.shieldNext;

  const isCrit = Math.random() * 100 < p.critBonus;
  let base = rand(10, 20) + p.attackBonus;
  if (isCrit) base *= 2;
  if (usedEmpower) base = Math.round(base * empowerMult(p.empowerLevel));
  if (battle) base = Math.round(base * battle.damageMult);
  const playerDmg = base;
  const newMHp = Math.max(0, p.monsterCurrentHp - playerDmg);
  const monsterDefeated = newMHp <= 0;

  let xpGained = 0, oboliGained = 0, newMonsterLevel = p.monsterLevel, levelUp = false;
  let newMonsterRarity: Rarity = p.monsterRarity as Rarity;
  if (monsterDefeated) {
    const r = monsterReward(p.monsterLevel, p.monsterRarity as Rarity);
    xpGained = r.xp; oboliGained = r.oboli;
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
    monsterHit = Math.random() * 100 < monsterHitPct(p.monsterLevel) - missBonus;
    if (monsterHit) {
      playerDodged = Math.random() * 100 < p.dodgeBonus;
      if (!playerDodged) {
        const [mn, mx] = monsterDmgRange(p.monsterLevel);
        monsterDmg = Math.max(1, rand(mn, mx) - p.defenseBonus);
        if (usedShield) monsterDmg = Math.max(1, Math.round(monsterDmg * (1 - shieldReduction(p.shieldLevel))));
        newPlayerHp = Math.max(0, newPlayerHp - monsterDmg);
        playerDied = newPlayerHp <= 0;
      }
    }
  }

  return {
    playerDmg, isCrit, monsterDefeated, monsterHit, monsterDmg, playerDodged,
    playerDied, newMonsterHp: monsterDefeated ? monsterMaxHp(newMonsterLevel) : newMHp,
    newPlayerHp, xpGained, oboliGained, levelUp, newMonsterLevel, newMonsterRarity,
    usedEmpower, usedShield, stormDrain, battleEventEmoji: battle?.emoji ?? "",
  };
}

export function buildStartEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x1a0000)
    .setTitle("⚔️🔥  ORA UMBRELOR A ÎNCEPUT  🔥⚔️")
    .setDescription(
      "Umbrele se ridică din adâncuri, iar cenușa dansează în aer.\n" +
      "Regatul Cenușii cheamă luptătorii să își dovedească puterea.\n\n" +
      "Un val nesfârșit de creaturi se pregătește să vă înfrunte.\n" +
      "Apasă pe butonul sacru și intră în luptă.\n\n" +
      "💀 **Atenție:**\n" +
      "Moartea în acest eveniment este definitivă.\n" +
      "Cei căzuți în Umbre nu mai pot continua până la următoarea chemare.",
    )
    .setFooter({ text: "⏳ Eveniment activ timp de 1 oră." })
    .setTimestamp();
}

export function buildCombatEmbed(p: EventParticipant, extra = "", avatarUrl?: string | null): EmbedBuilder {
  const [mn, mx] = monsterDmgRange(p.monsterLevel);
  const mMaxHp = monsterMaxHp(p.monsterLevel);
  const rarity = (p.monsterRarity as Rarity) ?? "comun";
  const meta = RARITY[rarity] ?? RARITY.comun;
  const reward = monsterReward(p.monsterLevel, rarity);
  const zone = zoneFor(p.monsterLevel);
  const boss = isMiniBoss(p.monsterLevel);
  const title = boss
    ? `🔥 MINI-BOSS NIVEL ${p.monsterLevel} – ${monsterName(p.monsterLevel)} 🔥`
    : `${meta.emoji} MONSTRU ${meta.label.toUpperCase()} NIVEL ${p.monsterLevel} – ${monsterName(p.monsterLevel)}`;
  const battle = getActiveBattleEvent();
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(title)
    .setDescription(
      `🗺️ *${zone.name}* — ${zone.intro}\n\n` +
      (boss ? "💀 O prezență colosală blochează drumul. Recompensă dublă pentru cel care o doboară!\n\n" : "") +
      (battle ? `${battle.emoji} *${battle.title} e activ acum!*\n\n` : "") +
      (extra ? `${extra}\n\n` : "") +
      `❤️ HP Monstru: **${p.monsterCurrentHp}/${mMaxHp}** ${hpBar(p.monsterCurrentHp, mMaxHp)}\n` +
      `⚔️ Daune: **${mn} – ${mx}**\n` +
      `🎯 Șansă lovitură: **${monsterHitPct(p.monsterLevel).toFixed(0)}%**\n` +
      `💰 Recompensă: **${reward.xp} XP, ${reward.oboli} Oboli**\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `❤️ HP-ul tău: **${p.currentHp}/${p.maxHp}** ${hpBar(p.currentHp, p.maxHp)}\n` +
      `🪙 Oboli strânși în eveniment: **${p.oboli}** *(20% se pierd la moarte)*`,
    )
    .setImage(IMG.monster)
    .setFooter({ text: `⚔️ +${p.attackBonus} | 🛡️ +${p.defenseBonus} | 🌀 ${p.dodgeBonus}% | 💥 ${p.critBonus}% | ❤️ +${p.maxHp - 100}` });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

const CRIT_LINES = [
  "💥 **LOVITURĂ DEVASTATOARE** 💥\nUmbrele se rup în două sub puterea ta!\nAi provocat **{dmg} daune critice**!",
  "🔥 **FURIA CENUȘII SE DEZLĂNȚUIE** 🔥\nLovitura ta a sfâșiat creatura pentru **{dmg} daune**!",
  "⚡ **IMPACT CATACLISMIC** ⚡\nCenușa explodează în jurul creaturii — **{dmg} daune**!",
];

export function buildResultText(r: CombatResult): string {
  let txt = "";
  if (r.usedEmpower) txt += "🌑 **LOVITURA UMBREI!** Puterea Umbrelor îți dublează lovitura!\n";
  if (r.usedShield) txt += "🛡️ **SCUT DE CENUȘĂ activ!** Daunele primite sunt înjumătățite.\n";
  if (r.isCrit) {
    txt += CRIT_LINES[Math.floor(Math.random() * CRIT_LINES.length)]!.replace("{dmg}", String(r.playerDmg)) + "\n\n";
  } else {
    txt += `⚔️ **AI LOVIT MONSTRUL!**\nLovitura ta a atins creatura pentru **${r.playerDmg} daune**.\nUmbrele se clatină în jurul ei.\n\n`;
  }
  if (r.stormDrain > 0) txt += `🌪️ Furtuna de Fum îți arde **${r.stormDrain} HP**!\n`;
  if (r.monsterDefeated) {
    txt += `💀 **MONSTRUL A CĂZUT!** +${r.xpGained} XP, +${r.oboliGained} Oboli\n`;
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

export function buildDeathEmbed(lostOboli = 0): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("💀  AI CĂZUT ÎN UMBRE 💀")
    .setDescription(
      "Umbrele te-au revendicat, iar cenușa îți acoperă pașii.\n" +
      "Nu mai poți continua acest eveniment.\n\n" +
      (lostOboli > 0 ? `🪙 Ai pierdut **${lostOboli} Oboli** (20% din ce ai strâns în eveniment).\n\n` : "") +
      "Trupul tău pământesc a cedat,\n" +
      "dar numele tău va rămâne scris în cronica celor căzuți.\n\n" +
      "Magazinul rămâne deschis — folosește **/magazin** ca să te întărești pentru următoarea chemare.",
    )
    .setImage(IMG.death);
}

export function buildProfileEmbed(player: Player, title?: string, avatarUrl?: string | null): EmbedBuilder {
  const cls = player.class && isClassKey(player.class) ? CLASSES[player.class] : null;
  const rank = levelTitle(player.maxLevel);

  const classValue = cls ? `${cls.emoji} **${cls.label}**` : "*Fără clasă* — `/clasa`";
  const compValue = player.companion && isCompanionKey(player.companion)
    ? `${COMPANIONS[player.companion].emoji} **${isCompanionEvolved(player.companionLevel) ? COMPANIONS[player.companion].evoLabel : COMPANIONS[player.companion].label}** Nv.${player.companionLevel}${isCompanionEvolved(player.companionLevel) ? " ✨" : ""}`
    : "*Fără companion* — `/magazin`";
  const abilValue = (player.abilityEmpowerLevel >= 1 || player.abilityShieldLevel >= 1)
    ? [
        player.abilityEmpowerLevel >= 1 ? `${ABILITIES.empower.emoji} ${ABILITIES.empower.label} Nv.${player.abilityEmpowerLevel}` : null,
        player.abilityShieldLevel >= 1 ? `${ABILITIES.shield.emoji} ${ABILITIES.shield.label} Nv.${player.abilityShieldLevel}` : null,
      ].filter(Boolean).join("  ·  ")
    : "*Fără abilități* — `/magazin`";

  const deathInfo = player.deaths > 0
    ? `${player.deaths}× (ultima: Nivel ${player.deathLevel})`
    : "Neînvins";
  const retreatInfo = player.retreats > 0
    ? `${player.retreats}× (ultima: Nivel ${player.retreatLevel})`
    : "Niciodată";

  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle(title ?? `📜 Profilul lui ${player.username}`)
    .setDescription(
      `🎖️ **${rank}** *(Nivel max: ${player.maxLevel})*` +
      (player.honorTitle ? `\n👑 **${player.honorTitle}**` : ""),
    )
    .addFields(
      { name: "🧬 Clasă", value: classValue, inline: true },
      { name: "🐾 Companion", value: compValue, inline: true },
      { name: "🎯 Abilități", value: abilValue, inline: false },
      { name: "━━━ Resurse ━━━", value: `⭐ **${player.xp}** XP   ·   🪙 **${player.gold}** Oboli   ·   🏅 **${player.reputation}** Reputație`, inline: false },
      { name: "━━━ Istoric de luptă ━━━", value: `💀 Morți: **${deathInfo}**\n🏳️ Retrageri: **${retreatInfo}**`, inline: false },
    )
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
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
];

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

export function buildChestEmbed(gold: number, rarity?: ChestRarity, mult?: 2 | 3): EmbedBuilder {
  const r = rarity ?? CHEST_RARITIES[0]!;
  const image = CHEST_IMG[r.key] ?? IMG.chest;
  const blessingLine = mult != null
    ? `\n🔮 **Profeție activă — ×${mult} Oboli!** Câștigă **${gold * mult}** Oboli!`
    : "";
  return new EmbedBuilder()
    .setColor(r.color)
    .setTitle(`${r.emoji}✨  ${r.label.toUpperCase()} A APĂRUT ÎN REGAT!  ✨${r.emoji}`)
    .setDescription(
      "Cenușa s-a ridicat și a dezvăluit un cufăr misterios!\n" +
      "Obolii zac în el, așteptând mâna celui mai rapid.\n\n" +
      `💰 **${gold} Oboli** pentru primul care revendică!${blessingLine}\n\n` +
      "⚡ Fii primul — cufărul dispare în fumul umbrelor!",
    )
    .setImage(image)
    .setFooter({ text: "Primul click câștigă!" });
}

export type ShopCategory = "overview" | "stats" | "comp" | "abil";

const SHOP_BALANCE = (p: Player) => `🪙 **Oboli: ${p.gold}**   ·   ⭐ **XP: ${p.xp}**`;

// Five permanent stat upgrades — shows current bonus → value after purchase,
// with the price in bold so the cost is unmistakable.
function shopStatsText(p: Player): string {
  const line = (key: ShopKey, emoji: string, label: string, now: string, next: string) => {
    const price = shopPrice(key, p[SHOP_COUNT_KEY[key]] as number);
    return `${emoji} **${label}** — **${price} Oboli**\n   ↳ acum ${now} → ${next}\n`;
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
      `🎁 Bonus activ: ${companionEffectiveDesc(p.companion, p.companionLevel)}\n\n` +
      `🔼 **Îmbunătățire Nv.${p.companionLevel} → ${p.companionLevel + 1}**\n` +
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
        `   ↳ ${a.desc}\n` +
        `   🔼 Îmbunătățire → Nv.${lvl + 1}: **${cost} Oboli + ${UPGRADE_XP_COST} XP**\n`
      );
    }
    return (
      `${a.emoji} 🔒 **${a.label}**\n` +
      `   ↳ ${a.desc}\n` +
      `   🛒 Deblochează: **${ABILITY_BUY_COST} Oboli**\n`
    );
  };
  return line("empower") + "\n" + line("shield");
}

// Category-aware shop: each sub-page renders ONLY its own category so the embed
// matches the buttons shown below it. Prices are always bold for clarity.
export function buildShopEmbed(p: Player, category: ShopCategory = "overview"): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(THEME_COLOR).setFooter({ text: BRAND_FOOTER });

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
        "\n*Companionul nou se aplică din următoarea Ora Umbrelor.*",
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

  return embed
    .setTitle("🔥🏺 Forja Cenușii — Magazinul Regal")
    .setDescription(
      "În adâncul cetății, focul nu se stinge niciodată.\n" +
      "Aici puterea se cumpără cu Oboli de Cenușă.\n\n" +
      SHOP_BALANCE(p) + "\n\n" +
      sectionTitle("Alege o categorie") + "\n" +
      "⚔️ **Puteri** — statistici permanente (atac, apărare, evitare, critic, HP)\n" +
      "🐾 **Companion** — un aliat de luptă care crește odată cu tine\n" +
      "🎯 **Abilități** — puteri active folosite în luptă\n\n" +
      "👇 Apasă un buton de mai jos pentru a deschide o categorie.",
    );
}

export function buildLevelupEmbed(newLevel: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`✨  AI AVANSAT LA NIVELUL ${newLevel}  ✨`)
    .setDescription(
      "Cenușa se ridică în jurul tău, iar Umbrele îți recunosc puterea.\n" +
      "Regatul Cenușii îți oferă un dar pentru progresul tău.\n\n" +
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

export function buildRetreatEmbed(level: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x555555)
    .setTitle("🏳️  TE-AI RETRAS DIN LUPTĂ 🏳️")
    .setDescription(
      "Ai întors spatele Umbrelor și ai fugit din fața monstrului.\n" +
      `Ai abandonat lupta la **Nivelul ${level}**.\n\n` +
      "🪙 Obolii strânși rămân ai tăi — fuga ți-a salvat câștigul.\n" +
      "Dar Regatul își amintește de cei care au fugit…\n\n" +
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

/** Main nav row — 3 category buttons shown on the landing page. */
export function shopNavRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("shop_nav_stats").setLabel("Puteri").setEmoji("⚔️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_nav_comp").setLabel("Companion").setEmoji("🐾").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_nav_abil").setLabel("Abilități").setEmoji("🎯").setStyle(ButtonStyle.Secondary),
  );
}

/** Back button row — shown at the bottom of every sub-page. */
export function shopBackRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("shop_back").setLabel("← Înapoi").setStyle(ButtonStyle.Secondary),
  );
}

/** Main page rows (just the nav). */
export function shopRows(_p: Player): ActionRowBuilder<ButtonBuilder>[] {
  return [shopNavRow()];
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
  const cls = player.class && isClassKey(player.class) ? CLASSES[player.class] : null;
  if (cls) {
    return new EmbedBuilder()
      .setColor(0x6d28d9)
      .setTitle("🧬  CLASA TA ÎN REGATUL CENUȘII")
      .setDescription(
        `Ai ales deja calea ta, iar ea este **permanentă**.\n\n` +
        `${cls.emoji} **${cls.label}**\n*${cls.desc}*\n\n` +
        "Bonusurile clasei se aplică automat la fiecare intrare în Ora Umbrelor.",
      )
      .setFooter({ text: BRAND_FOOTER });
  }
  return new EmbedBuilder()
    .setColor(0x6d28d9)
    .setTitle("🧬  ALEGE-ȚI CLASA")
    .setDescription(
      "Înainte de a intra în Umbre, alege-ți calea.\n" +
      "⚠️ **Alegerea este permanentă!**\n\n" +
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
        `🎁 **Bonus activ:** ${companionEffectiveDesc(player.companion, player.companionLevel)}\n\n` +
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

// ─── Profeții zilnice ─────────────────────────────────────────────────────────
const PROPHECY_LINES: Record<string, Record<number, string[]>> = {
  bronz: {
    2: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Cenușa umilă ascunde o binecuvântare dublă...*\n**Cufărul de Bronz** va dărui de **două ori** mai mult azi! 🪙×2",
      "🕯️ *Flăcările bronzului ard mai puternic astăzi.*\n🔮 **Cufărul de Bronz** — recompensă **×2** până la miezul nopții!",
    ],
    3: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Din scrumul umil răsar bogății triple...*\n**Cufărul de Bronz** va dărui de **trei ori** mai mult azi! 🪙×3",
      "🕯️ *Bronzul strălucește ca aurul în lumina Oracolului.*\n🔮 **Cufărul de Bronz** — triplu binecuvântat **×3**!",
    ],
  },
  argint: {
    2: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Argintul curge dublu prin văile cenușii...*\n**Cufărul de Argint** va dărui de **două ori** mai mult azi! 🥈×2",
      "🌫️ *O ceață argintie coboară — semn bun pentru cei rapizi.*\n🔮 **Cufărul de Argint** — recompensă **×2** azi!",
    ],
    3: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Umbrele argintii poartă trei daruri azi...*\n**Cufărul de Argint** va dărui de **trei ori** mai mult! 🥈×3",
      "🌑 *Oracolul vede… argintul curge în triple șuvoaie.*\n🔮 **Cufărul de Argint** — recompensă **×3** azi!",
    ],
  },
  aur: {
    2: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Aurul soarelui se înmulțește prin puterea Oracolului...*\n**Cufărul de Aur** va dărui de **două ori** mai mult azi! 🥇×2",
      "✨ *O lumină aurie pulsează în profeție.*\n🔮 **Cufărul de Aur** — binecuvântat **×2** azi!",
    ],
    3: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Aurul cade în ploaie triplă din bolta cenușie...*\n🥇 **Cufărul de Aur** va dărui de **trei ori** mai mult azi! ×3",
      "🌟 *Profeția arde ca soarele: aurul se triplează.*\n🔮 **Cufărul de Aur** — recompensă **×3**!",
    ],
  },
  mitic: {
    2: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Puterea mitică se înmulțește în umbrele timpului...*\n💎 **Cufărul Mitic** va dărui de **două ori** mai mult azi! ×2",
      "⚡ *Energii arcanice duble pulsează în cenușă.*\n🔮 **Cufărul Mitic** — binecuvântat **×2**!",
    ],
    3: [
      "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*Din adâncurile timpului răsar de trei ori mai mulți Oboli...*\n💎⚡ **CUFĂRUL MITIC** — recompensă **×3** azi! ⚡💎",
      "🌑⚡ *Oracolul tremură. Puterea veche curge de trei ori.*\n🔮 **Cufărul Mitic** — **×3**! Cel mai mare dar al zilei!",
    ],
  },
};

export function buildProphecyMessage(rarityKey: string, mult: 2 | 3): string {
  const lines = PROPHECY_LINES[rarityKey]?.[mult];
  if (!lines || lines.length === 0) {
    return `🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\nUn cufăr misterios este binecuvântat **×${mult}** azi!`;
  }
  return lines[Math.floor(Math.random() * lines.length)]!;
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

export function buildHpBar(current: number, max: number, size = 18): string {
  const pct = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(pct * size);
  return "█".repeat(filled) + "░".repeat(size - filled);
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
): EmbedBuilder {
  const rd = BOSS_RARITY_DATA[rarity];
  const defeated = currentHp !== undefined && currentHp <= 0;

  // ── Header ──────────────────────────────────────────────────────────────────
  let desc = defeated
    ? "*Cenușa se ridică, iar tăcerea cuprinde câmpul de luptă.*\n\n"
    : "*Cerul Regatului se întunecă, iar cenușa se ridică în vârtejuri.*\n**Ultima încercare a Regatului a sosit.**\n\n";

  // ── HP bar ───────────────────────────────────────────────────────────────────
  if (currentHp !== undefined && maxHp !== undefined) {
    const bar = buildHpBar(currentHp, maxHp);
    const pct = Math.round((Math.max(0, currentHp) / maxHp) * 100);
    desc += `${rd.emoji} Raritate: **${rd.label}**\n`;
    desc += `❤️ **${Math.max(0, currentHp).toLocaleString()} / ${maxHp.toLocaleString()} HP**\n`;
    desc += `\`[${bar}]\` ${pct}%\n`;
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
    .setImage(IMG.monster);

  if (!defeated) {
    embed.setFooter({ text: "Boss activ — 5 minute" });
  }

  return embed;
}

const RARITY_MULT: Record<BossRarity, number> = { comun: 1, rar: 1.5, epic: 2, legendar: 3 };
const BASE_REP = 50, BASE_GOLD = 150, BASE_XP = 250;

export function computeBossRewards(
  damageBy: Map<string, number>,
  rarity: BossRarity,
): Map<string, { rep: number; gold: number; xp: number }> {
  const rm = RARITY_MULT[rarity];
  const sorted = [...damageBy.entries()].sort((a, b) => b[1] - a[1]);
  const result = new Map<string, { rep: number; gold: number; xp: number }>();
  sorted.forEach(([id], i) => {
    const rankMult = i === 0 ? 3 : i < 3 ? 2 : 1;
    result.set(id, {
      rep:  Math.round(BASE_REP  * rankMult * rm),
      gold: Math.round(BASE_GOLD * rankMult * rm),
      xp:   Math.round(BASE_XP   * rankMult * rm),
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
): EmbedBuilder {
  const rd = BOSS_RARITY_DATA[bossInfo.rarity];
  const rewards = computeBossRewards(damageMap, bossInfo.rarity);

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

    const bossStr = p.bossDamage > 0
      ? `🐉 ${p.bossDamage.toLocaleString()} daune`
      : `🐉 Nu a lovit`;

    if (p.inEvent) {
      return `${medal} **${p.username}** — ${bossStr}${hpStr} | 🎚️ Niv.**${p.monsterLevel}** | 💥 ${p.totalDamage.toLocaleString()} Eveniment${rewStr}`;
    }
    return `${medal} **${p.username}** — ${bossStr}${hpStr}${rewStr}`;
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
  );
}
