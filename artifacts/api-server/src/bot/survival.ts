import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { EventParticipant } from "@workspace/db";
import type { Player } from "@workspace/db";
import { IMG } from "./assets";
import { getActiveBattleEvent, consumeStormDrain } from "./combat-events";

const BASE_PRICES = { atac: 50, def: 60, dodge: 70, crit: 80, hp: 40 } as const;
export type ShopKey = keyof typeof BASE_PRICES;
export const LEVELUP_INTERVAL = 5;
export const ABILITY_COOLDOWN_MS = 5 * 60 * 1000;

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
  cavaler: { label: "Cavaler al Cenușii", emoji: "🛡️", desc: "+2 damage, +5 HP", attack: 2, hp: 5, dodge: 0, crit: 0, xpMult: 1, oboliMult: 1 },
  umbrolog: { label: "Umbrolog", emoji: "🌀", desc: "+3% evitare, +1% critic", attack: 0, hp: 0, dodge: 3, crit: 1, xpMult: 1, oboliMult: 1 },
  strajer: { label: "Străjerul Arșiței", emoji: "🔥", desc: "+10% XP câștigat", attack: 0, hp: 0, dodge: 0, crit: 0, xpMult: 1.1, oboliMult: 1 },
  alchimist: { label: "Alchimist Stins", emoji: "⚗️", desc: "+20% Oboli câștigați", attack: 0, hp: 0, dodge: 0, crit: 0, xpMult: 1, oboliMult: 1.2 },
  ratacitor: { label: "Rătăcitorul Fumului", emoji: "💨", desc: "+5% șansă de evitare", attack: 0, hp: 0, dodge: 5, crit: 0, xpMult: 1, oboliMult: 1 },
};
export function isClassKey(k: string): k is ClassKey { return k in CLASSES; }

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
  if (usedEmpower) base *= 2;
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
        if (usedShield) monsterDmg = Math.ceil(monsterDmg / 2);
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
      "Moartea în acest event este definitivă.\n" +
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
      (boss ? "💀 O prezență colosală blochează drumul. Reward dublu pentru cel care o doboară!\n\n" : "") +
      (battle ? `${battle.emoji} *${battle.title} e activ acum!*\n\n` : "") +
      (extra ? `${extra}\n\n` : "") +
      `❤️ HP Monstru: **${p.monsterCurrentHp}/${mMaxHp}** ${hpBar(p.monsterCurrentHp, mMaxHp)}\n` +
      `⚔️ Damage: **${mn} – ${mx}**\n` +
      `🎯 Șansă lovitură: **${monsterHitPct(p.monsterLevel).toFixed(0)}%**\n` +
      `💰 Reward: **${reward.xp} XP, ${reward.oboli} Oboli**\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `❤️ HP-ul tău: **${p.currentHp}/${p.maxHp}** ${hpBar(p.currentHp, p.maxHp)}\n` +
      `🪙 Oboli strânși în event: **${p.oboli}** *(20% se pierd la moarte)*`,
    )
    .setImage(IMG.monster)
    .setFooter({ text: `⚔️ +${p.attackBonus} | 🛡️ +${p.defenseBonus} | 🌀 ${p.dodgeBonus}% | 💥 ${p.critBonus}% | ❤️ +${p.maxHp - 100}` });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

const CRIT_LINES = [
  "💥 **LOVITURĂ DEVASTATOARE** 💥\nUmbrele se rup în două sub puterea ta!\nAi provocat **{dmg} damage critic**!",
  "🔥 **FURIA CENUȘII SE DEZLĂNȚUIE** 🔥\nLovitura ta a sfâșiat creatura pentru **{dmg} damage**!",
  "⚡ **IMPACT CATACLISMIC** ⚡\nCenușa explodează în jurul creaturii — **{dmg} damage**!",
];

export function buildResultText(r: CombatResult): string {
  let txt = "";
  if (r.usedEmpower) txt += "🌑 **LOVITURA UMBREI!** Puterea Umbrelor îți dublează lovitura!\n";
  if (r.usedShield) txt += "🛡️ **SCUT DE CENUȘĂ activ!** Daunele primite sunt înjumătățite.\n";
  if (r.isCrit) {
    txt += CRIT_LINES[Math.floor(Math.random() * CRIT_LINES.length)]!.replace("{dmg}", String(r.playerDmg)) + "\n\n";
  } else {
    txt += `⚔️ **AI LOVIT MONSTRUL!**\nLovitura ta a atins creatura pentru **${r.playerDmg} damage**.\nUmbrele se clatină în jurul ei.\n\n`;
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
    else txt += `💀 **MONSTRUL RIPOSTEAZĂ!**\nCreatura îți aplică **${r.monsterDmg} damage**.\nUmbrele îți apasă umerii, iar sângele îți pulsează în tâmple.`;
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
      "Nu mai poți continua acest event.\n\n" +
      (lostOboli > 0 ? `🪙 Ai pierdut **${lostOboli} Oboli** (20% din ce ai strâns în event).\n\n` : "") +
      "Trupul tău pământesc a cedat,\n" +
      "dar numele tău va rămâne scris în cronica celor căzuți.\n\n" +
      "Magazinul rămâne deschis — folosește **/magazin** ca să te întărești pentru următoarea chemare.",
    )
    .setImage(IMG.death);
}

export function buildProfileEmbed(player: Player, title?: string, avatarUrl?: string | null): EmbedBuilder {
  const deathInfo = player.deaths > 0
    ? `${player.deaths} × (ultima: Nivel ${player.deathLevel})`
    : "0 — neînvins";
  const retreatInfo = player.retreats > 0
    ? `🏳️ A abandonat și a fugit de **${player.retreats}** ori (ultima: Nivel ${player.retreatLevel})`
    : "🛡️ Nu a fugit niciodată din luptă";
  const cls = player.class && isClassKey(player.class) ? CLASSES[player.class] : null;
  const rank = levelTitle(player.maxLevel);
  const embed = new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle(title ?? `📜 Profilul lui ${player.username}`)
    .setDescription(
      `🎖️ **${rank}** *(Nivel max: ${player.maxLevel})*\n` +
      (player.honorTitle ? `👑 **${player.honorTitle}**\n` : "") +
      (cls ? `${cls.emoji} **${cls.label}** — ${cls.desc}` : "🧭 *Fără clasă — folosește /clasa*"),
    )
    .addFields(
      { name: "⭐ XP Total", value: `${player.xp}`, inline: true },
      { name: "🪙 Oboli", value: `${player.gold}`, inline: true },
      { name: "🏅 Reputație", value: `${player.reputation}`, inline: true },
      { name: "💀 Morți", value: deathInfo, inline: false },
      { name: "🏳️ Retrageri", value: retreatInfo, inline: false },
    )
    .setFooter({ text: "Regatul Cenușii — Cronica Umbrelor" })
    .setTimestamp();
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

export function buildChestEmbed(gold: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("📦✨  UN CUFĂR A APĂRUT ÎN REGAT!  ✨📦")
    .setDescription(
      "Cenușa s-a ridicat și a dezvăluit un cufăr misterios!\n" +
      "Obolii zac în el, așteptând mâna celui mai rapid.\n\n" +
      `💰 **${gold} Oboli** pentru primul care revendică!\n\n` +
      "⚡ Fii primul — cufărul dispare în fumul umbrelor!",
    )
    .setImage(IMG.chest)
    .setFooter({ text: "Primul click câștigă!" });
}

export function buildShopEmbed(p: Player): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle("🔥🏺  FORJA CENUȘII – MAGAZINUL REGAL  🏺🔥")
    .setDescription(
      "În adâncul cetății, focul nu se stinge niciodată.\n" +
      "Aici, metalul se topește, umbrele se împletesc,\n" +
      "iar puterea se cumpără cu Oboli de Cenușă.\n\n" +
      `💰 **Oboli disponibili: ${p.gold}**\n\n` +
      `⚔️ **Furia Cenușii (Atac)** — ${shopPrice("atac", p.shopAttackCount)} Oboli → +2 damage\n` +
      `🛡️ **Scutul Umbrelor (Defensivă)** — ${shopPrice("def", p.shopDefenseCount)} Oboli → -2 damage primit\n` +
      `🌀 **Dansul Fumului (Evitare)** — ${shopPrice("dodge", p.shopDodgeCount)} Oboli → +3% evitare\n` +
      `💥 **Lovitura Arhontei (Critic)** — ${shopPrice("crit", p.shopCritCount)} Oboli → +2% critic\n` +
      `❤️ **Voința Cenușii (HP Max)** — ${shopPrice("hp", p.shopHpCount)} Oboli → +10 HP Max\n\n` +
      `📊 **Bonusurile tale acum:**\n` +
      `⚔️ +${p.attackBonus} atac | 🛡️ +${p.defenseBonus} def | 🌀 ${p.dodgeBonus}% evitare | 💥 ${p.critBonus}% critic | ❤️ +${p.maxHpBonus} HP\n\n` +
      "Upgrade-urile sunt **permanente** și se aplică **imediat**, chiar și în lupta curentă.\n" +
      "Alege cu înțelepciune.\nFiecare Obol cheltuit îți apropie destinul de victorie… sau de ruină.",
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
      "🔹 **+2 damage** permanent\n" +
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
      "Eventul s-a încheiat.\nUmbrele se retrag, iar cenușa cade încet peste Regat.\n\n" +
      `**Eroii care au rezistat cel mai mult:**\n${top}\n\n` +
      `**Cei Căzuți în Umbre:**\n${topFallen}\n\n` +
      (topFled ? `**Cei care au abandonat și au fugit:**\n${topFled}\n\n` : "") +
      "Regatul Cenușii își amintește de fiecare pas,\nde fiecare lovitură și de fiecare cădere.\nUmbrele îți mulțumesc pentru luptă.",
    );
}

export function combatRow(eventId: number, p?: EventParticipant): ActionRowBuilder<ButtonBuilder> {
  const onCooldown = p?.abilityReadyAt ? p.abilityReadyAt.getTime() > Date.now() : false;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ora_attack_${eventId}`).setLabel("Atacă").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ora_ability_${eventId}_empower`).setLabel("Lovitura Umbrei").setEmoji("🌑").setStyle(ButtonStyle.Primary).setDisabled(onCooldown),
    new ButtonBuilder().setCustomId(`ora_ability_${eventId}_shield`).setLabel("Scut de Cenușă").setEmoji("🛡️").setStyle(ButtonStyle.Primary).setDisabled(onCooldown),
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

export function shopRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
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
      mk("hp", "❤️", "HP Max"),
    ),
  ];
}

export function levelupRows(eventId: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_xp`).setLabel("+5 XP/monstru").setEmoji("🔹").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_dodge`).setLabel("+3% Evitare").setEmoji("🔹").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ora_lvlup_${eventId}_atac`).setLabel("+2 Damage").setEmoji("🔹").setStyle(ButtonStyle.Success),
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
      );
  }
  return new EmbedBuilder()
    .setColor(0x6d28d9)
    .setTitle("🧬  ALEGE-ȚI CLASA")
    .setDescription(
      "Înainte de a intra în Umbre, alege-ți calea.\n" +
      "⚠️ **Alegerea este permanentă!**\n\n" +
      Object.values(CLASSES).map((c) => `${c.emoji} **${c.label}** — ${c.desc}`).join("\n"),
    );
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
export function buildFinalBossEmbed(level: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x7f1d1d)
    .setTitle(`🐉  DRAGONUL STINS – NIVEL ${level}  🐉`)
    .setDescription(
      "Cerul Regatului se întunecă, iar cenușa se ridică în vârtejuri.\n" +
      "**Ultima încercare a Regatului a sosit.**\n\n" +
      "🐉 Dragonul Stins coboară din Abis. Doar cei vii îl pot lovi.\n" +
      "Cei care îndrăznesc să-l lovească primesc un **dar special**:\n" +
      "🏅 **+50 Reputație, +150 Oboli, +250 XP**\n\n" +
      "⚔️ Lovește acum — fiecare luptător poate lovi o singură dată!",
    )
    .setImage(IMG.monster)
    .setFooter({ text: "Eventul se încheie în curând…" });
}

export function finalBossRow(eventId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`finalboss_${eventId}`).setLabel("Lovește Dragonul").setEmoji("🐉").setStyle(ButtonStyle.Danger),
  );
}
