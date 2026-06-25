import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { EventParticipant } from "@workspace/db";
import type { Player } from "@workspace/db";

const BASE_PRICES = { atac: 50, def: 60, dodge: 70, crit: 80, hp: 40 } as const;
export type ShopKey = keyof typeof BASE_PRICES;
export const LEVELUP_INTERVAL = 5;

const MONSTER_PREFIXES = ["Umbra", "Cenușa", "Neantul", "Vidul", "Bezna", "Întunericul", "Obscuritatea", "Golul"];
const MONSTER_NOUNS = ["Devorantul", "Torturatorul", "Corumpatorul", "Distrugătorul", "Vânătorul", "Consumatorul", "Sufocatorul", "Devastatorul", "Corupătorul", "Nimicitorul"];

export function monsterName(level: number): string {
  return `${MONSTER_PREFIXES[level % MONSTER_PREFIXES.length]} ${MONSTER_NOUNS[Math.floor(level / MONSTER_PREFIXES.length) % MONSTER_NOUNS.length]}`;
}
export function monsterMaxHp(level: number) { return 40 + level * 15; }
export function monsterDmgRange(level: number): [number, number] {
  const b = 5 + level * 1.5;
  return [Math.max(1, Math.floor(b - 3)), Math.ceil(b + 3)];
}
export function monsterHitPct(level: number) { return Math.min(90, 35 + level * 1.2); }
export function monsterReward(level: number) { return { xp: level * 10, oboli: level * 3 }; }
export function shopPrice(key: ShopKey, count: number) { return Math.ceil(BASE_PRICES[key] * Math.pow(1.35, count)); }

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
  levelUp: boolean; newMonsterLevel: number;
};

export function doCombat(p: EventParticipant): CombatResult {
  const isCrit = Math.random() * 100 < p.critBonus;
  const base = rand(10, 20) + p.attackBonus;
  const playerDmg = isCrit ? base * 2 : base;
  const newMHp = Math.max(0, p.monsterCurrentHp - playerDmg);
  const monsterDefeated = newMHp <= 0;

  let xpGained = 0, oboliGained = 0, newMonsterLevel = p.monsterLevel, levelUp = false;
  if (monsterDefeated) {
    const r = monsterReward(p.monsterLevel);
    xpGained = r.xp; oboliGained = r.oboli;
    newMonsterLevel = p.monsterLevel + 1;
    levelUp = newMonsterLevel % LEVELUP_INTERVAL === 0;
  }

  let monsterHit = false, monsterDmg = 0, playerDodged = false, newPlayerHp = p.currentHp, playerDied = false;
  if (!monsterDefeated) {
    monsterHit = Math.random() * 100 < monsterHitPct(p.monsterLevel);
    if (monsterHit) {
      playerDodged = Math.random() * 100 < p.dodgeBonus;
      if (!playerDodged) {
        const [mn, mx] = monsterDmgRange(p.monsterLevel);
        monsterDmg = Math.max(1, rand(mn, mx) - p.defenseBonus);
        newPlayerHp = Math.max(0, p.currentHp - monsterDmg);
        playerDied = newPlayerHp <= 0;
      }
    }
  }

  return {
    playerDmg, isCrit, monsterDefeated, monsterHit, monsterDmg, playerDodged,
    playerDied, newMonsterHp: monsterDefeated ? monsterMaxHp(newMonsterLevel) : newMHp,
    newPlayerHp, xpGained, oboliGained, levelUp, newMonsterLevel,
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

export function buildCombatEmbed(p: EventParticipant, extra = ""): EmbedBuilder {
  const [mn, mx] = monsterDmgRange(p.monsterLevel);
  const mMaxHp = monsterMaxHp(p.monsterLevel);
  const reward = monsterReward(p.monsterLevel);
  return new EmbedBuilder()
    .setColor(0x4b0082)
    .setTitle(`👁️  MONSTRU NIVEL ${p.monsterLevel} – ${monsterName(p.monsterLevel)}`)
    .setDescription(
      "Umbrele se contorsionează și dau naștere unei noi ființe.\n" +
      "Cu fiecare nivel, puterea ei crește, iar speranța se stinge.\n\n" +
      (extra ? `${extra}\n\n` : "") +
      `❤️ HP Monstru: **${p.monsterCurrentHp}/${mMaxHp}** ${hpBar(p.monsterCurrentHp, mMaxHp)}\n` +
      `⚔️ Damage: **${mn} – ${mx}**\n` +
      `🎯 Șansă lovitură: **${monsterHitPct(p.monsterLevel).toFixed(0)}%**\n` +
      `💰 Reward: **${reward.xp} XP, ${reward.oboli} Oboli**\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `❤️ HP-ul tău: **${p.currentHp}/${p.maxHp}** ${hpBar(p.currentHp, p.maxHp)}\n` +
      `🪙 Oboli strânși în event: **${p.oboli}** *(20% se pierd la moarte)*`,
    )
    .setFooter({ text: `⚔️ +${p.attackBonus} | 🛡️ +${p.defenseBonus} | 🌀 ${p.dodgeBonus}% | 💥 ${p.critBonus}%` });
}

export function buildResultText(r: CombatResult): string {
  let txt = "";
  if (r.isCrit) txt += "⚡ **LOVITURĂ CRITICĂ!**\n";
  txt += `⚔️ **AI LOVIT MONSTRUL!**\nLovitura ta a atins creatura pentru **${r.playerDmg} damage**.\nUmbrele se clatină în jurul ei.\n\n`;
  if (r.monsterDefeated) {
    txt += `💀 **MONSTRUL A CĂZUT!** +${r.xpGained} XP, +${r.oboliGained} Oboli\n`;
    if (!r.levelUp) txt += `👁️ Un nou monstru se ridică… **Nivel ${r.newMonsterLevel}**`;
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
    );
}

export function buildProfileEmbed(player: Player, title?: string): EmbedBuilder {
  const deathInfo = player.deaths > 0
    ? `${player.deaths} × (ultima: Nivel ${player.deathLevel})`
    : "0 — neînvins";
  return new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle(title ?? `📜 Profilul lui ${player.username}`)
    .addFields(
      { name: "⭐ XP Total", value: `${player.xp}`, inline: true },
      { name: "🪙 Oboli", value: `${player.gold}`, inline: true },
      { name: "🏅 Reputație", value: `${player.reputation}`, inline: true },
      { name: "💀 Morți", value: deathInfo, inline: false },
    )
    .setFooter({ text: "Regatul Cenușii — Cronica Umbrelor" })
    .setTimestamp();
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
      "Upgrade-urile sunt **permanente** și se aplică de la următoarea intrare în luptă.\n" +
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

  return new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle("🏆📜  CRONICA SUPRAVIEȚUITORILOR  📜🏆")
    .setDescription(
      "Eventul s-a încheiat.\nUmbrele se retrag, iar cenușa cade încet peste Regat.\n\n" +
      `**Eroii care au rezistat cel mai mult:**\n${top}\n\n` +
      `**Cei Căzuți în Umbre:**\n${topFallen}\n\n` +
      "Regatul Cenușii își amintește de fiecare pas,\nde fiecare lovitură și de fiecare cădere.\nUmbrele îți mulțumesc pentru luptă.",
    );
}

export function combatRow(eventId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ora_attack_${eventId}`).setLabel("Atacă").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
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
