import {
  Client,
  TextChannel,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  MessageFlags,
  ActivityType,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../lib/logger";
import { sendAlert, sendRecoveryAlert, DISCONNECT_ALERT_THRESHOLD_MS } from "./alert";
import { startScheduler, APPLICATION_ID, fireEvent, fireChest, fireChestForced, fireFinalBoss, claimedChests, activeBossMap, getActiveProphecy, type BossState } from "./scheduler";
import {
  upsertPlayer,
  joinEvent,
  getParticipant,
  updateParticipant,
  getActiveEvent,
  addPlayerXp,
  addPlayerGold,
  addPlayerReputation,
  deductPlayerGold,
  buyPlayerUpgrade,
  applyUpgradeToActiveParticipant,
  getTopPlayers,
  recordPlayerDeath,
  recordPlayerRetreat,
  getPlayerById,
  updateMaxLevel,
  setPlayerClass,
  buyCompanion,
  upgradeCompanion,
  buyAbility,
  upgradeAbility,
  applyAbilityLevelToActiveParticipant,
  type AbilityKind,
} from "./db";
import {
  doCombat,
  buildCombatEmbed,
  buildResultText,
  buildDeathEmbed,
  buildRetreatEmbed,
  buildShopEmbed,
  buildLevelupEmbed,
  buildProfileEmbed,
  buildClassEmbed,
  classRows,
  buildCompanionEmbed,
  isCompanionKey,
  combatRow,
  shopRows,
  shopStatsRows,
  shopCompRows,
  shopAbilRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  formatCooldown,
  levelTitle,
  CLASSES,
  isClassKey,
  isAbilityKey,
  upgradeCost,
  COMPANION_BUY_COST,
  ABILITY_BUY_COST,
  UPGRADE_XP_COST,
  SHOP_COUNT_KEY,
  LEVELUP_INTERVAL,
  ABILITY_COOLDOWN_MS,
  buildFinalBossEmbed,
  buildBossLeaderboard,
  computeBossRewards,
  finalBossRow,
  THEME_COLOR,
  BRAND_FOOTER,
  type ShopKey,
  type BossRarity,
} from "./survival";

const GUILD_ID = "1382035307607883816";

let botClient: Client | null = null;
let schedulerStarted = false;
let disconnectAlertTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectStartedAt: Date | null = null;
let botReadyAt: Date | null = null;
let shardStatus: string = "disconnected";

export function isBotOnline(): boolean {
  return botClient !== null && botClient.isReady();
}

export function getBotReadyAt(): Date | null {
  return botReadyAt;
}

export function getShardStatus(): string {
  return shardStatus;
}

export function getBotClient(): Client | null {
  return botClient;
}

export { GUILD_ID };

// Discord Gateway close codes that mean the session cannot be resumed.
// discord.js will NOT auto-reconnect for these; the supervisor must restart.
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4013, 4014]);

const slashCommands = [
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("📜 Statisticile tale din Regatul Cenușii.")
    .addUserOption((opt) =>
      opt.setName("jucator").setDescription("Vezi profilul altui luptător (opțional).").setRequired(false),
    ),
  new SlashCommandBuilder().setName("clasament").setDescription("👑 Top 10 cei mai puternici luptători."),
  new SlashCommandBuilder().setName("magazin").setDescription("🏺 Forja Cenușii — îmbunătățiri permanente, mereu disponibilă."),
  new SlashCommandBuilder().setName("clasa").setDescription("🧬 Alege-ți clasa RPG (alegere permanentă)."),
  new SlashCommandBuilder().setName("companion").setDescription("🐾 Vezi companionul tău (cumpără și fă îmbunătățiri din /magazin)."),
  new SlashCommandBuilder().setName("ajutor").setDescription("❓ Ghidul comenzilor din Regatul Cenușii."),
  new SlashCommandBuilder()
    .setName("startevent")
    .setDescription("🔥 [Admin] Pornește manual Ora Umbrelor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("cufar")
    .setDescription("📦 [Admin] Generează manual un cufăr cu Oboli.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("raritate")
        .setDescription("Raritatea cufărului (random dacă nu alegi)")
        .setRequired(false)
        .addChoices(
          { name: "📦 Random (automat)", value: "random" },
          { name: "🥇 Cufăr de Aur", value: "aur" },
          { name: "💎 Cufăr Mitic", value: "mitic" },
          { name: "🥈 Cufăr de Argint", value: "argint" },
          { name: "🥉 Cufăr de Bronz", value: "bronz" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("multiplicator")
        .setDescription("Bonus Oboli pentru cufărul generat (implicit fără bonus)")
        .setRequired(false)
        .addChoices(
          { name: "1× — Fără bonus", value: "1" },
          { name: "2× — Dublu Oboli", value: "2" },
          { name: "3× — Triplu Oboli", value: "3" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("spawnboss")
    .setDescription("🐉 [Admin] Invocă manual Dragonul Stins pentru test.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("⚙️ [Admin] Controlează botul.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("offline").setDescription("🔴 Trece botul în modul offline (invizibil)."),
    )
    .addSubcommand((sub) =>
      sub.setName("online").setDescription("🟢 Readuce botul online."),
    )
    .addSubcommand((sub) =>
      sub.setName("restart").setDescription("🔄 Repornește botul complet."),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("📊 Verifică starea botului (uptime, events, boss)."),
    ),
];

async function avatarById(discordId: string): Promise<string | null> {
  if (!botClient) return null;
  const cached = botClient.users.cache.get(discordId);
  if (cached) return cached.displayAvatarURL({ size: 256 });
  const u = await Promise.race([
    botClient.users.fetch(discordId).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 1500)),
  ]);
  return u ? u.displayAvatarURL({ size: 256 }) : null;
}

async function handleProfil(interaction: ChatInputCommandInteraction) {
  // Defer first (instant ACK) so a slow DB call can't blow past Discord's 3s
  // interaction deadline and trigger "Unknown interaction" (10062).
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const target = interaction.options.getUser("jucator");
  // Viewing another player: read-only lookup, never create a record for them.
  if (target && target.id !== interaction.user.id) {
    const player = await getPlayerById(target.id);
    if (!player) {
      await interaction.editReply({
        content: `❌ **${target.username}** nu a pășit încă în Regatul Cenușii — nu există un profil pentru acest jucător.`,
      });
      return;
    }
    await interaction.editReply({
      embeds: [buildProfileEmbed(player, undefined, target.displayAvatarURL({ size: 256 }))],
    });
    return;
  }
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({
    embeds: [buildProfileEmbed(p, undefined, interaction.user.displayAvatarURL({ size: 256 }))],
  });
}

async function handleAjutor(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [
      {
        color: THEME_COLOR,
        title: "❓ Ghidul Regatului Cenușii",
        description: "Toate comenzile și evenimentele, grupate pe categorii.",
        fields: [
          {
            name: "📜 Profil & Progres",
            value:
              "**/profil** — profilul tău *(sau `/profil @jucător` pentru altcineva)*\n" +
              "**/clasament** — top 10 luptători *(vezi profilul oricăruia din meniu)*\n" +
              "**/clasa** — alege-ți clasa RPG *(permanent)*\n" +
              "**/companion** — vezi companionul tău",
          },
          {
            name: "🏺 Economie",
            value: "**/magazin** — Forja Cenușii: puteri permanente, companioni și abilități de luptă",
          },
          {
            name: "⚔️ Evenimente automate",
            value:
              "🔥 **Ora Umbrelor** — apare periodic; luptă cu monștri pentru XP și Oboli\n" +
              "📦 **Cufere** — apar prin surprindere; primul care apasă câștigă Obolii\n" +
              "🐉 **Dragonul Stins** — bossul final pe care întregul Regat îl înfruntă împreună",
          },
          {
            name: "⚙️ Administrare",
            value: "**/startevent**, **/cufar**, **/spawnboss**, **/admin** — doar pentru administratori",
          },
        ],
        footer: { text: BRAND_FOOTER },
      },
    ],
    ephemeral: true,
  });
}

async function handleMagazin(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "overview")], components: shopRows(p) });
}

async function isOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.guild && interaction.user.id === interaction.guild.ownerId) return true;
  await interaction.reply({
    content: "🔒 Doar Stăpânul Regatului poate folosi această comandă.",
    ephemeral: true,
  });
  return false;
}

async function handleStartEvent(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  await interaction.reply({ content: "🔥 *Umbrele se mișcă…* Evenimentul pornește!", ephemeral: true });
  if (botClient) await fireEvent(botClient);
}

async function handleSpawnChest(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  const rarityOpt = interaction.options.getString("raritate") ?? "random";
  const multStr = interaction.options.getString("multiplicator") ?? "1";
  const mult = (multStr === "2" || multStr === "3") ? (parseInt(multStr) as 2 | 3) : undefined;
  await interaction.reply({ content: "📦 *Cenușa se ridică…* Un cufăr apare în Regat!", ephemeral: true });
  if (botClient) {
    if (rarityOpt === "random") {
      await fireChest(botClient);
    } else {
      await fireChestForced(botClient, rarityOpt, mult);
    }
  }
}

async function handleSpawnBoss(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ev = await import("./db").then(m => m.getLatestActiveEvent());
  if (!ev) {
    await interaction.editReply({ content: "❌ Nu există niciun event activ. Pornește mai întâi `/startevent`." });
    return;
  }
  await interaction.editReply({ content: "🐉 *Cenușa se întunecă…* Dragonul Stins coboară din Abis!" });
  if (botClient) await fireFinalBoss(botClient, ev.id);
}

async function handleAdmin(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  const sub = interaction.options.getSubcommand();

  if (sub === "offline") {
    botClient?.user?.setPresence({ status: "invisible" });
    await interaction.reply({
      content: "🔴 **Botul a intrat în modul offline.** Apare invizibil pentru utilizatori, dar continuă să ruleze în fundal.",
      ephemeral: true,
    });
    logger.info("Admin: bot set to invisible");
    return;
  }

  if (sub === "online") {
    botClient?.user?.setPresence({
      status: "online",
      activities: [{ name: "Regatul Cenușii", type: ActivityType.Watching }],
    });
    await interaction.reply({
      content: "🟢 **Botul este din nou online!** Stare restaurată.",
      ephemeral: true,
    });
    logger.info("Admin: bot set to online");
    return;
  }

  if (sub === "restart") {
    await interaction.reply({
      content: "🔄 **Repornire în curs…** Botul se va reconecta în câteva secunde.",
      ephemeral: true,
    });
    logger.info("Admin: restart requested — exiting process");
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  if (sub === "status") {
    const uptime = botReadyAt
      ? Math.floor((Date.now() - botReadyAt.getTime()) / 1000)
      : null;
    const uptimeStr = uptime === null
      ? "necunoscut"
      : uptime < 60
        ? `${uptime}s`
        : uptime < 3600
          ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
          : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

    const bossInfo = activeBossMap.size > 0
      ? [...activeBossMap.values()].map((b) =>
          `🐉 Boss Event #${b.eventId} — HP: ${b.currentHp.toLocaleString()}/${b.maxHp.toLocaleString()} | Luptători: ${b.damageBy.size}`,
        ).join("\n")
      : "⚠️ Niciun boss activ";

    await interaction.reply({
      ephemeral: true,
      embeds: [{
        color: 0x2ecc71,
        title: "⚙️ Status Bot — Oracolul Cenușii",
        fields: [
          { name: "🟢 Stare", value: botClient?.isReady() ? "Online" : "Offline", inline: true },
          { name: "⏱️ Uptime", value: uptimeStr, inline: true },
          { name: "🐉 Boss", value: bossInfo },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
    return;
  }
}

async function handleClasament(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const top = await getTopPlayers();
  const medals = ["🥇", "🥈", "🥉"];
  const champAvatar = top[0] ? await avatarById(top[0].discordId) : null;

  const lines = top.map((p, i) => {
    const deathStr = p.deaths > 0 ? ` | 💀 ${p.deaths}×(Niv.${p.deathLevel})` : "";
    const fledStr = p.retreats > 0 ? ` | 🏳️ ${p.retreats}× a fugit` : "";
    return `${medals[i] ?? `**${i + 1}.**`} **${p.username}** — 🎖️ ${levelTitle(p.maxLevel)} · ${p.xp} XP${deathStr}${fledStr}`;
  }).join("\n");

  // One select menu listing every player shown — pick any to view their full profile.
  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (top.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("leaderboard_profile_select")
      .setPlaceholder("📜 Vezi profilul unui luptător…")
      .addOptions(
        top.map((p, i) => ({
          label: `${medals[i] ?? `#${i + 1}`} ${p.username}`.slice(0, 100),
          description: `${levelTitle(p.maxLevel)} · ${p.xp} XP`.slice(0, 100),
          value: p.discordId,
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  await interaction.editReply({
    embeds: [
      {
        color: THEME_COLOR,
        title: "👑 Clasament – Regatul Cenușii",
        description: lines || "*Nimeni nu a luptat încă.*",
        ...(champAvatar ? { thumbnail: { url: champAvatar } } : {}),
        footer: { text: top.length > 0 ? "Alege un luptător din meniu pentru profilul complet" : BRAND_FOOTER },
        timestamp: new Date().toISOString(),
      },
    ],
    components,
  });
}

async function handleViewProfile(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  discordId: string,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const player = await getPlayerById(discordId);
  if (!player) {
    await interaction.editReply({ content: "❌ Jucătorul nu a fost găsit." });
    return;
  }
  await interaction.editReply({
    embeds: [buildProfileEmbed(player, undefined, await avatarById(discordId))],
  });
}

async function handleClasamentSelect(interaction: StringSelectMenuInteraction) {
  const discordId = interaction.values[0];
  await handleViewProfile(interaction, discordId);
}

const CHEST_CLAIM_MSG: Record<string, (user: string, gold: number) => string> = {
  bronz:  (u, g) => `🪙 **${u}** a deschis **Cufărul de Bronz** și a câștigat **${g} Oboli**!`,
  argint: (u, g) => `✨🥈 **${u}** a deschis **Cufărul de Argint** și a câștigat **${g} Oboli**! Argintul strălucește!`,
  aur:    (u, g) => `🌟🥇 **${u}** a deschis **Cufărul de Aur**! **${g} Oboli** aurii se revarsă! 💰💰`,
  mitic:  (u, g) => `💎⚡ **${u}** a deschis un **CUFĂR MITIC**!! **${g} Oboli** răsar din adâncurile timpului! ⚡💎`,
};

async function handleChestClaim(interaction: ButtonInteraction, chestId: string, rarityKey: string, gold: number, multOverride: number = 1) {
  // Ack immediately so the DB writes below can't blow past Discord's 3s deadline
  // (DiscordAPIError 10062). deferUpdate keeps the chest message intact for now.
  await interaction.deferUpdate();
  // has()/add() stay adjacent (no await between) so concurrent clicks can't
  // both pass the guard and double-claim.
  if (claimedChests.has(chestId)) {
    await interaction.followUp({ content: "😔 Cineva a fost mai rapid! Cufărul a fost deja revendicat.", flags: MessageFlags.Ephemeral });
    return;
  }
  claimedChests.add(chestId);

  // Determine effective multiplier: explicit (_x2/_x3 in customId from admin spawn)
  // takes priority; otherwise fall back to the active daily prophecy.
  let effectiveMult = multOverride;
  if (effectiveMult <= 1) {
    const prophecy = getActiveProphecy();
    if (prophecy && prophecy.rarityKey === rarityKey && prophecy.expiresAt > Date.now()) {
      effectiveMult = prophecy.mult;
    }
  }
  const totalGold = gold * effectiveMult;

  await upsertPlayer(interaction.user.id, interaction.user.username);
  await addPlayerGold(interaction.user.id, totalGold);

  const openingRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_opening`)
      .setLabel("Se deschide…")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Revendicat de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );

  await interaction.editReply({ components: [openingRow] });
  await new Promise<void>((r) => setTimeout(r, 900));
  await interaction.message.edit({ components: [disabledRow] }).catch(() => null);

  const claimMsg = CHEST_CLAIM_MSG[rarityKey] ?? CHEST_CLAIM_MSG["bronz"]!;
  await interaction.followUp({ content: claimMsg(interaction.user.username, totalGold) });

  if (effectiveMult > 1) {
    await interaction.followUp({
      content: `🔮 **Profeția s-a împlinit!** Ai primit de **×${effectiveMult}** mai mulți Oboli! (${gold} × ${effectiveMult} = **${totalGold} Oboli**)`,
    });
  }

  logger.info({ discordId: interaction.user.id, chestId, rarityKey, gold, effectiveMult, totalGold }, "Chest claimed");
}

async function handleJoin(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferReply({ ephemeral: true });
  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!" });
    return;
  }
  await upsertPlayer(interaction.user.id, interaction.user.username);
  const participant = await joinEvent(eventId, interaction.user.id, interaction.user.username);
  if (!participant) {
    await interaction.editReply({ content: "⚠️ Eroare la intrarea în event." });
    return;
  }
  if (!participant.isAlive) {
    await interaction.editReply({ embeds: [buildDeathEmbed()], components: [] });
    return;
  }
  if (participant.pendingLevelup) {
    const lvl = Math.floor(participant.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  await interaction.editReply({ embeds: [buildCombatEmbed(participant, "", interaction.user.displayAvatarURL({ size: 256 }))], components: [combatRow(eventId, participant)] });
}

async function handleAttack(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p) {
    await interaction.followUp({ content: "❌ Intră mai întâi în luptă!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!p.isAlive) {
    await interaction.editReply({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel) : buildDeathEmbed()], components: [] });
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }

  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }

  const result = doCombat(p);

  // Class reward multipliers (only matter when a monster is defeated).
  if (result.oboliGained > 0) {
    const pl = await getPlayerById(p.discordId);
    const cls = pl?.class && isClassKey(pl.class) ? CLASSES[pl.class] : null;
    if (cls) {
      result.xpGained = Math.round(result.xpGained * cls.xpMult);
      result.oboliGained = Math.round(result.oboliGained * cls.oboliMult);
    }
  }

  const extra = buildResultText(result);

  if (result.playerDied) {
    const lost = Math.floor(p.oboli * 0.2);
    await updateParticipant(p.id, { isAlive: false, currentHp: 0, empowerNext: false, shieldNext: false });
    await Promise.all([
      deductPlayerGold(p.discordId, lost),
      recordPlayerDeath(p.discordId, p.monsterLevel),
    ]);
    await interaction.editReply({ embeds: [buildDeathEmbed(lost)], components: [] });
    return;
  }

  if (result.oboliGained > 0) {
    await Promise.all([
      addPlayerGold(p.discordId, result.oboliGained),
      addPlayerXp(p.discordId, result.xpGained),
      updateMaxLevel(p.discordId, result.newMonsterLevel),
    ]);
  }

  if (result.levelUp) {
    const newLevel = Math.floor(result.newMonsterLevel / LEVELUP_INTERVAL);
    await updateParticipant(p.id, {
      currentHp: result.newPlayerHp,
      monsterLevel: result.newMonsterLevel,
      monsterCurrentHp: monsterMaxHp(result.newMonsterLevel),
      monsterRarity: result.newMonsterRarity,
      totalDamage: p.totalDamage + result.playerDmg,
      oboli: p.oboli + result.oboliGained,
      pendingLevelup: true,
      empowerNext: false,
      shieldNext: false,
    });
    await interaction.editReply({ embeds: [buildLevelupEmbed(newLevel)], components: levelupRows(eventId) });
    return;
  }

  const updated = await updateParticipant(p.id, {
    currentHp: result.newPlayerHp,
    monsterLevel: result.newMonsterLevel,
    monsterCurrentHp: result.newMonsterHp,
    monsterRarity: result.newMonsterRarity,
    totalDamage: p.totalDamage + result.playerDmg,
    oboli: p.oboli + result.oboliGained,
    empowerNext: false,
    shieldNext: false,
  });

  await interaction.editReply({ embeds: [buildCombatEmbed(updated, extra, interaction.user.displayAvatarURL({ size: 256 }))], components: [combatRow(eventId, updated)] });
}

async function handleRetreat(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p) {
    await interaction.followUp({ content: "❌ Nu ești în nicio luptă!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!p.isAlive) {
    await interaction.editReply({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel) : buildDeathEmbed()], components: [] });
    return;
  }
  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }
  await updateParticipant(p.id, { isAlive: false, fled: true });
  await recordPlayerRetreat(p.discordId, p.monsterLevel);
  await interaction.editReply({ embeds: [buildRetreatEmbed(p.monsterLevel)], components: [] });
}

async function handleBuy(interaction: ButtonInteraction, key: ShopKey) {
  await interaction.deferUpdate();
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  const cost = shopPrice(key, p[SHOP_COUNT_KEY[key]] as number);
  const updated = await buyPlayerUpgrade(interaction.user.id, key, cost);
  if (updated) {
    await applyUpgradeToActiveParticipant(interaction.user.id, key);
  }
  const player = updated ?? p;
  await interaction.editReply({ embeds: [buildShopEmbed(player, "stats")], components: shopStatsRows(player) });
}

async function handleLevelup(interaction: ButtonInteraction, eventId: number, bonus: string) {
  await interaction.deferUpdate();
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p || !p.isAlive || !p.pendingLevelup) {
    await interaction.followUp({ content: "❌ Nu ai un level-up disponibil!", flags: MessageFlags.Ephemeral });
    return;
  }

  const bonusMap: Record<string, Partial<typeof p>> = {
    xp: { oboli: p.oboli + 5 },
    dodge: { dodgeBonus: p.dodgeBonus + 3 },
    atac: { attackBonus: p.attackBonus + 2 },
    hp: { maxHp: p.maxHp + 5, currentHp: Math.min(p.maxHp + 5, p.currentHp + 5) },
    crit: { critBonus: p.critBonus + 1 },
  };

  const bonusValues = bonusMap[bonus] ?? {};
  const updated = await updateParticipant(p.id, { ...bonusValues, pendingLevelup: false });
  await interaction.editReply({ embeds: [buildCombatEmbed(updated, "✨ **Bonus ales! Umbrele îți recunosc puterea.**", interaction.user.displayAvatarURL({ size: 256 }))], components: [combatRow(eventId, updated)] });
}

async function handleClasa(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({
    embeds: [buildClassEmbed(p)],
    components: p.class ? [] : classRows(),
  });
}

async function handleClassPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  await upsertPlayer(interaction.user.id, interaction.user.username);
  const updated = await setPlayerClass(interaction.user.id, key);
  if (!updated) {
    const cur = await getPlayerById(interaction.user.id);
    await interaction.editReply({
      embeds: [cur ? buildClassEmbed(cur) : buildClassEmbed({ class: null } as never)],
      components: [],
    });
    return;
  }
  await interaction.editReply({ embeds: [buildClassEmbed(updated)], components: [] });
}

async function handleCompanion(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({
    embeds: [buildCompanionEmbed(p)],
    components: [],
  });
}

// Shop nav handlers — each opens its sub-page or returns to main.
async function handleShopNavStats(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "stats")], components: shopStatsRows(p) });
}

async function handleShopNavComp(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "comp")], components: shopCompRows(p) });
}

async function handleShopNavAbil(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "abil")], components: shopAbilRows(p) });
}

async function handleShopBack(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "overview")], components: shopRows(p) });
}

async function handleCompBuy(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  await upsertPlayer(interaction.user.id, interaction.user.username);
  if (!isCompanionKey(key)) return;
  const updated = await buyCompanion(interaction.user.id, key, COMPANION_BUY_COST);
  if (!updated) {
    await interaction.followUp({ content: `❌ Nu poți cumpăra acest companion — ai nevoie de **${COMPANION_BUY_COST} Oboli** și să nu ai deja unul.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "comp")], components: shopCompRows(updated) });
}

async function handleCompUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  const cost = upgradeCost(p.companionLevel);
  const updated = await upgradeCompanion(interaction.user.id, p.companionLevel, cost, UPGRADE_XP_COST);
  if (!updated) {
    await interaction.followUp({ content: `❌ Îmbunătățire eșuată — ai nevoie de un companion, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "comp")], components: shopCompRows(updated) });
}

async function handleAbilBuy(interaction: ButtonInteraction, kind: string) {
  await interaction.deferUpdate();
  await upsertPlayer(interaction.user.id, interaction.user.username);
  if (!isAbilityKey(kind)) return;
  const updated = await buyAbility(interaction.user.id, kind as AbilityKind, ABILITY_BUY_COST);
  if (updated) {
    const lvl = kind === "empower" ? updated.abilityEmpowerLevel : updated.abilityShieldLevel;
    await applyAbilityLevelToActiveParticipant(interaction.user.id, kind as AbilityKind, lvl);
  }
  if (!updated) {
    await interaction.followUp({ content: `❌ Nu poți debloca abilitatea — ai nevoie de **${ABILITY_BUY_COST} Oboli** și să nu o deții deja.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil")], components: shopAbilRows(updated) });
}

async function handleAbilUpgrade(interaction: ButtonInteraction, kind: string) {
  await interaction.deferUpdate();
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  if (!isAbilityKey(kind)) return;
  const curLvl = kind === "empower" ? p.abilityEmpowerLevel : p.abilityShieldLevel;
  const cost = upgradeCost(curLvl);
  const updated = await upgradeAbility(interaction.user.id, kind as AbilityKind, curLvl, cost, UPGRADE_XP_COST);
  if (updated) {
    const lvl = kind === "empower" ? updated.abilityEmpowerLevel : updated.abilityShieldLevel;
    await applyAbilityLevelToActiveParticipant(interaction.user.id, kind as AbilityKind, lvl);
  }
  if (!updated) {
    await interaction.followUp({ content: `❌ Îmbunătățire eșuată — ai nevoie de abilitate, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil")], components: shopAbilRows(updated) });
}

async function handleAbility(interaction: ButtonInteraction, eventId: number, kind: string) {
  await interaction.deferUpdate();
  const p = await getParticipant(eventId, interaction.user.id);
  if (!p || !p.isAlive) {
    await interaction.followUp({ content: "❌ Trebuie să fii în luptă ca să folosești abilități!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  const ev = await getActiveEvent(eventId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }
  if (p.abilityReadyAt && p.abilityReadyAt.getTime() > Date.now()) {
    await interaction.followUp({ content: `⏳ Abilitatea e pe cooldown — mai așteaptă **${formatCooldown(p.abilityReadyAt)}**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const readyAt = new Date(Date.now() + ABILITY_COOLDOWN_MS);
  const abilityFlags = kind === "shield" ? { shieldNext: true } : { empowerNext: true };
  const note = kind === "shield"
    ? "🛡️ **Scut de Cenușă activat!** Următorul atac primit va fi înjumătățit."
    : "🌑 **Lovitura Umbrei pregătită!** Următoarea ta lovitură va fi dublă.";
  const updated = await updateParticipant(p.id, { ...abilityFlags, abilityReadyAt: readyAt });
  await interaction.editReply({
    embeds: [buildCombatEmbed(updated, note, interaction.user.displayAvatarURL({ size: 256 }))],
    components: [combatRow(eventId, updated)],
  });
}

const BOSS_HIT_COOLDOWN_MS = 4000;
const EVENT_CHANNEL_ID = "1472579703457190042";

async function handleFinalBoss(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  // Boss fight happens AFTER the event ends — check activeBossMap, not DB active status
  const boss = activeBossMap.get(eventId);
  if (!boss) {
    await interaction.followUp({ content: "⌛ Dragonul nu a fost invocat încă.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (boss.defeated) {
    await interaction.followUp({ content: "💀 Dragonul Stins a fost deja înfrânt de Regat!", flags: MessageFlags.Ephemeral });
    return;
  }

  // Anyone can fight the boss — just need to be registered
  const player = await upsertPlayer(interaction.user.id, interaction.user.username);

  const uid = interaction.user.id;

  // Store username for embed + leaderboard
  boss.playerNames.set(uid, interaction.user.username);

  // Initialize player HP from global max HP (first hit only)
  if (!boss.playerHp.has(uid)) {
    boss.playerHp.set(uid, Math.max(10, 100 + player.maxHpBonus));
  }
  const myHp = boss.playerHp.get(uid)!;
  const myMaxHp = 100 + player.maxHpBonus;

  // Dead players can't attack
  if (myHp <= 0) {
    await interaction.followUp({ content: "💀 Ești căzut în luptă! Dragonul te-a doborât — nu mai poți lovi.", flags: MessageFlags.Ephemeral });
    return;
  }

  // 4-second cooldown per player
  const lastHit = boss.lastHitAt.get(uid) ?? 0;
  const elapsed = Date.now() - lastHit;
  if (elapsed < BOSS_HIT_COOLDOWN_MS) {
    const remaining = Math.ceil((BOSS_HIT_COOLDOWN_MS - elapsed) / 1000);
    await interaction.followUp({
      content: `⏳ Recuperare… mai poți lovi în **${remaining}s**!\n❤️ Viața ta: **${myHp} / ${myMaxHp} HP** | 🐉 Dragon: **${boss.currentHp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP**`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Player damage based on global attack stat
  const minDmg = Math.max(30, player.attackBonus * 5 + 20);
  const maxDmg = Math.max(80, player.attackBonus * 15 + 60);
  const playerDmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;

  // Boss counter-attack — REAL damage to player HP
  const rawBossHit = Math.floor(Math.random() * 121) + 80; // 80–200
  const bossHit = rawBossHit;
  const newPlayerHp = Math.max(0, myHp - bossHit);

  // Apply damage
  boss.lastHitAt.set(uid, Date.now());
  boss.damageBy.set(uid, (boss.damageBy.get(uid) ?? 0) + playerDmg);
  boss.currentHp = Math.max(0, boss.currentHp - playerDmg);
  boss.playerHp.set(uid, newPlayerHp);

  const bossDefeated = boss.currentHp <= 0 && !boss.defeated;

  if (bossDefeated) {
    boss.defeated = true;
    activeBossMap.delete(eventId);

    // Reward everyone who dealt damage — scaled by rank + boss rarity
    const bossRewards = computeBossRewards(boss.damageBy, boss.rarity);
    await Promise.all([...bossRewards.entries()].flatMap(([discordId, r]) => [
      addPlayerReputation(discordId, r.rep),
      addPlayerGold(discordId, r.gold),
      addPlayerXp(discordId, r.xp),
    ]));

    // Delete boss message and send leaderboard
    try {
      const ch = await interaction.client.channels.fetch(EVENT_CHANNEL_ID);
      if (ch instanceof TextChannel) {
        const bossMsg = await ch.messages.fetch(boss.messageId).catch(() => null);
        await bossMsg?.delete().catch(() => null);
        const leaderboard = buildBossLeaderboard(boss, boss.damageBy, boss.participants, boss.playerNames, boss.playerHp);
        await ch.send({ embeds: [leaderboard] }).catch(() => null);
      }
    } catch { /* ignore */ }

    const myReward = bossRewards.get(interaction.user.id);
    const rewLine = myReward
      ? `🏅 Tu primești: **+${myReward.rep} Rep, +${myReward.gold} Oboli, +${myReward.xp} XP**!`
      : `🏅 Recompensele au fost distribuite!`;

    await interaction.followUp({
      content:
        `⚔️ **${interaction.user.username}** a dat lovitura finală! **${playerDmg.toLocaleString()} daune**!\n` +
        `💀 **Dragonul Stins a căzut!** Regatul este salvat!\n` +
        rewLine,
    });
    return;
  }

  // Update boss embed with new HP + live damage list
  try {
    const ch = await interaction.client.channels.fetch(EVENT_CHANNEL_ID);
    if (ch instanceof TextChannel) {
      const bossMsg = await ch.messages.fetch(boss.messageId).catch(() => null);
      if (bossMsg) {
        await bossMsg.edit({
          embeds: [buildFinalBossEmbed(boss.level, boss.rarity, boss.currentHp, boss.maxHp, boss.damageBy, boss.playerNames)],
          components: [finalBossRow(eventId)],
        }).catch(() => null);
      }
    }
  } catch { /* ignore */ }

  const playerStatus = newPlayerHp <= 0
    ? `💀 **Ai fost doborât de Dragon!** Nu mai poți lovi.`
    : `❤️ Viața ta: **${newPlayerHp} / ${myMaxHp} HP**`;

  await interaction.followUp({
    content:
      `⚔️ Ai lovit Dragonul pentru **${playerDmg.toLocaleString()} daune**!\n` +
      `🐉 Dragonul te lovește pentru **${bossHit} daune**! ${playerStatus}\n` +
      `🩸 Dragon: **${boss.currentHp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP**`,
    ephemeral: true,
  });
}


async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith("profile_view_")) {
    return handleViewProfile(interaction, id.replace("profile_view_", ""));
  }

  if (id.startsWith("chest_") && !id.endsWith("_claimed") && !id.endsWith("_expired") && !id.endsWith("_opening")) {
    // New format: chest_{ts}_{rarityKey}_{gold} or with optional _x2/_x3 bonus suffix
    const newMatch = id.match(/^(chest_\d+)_(\w+)_(\d+)(?:_x([23]))?$/);
    if (newMatch) {
      const mult = newMatch[4] ? (parseInt(newMatch[4]!) as 2 | 3) : 1;
      return handleChestClaim(interaction, newMatch[1]!, newMatch[2]!, parseInt(newMatch[3]!), mult);
    }
    // Legacy format: chest_{ts}_{gold}
    const legacyMatch = id.match(/^(chest_\d+)_(\d+)$/);
    if (legacyMatch) {
      return handleChestClaim(interaction, legacyMatch[1]!, "bronz", parseInt(legacyMatch[2]!));
    }
    // Oldest format: chest_{ts} — extract gold from embed
    const simpleMatch = id.match(/^(chest_\d+)$/);
    if (simpleMatch) {
      const msgEmbed = interaction.message.embeds[0];
      const goldMatch = msgEmbed?.description?.match(/\*\*(\d+) Oboli\*\*/);
      const gold = goldMatch ? parseInt(goldMatch[1]!) : 50;
      return handleChestClaim(interaction, simpleMatch[1]!, "bronz", gold);
    }
  }

  if (id.startsWith("ora_join_")) return handleJoin(interaction, parseInt(id.replace("ora_join_", "")));
  if (id.startsWith("ora_attack_")) return handleAttack(interaction, parseInt(id.replace("ora_attack_", "")));
  if (id.startsWith("ora_ability_")) {
    const parts = id.split("_"); // ora_ability_<eventId>_<kind>
    return handleAbility(interaction, parseInt(parts[2]!), parts[3]!);
  }
  if (id.startsWith("ora_retreat_")) return handleRetreat(interaction, parseInt(id.replace("ora_retreat_", "")));
  if (id.startsWith("finalboss_")) return handleFinalBoss(interaction, parseInt(id.replace("finalboss_", "")));
  if (id.startsWith("class_pick_")) return handleClassPick(interaction, id.replace("class_pick_", ""));

  if (id === "shop_nav_stats") return handleShopNavStats(interaction);
  if (id === "shop_nav_comp") return handleShopNavComp(interaction);
  if (id === "shop_nav_abil") return handleShopNavAbil(interaction);
  if (id === "shop_back") return handleShopBack(interaction);

  if (id.startsWith("shop_buy_")) {
    return handleBuy(interaction, id.replace("shop_buy_", "") as ShopKey);
  }
  if (id.startsWith("shop_compbuy_")) return handleCompBuy(interaction, id.replace("shop_compbuy_", ""));
  if (id === "shop_compup") return handleCompUpgrade(interaction);
  if (id.startsWith("shop_abilbuy_")) return handleAbilBuy(interaction, id.replace("shop_abilbuy_", ""));
  if (id.startsWith("shop_abilup_")) return handleAbilUpgrade(interaction, id.replace("shop_abilup_", ""));

  if (id.startsWith("ora_lvlup_")) {
    const parts = id.split("_");
    const bonus = parts[parts.length - 1]!;
    const eventId = parseInt(parts[2]!);
    return handleLevelup(interaction, eventId, bonus);
  }
}

export async function startBot(onReady?: () => void): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot will not start");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // `terminated` rejects when a fatal Gateway close code is received.
  // It stays pending for non-fatal disconnects — discord.js handles those.
  let rejectTerminated!: (err: Error) => void;
  const terminated = new Promise<void>((_, reject) => {
    rejectTerminated = reject;
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "✅ Discord bot online and ready");
    botClient = client;
    botReadyAt = new Date();
    shardStatus = "ready";
    if (!schedulerStarted) {
      schedulerStarted = true;
      startScheduler(client);
    } else {
      logger.info("Scheduler already running — skipping re-init after restart");
    }
    if (onReady) onReady();
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  // Schedule a delayed alert when the shard disconnects non-fatally.
  // disconnectStartedAt must be set by the caller before invoking this.
  function scheduleDisconnectAlert(closeCode: number) {
    if (disconnectAlertTimer) return; // already pending
    const thresholdMin = Math.round(DISCONNECT_ALERT_THRESHOLD_MS / 60_000);
    disconnectAlertTimer = setTimeout(() => {
      disconnectAlertTimer = null;
      void sendAlert(
        `⚠️ **Bot has been offline for over ${thresholdMin} minute${thresholdMin === 1 ? "" : "s"}** and has not reconnected yet.\nShard disconnected with code ${closeCode}. Check server logs for details.`,
      );
    }, DISCONNECT_ALERT_THRESHOLD_MS);
  }

  // Cancel a pending disconnect alert (bot reconnected in time) or send a
  // recovery alert if the outage alert already fired.
  // disconnectStartedAt set + timer pending  → alert not yet sent, suppress it
  // disconnectStartedAt set + timer null     → alert already sent, send recovery
  function clearDisconnectAlert(reason: string) {
    if (disconnectAlertTimer) {
      clearTimeout(disconnectAlertTimer);
      disconnectAlertTimer = null;
      disconnectStartedAt = null;
      logger.info({ reason }, "Disconnect alert suppressed — bot reconnected within threshold");
    } else if (disconnectStartedAt) {
      const startedAt = disconnectStartedAt;
      disconnectStartedAt = null;
      logger.info({ reason }, "Sending recovery alert — bot back online after outage");
      void sendRecoveryAlert(startedAt);
    }
  }

  client.on(Events.ShardDisconnect, (event, shardId) => {
    if (FATAL_CLOSE_CODES.has(event.code)) {
      logger.error(
        { code: event.code, shardId },
        "Fatal Discord disconnect — discord.js will not reconnect; bot supervisor will restart",
      );
      botClient = null;
      shardStatus = "fatal_disconnect";
      client.destroy();
      void sendAlert(
        `🚨 **Bot offline — fatal disconnect (code ${event.code}).**\nDiscord will not auto-reconnect. The bot supervisor is restarting. If it remains offline, check logs and verify \`DISCORD_TOKEN\`.`,
      );
      rejectTerminated(new Error(`Fatal Discord Gateway close code ${event.code}`));
    } else {
      logger.warn(
        { code: event.code, shardId },
        "Discord shard disconnected — discord.js will reconnect automatically",
      );
      shardStatus = "disconnected";
      if (!disconnectStartedAt) disconnectStartedAt = new Date();
      scheduleDisconnectAlert(event.code);
    }
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info({ shardId }, "Discord shard reconnecting…");
    shardStatus = "reconnecting";
  });

  // Session resumed — bot reconnected via the existing session.
  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    clearDisconnectAlert("ShardResume");
    shardStatus = "ready";
    botReadyAt = new Date();
    logger.info({ shardId, replayedEvents }, "Discord shard resumed");
  });

  // Shard ready — bot reconnected via a fresh identify (session expired / not resumable).
  client.on(Events.ShardReady, (shardId) => {
    clearDisconnectAlert("ShardReady");
    shardStatus = "ready";
    botReadyAt = new Date();
    logger.info({ shardId }, "Discord shard ready (fresh identify)");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "profil") await handleProfil(interaction);
        if (interaction.commandName === "clasament") await handleClasament(interaction);
        if (interaction.commandName === "magazin") await handleMagazin(interaction);
        if (interaction.commandName === "clasa") await handleClasa(interaction);
        if (interaction.commandName === "companion") await handleCompanion(interaction);
        if (interaction.commandName === "ajutor") await handleAjutor(interaction);
        if (interaction.commandName === "startevent") await handleStartEvent(interaction);
        if (interaction.commandName === "cufar") await handleSpawnChest(interaction);
        if (interaction.commandName === "spawnboss") await handleSpawnBoss(interaction);
        if (interaction.commandName === "admin") await handleAdmin(interaction);
      } else if (interaction.isButton()) {
        await handleButton(interaction as ButtonInteraction);
      } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "leaderboard_profile_select") {
          await handleClasamentSelect(interaction);
        }
      }
    } catch (err) {
      logger.error({ err }, "Interaction error");
      try {
        if (interaction.isRepliable()) {
          if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({ content: "❌ A apărut o eroare. Încearcă din nou." });
          } else if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({ content: "❌ A apărut o eroare. Încearcă din nou.", flags: MessageFlags.Ephemeral });
          } else {
            await interaction.followUp({ content: "❌ A apărut o eroare. Încearcă din nou.", flags: MessageFlags.Ephemeral });
          }
        }
      } catch {
        // ignore — interaction window may have expired
      }
    }
  });

  await client.login(token);

  const rest = new REST().setToken(token);
  const body = slashCommands.map((c) => c.toJSON());
  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: [] });
  await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID), { body });
  logger.info("Commands registered");

  // Hold here until a fatal disconnect signals the supervisor to restart.
  await terminated;
}
