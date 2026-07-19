import {
  Client,
  Guild,
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
  EmbedBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import { sendAlert, sendRecoveryAlert, DISCONNECT_ALERT_THRESHOLD_MS } from "./alert";
import { startGuildScheduler, stopGuildScheduler, APPLICATION_ID, fireEvent, fireChest, fireChestForced, fireFinalBoss, fireLockedChest, fireKeyChest, recordGuildActivity, getGuildClaimedChests, getGuildActiveBossMap, checkBossEligibility, checkBossHitCooldown, BOSS_HIT_COOLDOWN_MS, checkBossAbilityCooldown, persistBossState, guildStates, isGuildActive, ACTIVITY_WINDOW_MINUTES, CHEST_MSG_MILESTONE, type BossState, type BossPlayerStats } from "./scheduler";
import { getChannel, getAllChannels, setChannel, resetChannel, resetAllChannels, initChannelConfig, hasAnyChannelConfigured, EVENT_LABELS, type EventType } from "./channel-config";
import { recordMessage } from "./oracle";
import { maybeReplyAsOracle, logOracleChatStatus } from "./oracle-chat";
import { handleToxicity } from "./oracle-guard";
import { getRewardMultipliers, getCombatModifiers, formatActiveEffects, formatCombatEffects, grantGuildBoost, grantAdminPlayerBoost, rollChestEffectKind, grantRandomBlessing, grantRandomCurse, buildChestEffectMessage } from "./status-effects";
import { handleBlestem, handleAdminGhid } from "./oracle-blestem";
import { SUPER_ADMIN_ID } from "./constants";
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
  deductPlayerXp,
  buyPlayerUpgrade,
  applyUpgradeToActiveParticipant,
  getTopPlayers,
  getGlobalTopPlayers,
  getServerRanking,
  type ServerRankRow,
  recordPlayerDeath,
  recordPlayerRetreat,
  getPlayerById,
  updateMaxLevel,
  setPlayerClass,
  resetPlayerClass,
  resetPlayerCompanion,
  buyCompanion,
  upgradeCompanion,
  buyAbility,
  upgradeAbility,
  applyAbilityLevelToActiveParticipant,
  addPlayerKey,
  consumePlayerKey,
  deleteActiveBoss,
  clearActiveChest,
  KEYCHEST_DBKEY,
  LOCKCHEST_DBKEY,
  saveTraderMessageId,
  loadTraderMessageId,
  clearTraderMessageId,
  saveTraderEmbedSig,
  loadTraderEmbedSig,
  ensureBotStateTable,
  claimBotInstance,
  getBotInstanceHolder,
  runMultiGuildMigrations,
  resetPlayer,
  resetAllPlayersInGuild,
  buyPrestige,
  prestigeXpCost,
  getPrestigeLevels,
  equipTalisman,
  tryUpgradeTalismanLevel,
  tryDeductPlayerGold,
  getPlayerTalismans,
  saveTalismanLevel,
  getPlayerItems,
  upgradeClass,
  addPlayerItem,
  consumePlayerItems,
  getDailyQuestProgress,
  incrementDailyQuestKill,
  incrementBossKill,
  todayDateUTC,
  type AbilityKind,
  type KeyType,
} from "./db";
import {
  doCombat,
  buildCombatEmbed,
  buildResultText,
  buildDeathEmbed,
  buildRetreatEmbed,
  prestigeGoldMult,
  buildShopEmbed,
  buildLevelupEmbed,
  buildProfileEmbed,
  buildClassEmbed,
  classRows,
  buildCompanionEmbed,
  isCompanionKey,
  companionStats,
  combatRow,
  shopRows,
  shopStatsRows,
  shopCompRows,
  shopAbilRows,
  shopPrestigeRows,
  shopClassRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  monsterSpawnHp,
  isBossFight,
  formatCooldown,
  levelTitle,
  CLASSES,
  COMPANIONS,
  isClassKey,
  classStats,
  classUpgradeCost,
  isAbilityKey,
  upgradeCost,
  COMPANION_BUY_COST,
  ABILITY_BUY_COST,
  UPGRADE_XP_COST,
  SHOP_COUNT_KEY,
  LEVELUP_INTERVAL,
  ABILITY_COOLDOWN_MS,
  empowerMult,
  shieldReduction,
  buildFinalBossEmbed,
  buildBossLeaderboard,
  BOSSES,
  bossIndex,
  FINAL_BOSS_CHARGE_MAX,
  buildLockedChestEmbed,
  buildKeyDropMessage,
  LOCKED_CHEST_GOLD,
  spawnLockedChest,
  rollChest,
  rollChestMultiplier,
  computeBossRewards,
  finalBossRow,
  CHEST_RARITIES,
  KEY_DROP,
  CHEST_KEY_REQUIRED,
  KEY_LABEL,
  KEY_SOURCE_LABEL,
  KEY_EMOJI,
  buildKeyChestClaimMessage,
  rollEventKeyDrops,
  THEME_COLOR,
  BRAND_FOOTER,
  buildTalismanPage,
  shopTalismanRows,
  shopNavRow2,
  TALISMANS,
  TALISMAN_MAX_LEVEL,
  talismanValue,
  talismanUpgradeCost,
  ITEMS,
  DAILY_QUESTS,
  isTalismanKey,
  isItemKey,
  rollItemDrop,
  buildMissionEmbed,
  type ShopKey,
  type BossRarity,
} from "./survival";
import { IMG } from "./assets";

const DEFAULT_GUILD_ID = "1382035307607883816";

let botClient: Client | null = null;

/** Disconnect the Discord client promptly — used by the SIGTERM/SIGINT handler
 *  so a redeploy never leaves a zombie gateway session behind. */
export async function destroyBotClientForShutdown(): Promise<void> {
  const c = botClient;
  botClient = null;
  if (c) await c.destroy();
}

let disconnectAlertTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectStartedAt: Date | null = null;
let botReadyAt: Date | null = null;
let shardStatus: string = "disconnected";

const pendingAdminResets = new Map<string, { targetId: string; targetUsername: string; guildId: string }>();

// ── Per-guild trader state ───────────────────────────────────────────────────
const TRADER_SUCCESS_CHANCE  = 0.30;

const TRADER_OFFERS: Array<{ rarityKey: string; keyType: KeyType; label: string; emoji: string }> = [
  { rarityKey: "argint", keyType: "rar",   label: "Cufăr Blocat de Argint", emoji: "🥈" },
  { rarityKey: "aur",    keyType: "epic",  label: "Cufăr Blocat de Aur",    emoji: "👑" },
  { rarityKey: "regal",  keyType: "regal", label: "Cufărul Regal",          emoji: "⚜️" },
];

const traderMessageIds = new Map<string, string | null>();
const traderSetupInProgress = new Map<string, boolean>();

function getTraderMessageId(guildId: string): string | null {
  return traderMessageIds.get(guildId) ?? null;
}
function setTraderMessageId(guildId: string, id: string | null) {
  traderMessageIds.set(guildId, id);
}
function isTraderSetupInProgress(guildId: string): boolean {
  return traderSetupInProgress.get(guildId) ?? false;
}

// De-dup recently handled interaction IDs
const seenInteractionIds = new Set<string>();
const INTERACTION_DEDUP_TTL_MS = 17 * 60 * 1000;

// ── Single-instance guard ─────────────────────────────────────────────────────
// How often a running instance re-checks the bot_instance marker in the DB.
const INSTANCE_WATCHDOG_INTERVAL_MS = 60_000;

/**
 * True when the bot_instance marker in the DB belongs to ANOTHER process,
 * meaning a newer instance claimed leadership and this one must yield.
 * A null holder (row missing / never claimed) never triggers a yield.
 */
export function shouldYieldLeadership(holder: string | null, instanceId: string): boolean {
  return holder != null && holder !== instanceId;
}

let privilegedIntentFellBack = false;

async function markOracleFellBack(): Promise<void> {
  try {
    const { recordOracleFellBack } = await import("./db");
    await recordOracleFellBack();
  } catch (err) {
    logger.warn({ err }, "Could not persist Oracle fallback marker — the recovery alert may not fire after restart");
  }
}

async function consumeOracleFellBackMarker(): Promise<boolean> {
  try {
    const { consumeOracleFellBack } = await import("./db");
    return await consumeOracleFellBack();
  } catch (err) {
    logger.warn({ err }, "Could not read/clear the Oracle fallback marker after recovery");
    return false;
  }
}

async function sendOnboardingMessage(guild: Guild): Promise<void> {
  const message =
    "👋 **Bun venit în Regatul Cenușii!**\n\n" +
    "Botul a fost adăugat pe serverul tău, dar **nu are canalele configurate** încă.\n" +
    "Folosește comanda `/setcanale seteaza` pentru a configura canalele unde botul va posta:\n\n" +
    "📺 **Cufere și Oracol** — cufere, chei și mesaje Oracol\n" +
    "🔥 **Ora Umbrelor** — evenimentele principale de luptă\n" +
    "🐉 **Dragonul Stins** — boss final\n" +
    "🏺 **Negustorul** — magazinul permanent\n" +
    "🏆 **Top Ora Umbrelor** — clasamentul evenimentelor\n" +
    "🏆 **Top Dragonul Stins** — clasamentul boss-urilor\n\n" +
    "Rulează `/setcanale vezi` pentru a vedea configurația curentă și ce lipsește.";

  try {
    const ownerMember = await guild.fetchOwner().catch(() => null);
    if (ownerMember) {
      await ownerMember.user.send({ content: message });
      logger.info({ guildId: guild.id }, "Sent onboarding DM to guild owner");
      return;
    }
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Could not DM guild owner — trying system channel");
  }

  const systemChannel = guild.systemChannel;
  if (systemChannel) {
    try {
      await systemChannel.send({ content: message });
      logger.info({ guildId: guild.id }, "Sent onboarding message to system channel");
      return;
    } catch (err) {
      logger.warn({ err, guildId: guild.id }, "Could not post onboarding message in system channel");
    }
  }

  logger.warn({ guildId: guild.id }, "No DM or system channel available — onboarding message not delivered");
}

export async function maybeAlertOracleRecovery(
  getMode: () => OracleReplyMode,
  consumeMarker: () => Promise<boolean>,
  alert: (msg: string) => Promise<unknown>,
): Promise<void> {
  if (getMode().mode !== "full") return;
  if (!(await consumeMarker())) return;
  logger.info("Oracle recovered to full-reply mode after a prior fallback — sending recovery alert");
  await alert(
    "\u2705 **Oracolul r\u0103spunde din nou la fiecare reply.**\n" +
      "Inten\u021bia privilegiat\u0103 \u201eMessage Content\u201d este activ\u0103 \u2014 Oracolul a revenit la modul complet \u0219i r\u0103spunde acum la toate mesajele, nu doar la @mention \u0219i reply-uri cu ping.",
  );
}

export function isBotOnline(): boolean {
  return botClient !== null && botClient.isReady();
}

export function getBotReadyAt(): Date | null {
  return botReadyAt;
}

export function getShardStatus(): string {
  return shardStatus;
}

export type OracleReplyMode = {
  mode: "full" | "degraded";
  reason: "active" | "disabled" | "portal_toggle_missing";
};

export function getOracleReplyMode(): OracleReplyMode {
  const enabled = process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true";
  if (!enabled) return { mode: "degraded", reason: "disabled" };
  if (privilegedIntentFellBack) return { mode: "degraded", reason: "portal_toggle_missing" };
  return { mode: "full", reason: "active" };
}

export function getBotClient(): Client | null {
  return botClient;
}

export { DEFAULT_GUILD_ID as GUILD_ID };

const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4013, 4014]);

function isDisallowedIntentError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === 4014 || e.code === "DisallowedIntents") return true;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return msg.includes("disallowed intent") || msg.includes("privileged intent");
}

const slashCommands = [
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("📜 Statisticile tale din Regatul Cenușii.")
    .addUserOption((opt) =>
      opt.setName("jucator").setDescription("Vezi profilul altui luptător (opțional).").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("clasament")
    .setDescription("👑 Clasamentele Regatelor Cenușii.")
    .addSubcommand((sub) =>
      sub.setName("server").setDescription("Top 10 luptători pe serverul curent."),
    )
    .addSubcommand((sub) =>
      sub.setName("global").setDescription("Top 10 luptători din toate serverele."),
    )
    .addSubcommand((sub) =>
      sub.setName("servere").setDescription("🏆 Clasamentul regatelor — cele mai puternice servere."),
    ),
  new SlashCommandBuilder().setName("magazin").setDescription("🏺 Forja Cenușii — îmbunătățiri permanente, mereu disponibilă."),
  new SlashCommandBuilder().setName("clasa").setDescription("🧬 Alege-ți clasa RPG (o poți reseta din /magazin)."),
  new SlashCommandBuilder().setName("companion").setDescription("🐾 Vezi companionul tău (cumpără și fă îmbunătățiri din /magazin)."),
  new SlashCommandBuilder().setName("ajutor").setDescription("❓ Ghidul comenzilor din Regatul Cenușii."),
  new SlashCommandBuilder().setName("misiuni").setDescription("📜 Misiunea ta zilnică — progres și recompensă."),
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
          { name: "👑 Cufărul Regal (blocat automat)", value: "regal" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("tip")
        .setDescription("Tip cufăr: normal (click liber) sau blocat (necesită cheie)")
        .setRequired(false)
        .addChoices(
          { name: "📦 Normal — oricine poate revendica", value: "normal" },
          { name: "🔒 Blocat — necesită cheie", value: "blocat" },
          { name: "🗝️ Cufăr de chei — dă o cheie", value: "cheie" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("cheie")
        .setDescription("Ce cheie dă cufărul de chei (doar pentru tip: cheie)")
        .setRequired(false)
        .addChoices(
          { name: "🗝️ Random (automat)", value: "random" },
          { name: "🗝️ Cheie de Rar", value: "rar" },
          { name: "🔑 Cheie de Epic", value: "epic" },
          { name: "⚜️ Cheie Regală", value: "regal" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("multiplicator")
        .setDescription("Bonus garantat (implicit: lasă șansa surpriză ×1/×2/×3 la deschidere)")
        .setRequired(false)
        .addChoices(
          { name: "1× — Surpriză random (implicit)", value: "1" },
          { name: "2× — Dublu garantat", value: "2" },
          { name: "3× — Triplu garantat", value: "3" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("spawnboss")
    .setDescription("🐉 [Admin] Invocă manual Dragonul Stins pentru test.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("blestem")
    .setDescription("☠️ [Admin] Oracolul aruncă un blestem asupra unui jucător.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName("jucator").setDescription("Jucătorul blestemat.").setRequired(true),
    ),
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
    )
    .addSubcommand((sub) =>
      sub.setName("ghid").setDescription("📖 Lista completă a comenzilor de admin și combinațiilor cu Oracolul."),
    )
    .addSubcommand((sub) =>
      sub.setName("daoboli")
        .setDescription("💰 [Admin] Adaugă Oboli unui jucător.")
        .addUserOption((opt) =>
          opt.setName("jucator").setDescription("Jucătorul care primește Obolii.").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("cantitate").setDescription("Numărul de Oboli (1–9999999).").setRequired(true).setMinValue(1).setMaxValue(9_999_999),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("daxp")
        .setDescription("✨ [Admin] Adaugă XP unui jucător.")
        .addUserOption((opt) =>
          opt.setName("jucator").setDescription("Jucătorul care primește XP-ul.").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("cantitate").setDescription("Numărul de XP (1–9999999).").setRequired(true).setMinValue(1).setMaxValue(9_999_999),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("removeoboli")
        .setDescription("💸 [Admin] Scade Oboli unui jucător.")
        .addUserOption((opt) =>
          opt.setName("jucator").setDescription("Jucătorul de la care se scad Obolii.").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("cantitate").setDescription("Numărul de Oboli de scăzut (1–9999999).").setRequired(true).setMinValue(1).setMaxValue(9_999_999),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("removexp")
        .setDescription("💔 [Admin] Scade XP unui jucător.")
        .addUserOption((opt) =>
          opt.setName("jucator").setDescription("Jucătorul de la care se scade XP-ul.").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("cantitate").setDescription("Numărul de XP de scăzut (1–9999999).").setRequired(true).setMinValue(1).setMaxValue(9_999_999),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("resetprogres")
        .setDescription("⚠️ [Admin] Resetează complet progresul unui jucător (XP, Oboli, nivel, upgrades, chei).")
        .addUserOption((opt) =>
          opt.setName("jucator").setDescription("Jucătorul al cărui progres va fi resetat.").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("resetall")
        .setDescription("💀 [Admin] Resetează progresul TUTUROR jucătorilor de pe server."),
    )
    .addSubcommand((sub) =>
      sub.setName("boost")
        .setDescription("⚡ [Admin] Activează un boost de recompense temporar pentru un jucător sau tot serverul.")
        .addStringOption((opt) =>
          opt.setName("tip")
            .setDescription("Ce tip de recompensă să fie amplificată.")
            .setRequired(true)
            .addChoices(
              { name: "XP", value: "xp" },
              { name: "Oboli (gold)", value: "oboli" },
              { name: "Ambele (XP + Oboli)", value: "ambele" },
            ),
        )
        .addNumberOption((opt) =>
          opt.setName("multiplicator")
            .setDescription("Factorul de amplificare (ex: 2 = dublu, 1.5 = +50%).")
            .setRequired(true)
            .setMinValue(1.1)
            .setMaxValue(10),
        )
        .addIntegerOption((opt) =>
          opt.setName("durata")
            .setDescription("Durata boost-ului în minute (1–1440).")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1440),
        )
        .addUserOption((opt) =>
          opt.setName("jucator").setDescription("Aplică boost-ul doar acestui jucător (gol = tot serverul).").setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("setcanale")
    .setDescription("📺 [Admin] Configurează canalele pentru evenimentele botului.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("vezi").setDescription("👁️ Vezi configurația curentă a canalelor."),
    )
    .addSubcommand((sub) =>
      sub.setName("seteaza").setDescription("✏️ Setează canalul pentru un eveniment.")
        .addStringOption((opt) =>
          opt.setName("eveniment")
            .setDescription("Tipul de eveniment")
            .setRequired(true)
            .addChoices(
              { name: "Cufere și Oracol", value: "main" },
              { name: "Ora Umbrelor", value: "event" },
              { name: "Dragonul Stins", value: "boss" },
              { name: "Negustorul (Forja Cenușii)", value: "trader" },
              { name: "Top Ora Umbrelor", value: "eventTop" },
              { name: "Top Dragonul Stins", value: "bossTop" },
            ),
        )
        .addChannelOption((opt) =>
          opt.setName("canal")
            .setDescription("Canalul țintă")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("reset").setDescription("🔄 Resetează canalul unui eveniment la valoarea implicită.")
        .addStringOption((opt) =>
          opt.setName("eveniment")
            .setDescription("Tipul de eveniment")
            .setRequired(true)
            .addChoices(
              { name: "Cufere și Oracol", value: "main" },
              { name: "Ora Umbrelor", value: "event" },
              { name: "Dragonul Stins", value: "boss" },
              { name: "Negustorul (Forja Cenușii)", value: "trader" },
              { name: "Top Ora Umbrelor", value: "eventTop" },
              { name: "Top Dragonul Stins", value: "bossTop" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("resetall").setDescription("🔄 Resetează toate canalele la valorile implicite."),
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const target = interaction.options.getUser("jucator");
  if (target && target.id !== interaction.user.id) {
    const [player, items] = await Promise.all([
      getPlayerById(target.id, guildId),
      getPlayerItems(target.id, guildId),
    ]);
    if (!player) {
      await interaction.editReply({
        content: `❌ **${target.username}** nu a pășit încă în Regatul Cenușii — nu există un profil pentru acest jucător.`,
      });
      return;
    }
    await interaction.editReply({
      embeds: [buildProfileEmbed(player, undefined, target.displayAvatarURL({ size: 256 }), items)],
    });
    return;
  }
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({
    embeds: [buildProfileEmbed(p, undefined, interaction.user.displayAvatarURL({ size: 256 }), items)],
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
            value:
              "**/magazin** — Forja Cenușii: puteri permanente, companioni și abilități de luptă\n" +
              "**/misiuni** — misiunea ta zilnică *(ucide 10 monștri → Coamă de Dragon)*",
          },
          {
            name: "⚔️ Evenimente automate",
            value:
              "🔥 **Ora Umbrelor** — apare periodic; luptă cu monștri pentru XP și Oboli\n" +
              "📦 **Cufere** — apar prin surprindere; primul care apasă câștigă Obolii *(cu șansă de bonus ×2 sau ×3 la deschidere!)*\n" +
              "🐉 **Dragonul Stins** — bossul final pe care întregul Regat îl înfruntă împreună",
          },
          {
            name: "🗝️ Chei & Cufere blocate",
            value:
              "🗝️ **Cufere de chei** — apar din când în când; primul care apasă ia cheia\n" +
              "🔒 **Cufere blocate** — necesită o cheie, dar plătesc mult mai mulți Oboli *(cel Regal e jackpot)*\n" +
              "✨ Cheile pică rar și din cuferele obișnuite și din prada Dragonului — vezi-le pe **/profil**",
          },
        ],
        footer: { text: BRAND_FOOTER },
      },
    ],
    ephemeral: true,
  });
}

async function handleMisiune(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;
  const today = todayDateUTC();
  const row = await getDailyQuestProgress(discordId, guildId, "kill_10");
  const embed = buildMissionEmbed(
    "kill_10",
    row?.progress ?? 0,
    row?.completed ?? false,
    row?.rewardGiven ?? false,
    row?.questDate ?? null,
    today,
  );
  await interaction.editReply({ embeds: [embed] });
}

async function handleMagazin(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "overview")], components: shopRows(p) });
}

async function isOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.user.id === SUPER_ADMIN_ID) return true;
  await interaction.reply({
    content: "🔒 Nu ai permisiunea să folosești această comandă.",
    ephemeral: true,
  });
  return false;
}

async function handleStartEvent(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  const guildId = interaction.guildId!;
  await interaction.reply({ content: "🔥 *Umbrele se mișcă…* Evenimentul pornește!", ephemeral: true });
  if (botClient) await fireEvent(botClient, guildId);
}

async function handleSpawnChest(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  const guildId = interaction.guildId!;
  const rarityOpt = interaction.options.getString("raritate") ?? "random";
  const tipOpt = interaction.options.getString("tip") ?? "normal";
  const multStr = interaction.options.getString("multiplicator") ?? "1";
  const mult = (multStr === "2" || multStr === "3") ? (parseInt(multStr) as 2 | 3) : undefined;

  if (tipOpt === "cheie") {
    const keyOpt = interaction.options.getString("cheie") ?? "random";
    await interaction.reply({ content: "🗝️ *Cenușa zornăie…* Un cufăr de chei apare în Regat!", ephemeral: true });
    if (botClient) await fireKeyChest(botClient, guildId, keyOpt, true);
    return;
  }

  const isLocked = tipOpt === "blocat" || rarityOpt === "regal";

  if (isLocked) {
    const lockedRarity = rarityOpt === "random" ? "argint" : rarityOpt;
    await interaction.reply({ content: "🔒 *Cenușa se ridică…* Un cufăr blocat apare în Regat!", ephemeral: true });
    if (botClient) await fireLockedChest(botClient, guildId, lockedRarity);
  } else {
    await interaction.reply({ content: "📦 *Cenușa se ridică…* Un cufăr apare în Regat!", ephemeral: true });
    if (botClient) {
      if (rarityOpt === "random") {
        if (mult != null) {
          const { rarity } = rollChest();
          await fireChestForced(botClient, guildId, rarity.key, mult);
        } else {
          await fireChest(botClient, guildId, true);
        }
      } else {
        await fireChestForced(botClient, guildId, rarityOpt, mult);
      }
    }
  }
}

async function handleSpawnBoss(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  const guildId = interaction.guildId!;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ev = await import("./db").then(m => m.getLatestActiveEvent(guildId));
  if (!ev) {
    await interaction.editReply({ content: "❌ Nu există niciun event activ. Pornește mai întâi `/startevent`." });
    return;
  }
  await interaction.editReply({ content: "🐉 *Cenușa se întunecă…* Dragonul Stins coboară din Abis!" });
  if (botClient) await fireFinalBoss(botClient, guildId, ev.id);
}

// ─── /admin status — pure formatting helpers (exported for unit tests) ────────

/** Human-readable time since `lastActivityAt`. Exported for unit tests. */
export function formatLastMsgStr(lastActivityAt: number, _now: number): string {
  if (lastActivityAt === 0) return "niciodată (de la pornire)";
  return `<t:${Math.floor(lastActivityAt / 1000)}:R>`;
}

/** Activity gate label shown in /admin status. Exported for unit tests. */
export function formatActivityStatus(lastActivityAt: number, now: number): string {
  const active = isGuildActive(lastActivityAt, ACTIVITY_WINDOW_MINUTES * 60_000, now);
  return active
    ? `✅ Activ (fereastră: ${ACTIVITY_WINDOW_MINUTES}min)`
    : `😴 Tăcut (niciun mesaj în ultimele ${ACTIVITY_WINDOW_MINUTES}min)`;
}

/** Chest-milestone progress string. Exported for unit tests. */
export function formatMilestoneStr(activityMsgCount: number): string {
  return `${activityMsgCount}/${CHEST_MSG_MILESTONE}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleAdmin(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "ghid") { await handleAdminGhid(interaction); return; }
  if (!(await isOwner(interaction))) return;
  const guildId = interaction.guildId!;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (sub === "offline") {
    botClient?.user?.setPresence({ status: "invisible" });
    await interaction.editReply({
      content: "🔴 **Botul a intrat în modul offline.** Apare invizibil pentru utilizatori, dar continuă să ruleze în fundal.",
    });
    logger.info("Admin: bot set to invisible");
    return;
  }

  if (sub === "online") {
    botClient?.user?.setPresence({
      status: "online",
      activities: [{ name: "Regatul Cenușii", type: ActivityType.Watching }],
    });
    await interaction.editReply({
      content: "🟢 **Botul este din nou online!** Stare restaurată.",
    });
    logger.info("Admin: bot set to online");
    return;
  }

  if (sub === "restart") {
    await interaction.editReply({
      content: "🔄 **Repornire în curs…** Botul se va reconecta în câteva secunde.",
    });
    logger.info("Admin: restart requested — exiting process");
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  if (sub === "resetprogres") {
    const target = interaction.options.getUser("jucator", true);
    const confirmId = `admin_reset_confirm_${target.id}_${guildId}`;
    pendingAdminResets.set(confirmId, { targetId: target.id, targetUsername: target.username, guildId });
    setTimeout(() => pendingAdminResets.delete(confirmId), 2 * 60 * 1000);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel("✅ Da, resetează").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("admin_reset_cancel").setLabel("❌ Anulează").setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({
      content:
        `⚠️ **Confirmare necesară**\n\nEști sigur că vrei să resetezi **COMPLET** progresul lui **${target.username}**?\n\n` +
        `> XP, Oboli, nivel, clasă, companion, abilități, upgrade-uri, chei — **totul** se șterge.\n> Această acțiune **nu poate fi anulată**.`,
      components: [row],
    });
    return;
  }

  if (sub === "resetall") {
    const confirmId = `admin_resetall_confirm_${guildId}`;
    pendingAdminResets.set(confirmId, { targetId: "ALL", targetUsername: "TOȚI JUCĂTORII", guildId });
    setTimeout(() => pendingAdminResets.delete(confirmId), 2 * 60 * 1000);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel("💀 Da, resetează tot serverul").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("admin_reset_cancel").setLabel("❌ Anulează").setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({
      content:
        `💀 **ATENȚIE MAXIMĂ**\n\nEști pe cale să resetezi progresul **TUTUROR** jucătorilor de pe server!\n\n` +
        `> Aceasta va șterge tot XP, Oboli, nivel, clase, companioane, upgrades și chei pentru fiecare jucător.\n> Această acțiune **NU POATE FI ANULATĂ**.`,
      components: [row],
    });
    return;
  }

  if (sub === "boost") {
    const tip = interaction.options.getString("tip", true) as "xp" | "oboli" | "ambele";
    const multiplicator = interaction.options.getNumber("multiplicator", true);
    const durata = interaction.options.getInteger("durata", true);
    const target = interaction.options.getUser("jucator", false);
    const durationMs = durata * 60 * 1000;
    const xpMult = tip === "oboli" ? 1 : multiplicator;
    const goldMult = tip === "xp" ? 1 : multiplicator;
    const tipLabel = tip === "xp" ? "XP" : tip === "oboli" ? "Oboli" : "XP + Oboli";
    const durataLabel = durata >= 60 ? `${Math.floor(durata / 60)}h${durata % 60 > 0 ? ` ${durata % 60}m` : ""}` : `${durata}m`;
    if (target) {
      const player = await getPlayerById(target.id, guildId);
      if (!player) {
        await interaction.editReply({ content: `❌ **${target.username}** nu are profil pe acest server.` });
        return;
      }
      grantAdminPlayerBoost(target.id, xpMult, goldMult, durationMs);
      await interaction.editReply({
        embeds: [{
          color: THEME_COLOR,
          description:
            `⚡ **Boost activat pentru ${target.username}!**\n\n` +
            `🎯 Tip: **${tipLabel}** × **${multiplicator}**\n⏳ Durată: **${durataLabel}**\n\n` +
            `*Se aplică la toate recompensele din luptă și cufere.*`,
        }],
      });
      logger.info({ targetId: target.id, guildId, tip, multiplicator, durata }, "Admin: player boost granted");
    } else {
      grantGuildBoost(guildId, xpMult, goldMult, durationMs);
      await interaction.editReply({
        embeds: [{
          color: THEME_COLOR,
          description:
            `⚡ **Boost SERVER activat!**\n\n` +
            `🎯 Tip: **${tipLabel}** × **${multiplicator}**\n⏳ Durată: **${durataLabel}**\n\n` +
            `*Toți jucătorii de pe server primesc acest bonus la recompensele din luptă și cufere.*`,
        }],
      });
      logger.info({ guildId, tip, multiplicator, durata }, "Admin: guild boost granted");
    }
    return;
  }

  if (sub === "daoboli") {
    const target = interaction.options.getUser("jucator", true);
    const amount = interaction.options.getInteger("cantitate", true);
    const player = await getPlayerById(target.id, guildId);
    if (!player) {
      await interaction.editReply({ content: `❌ **${target.username}** nu are încă un profil pe acest server.` });
      return;
    }
    await addPlayerGold(target.id, guildId, amount);
    await interaction.editReply({
      embeds: [{
        color: THEME_COLOR,
        description: `💰 **+${amount.toLocaleString("ro-RO")} Oboli** adăugați lui **${target.username}**.\nNou total: **${(player.gold + amount).toLocaleString("ro-RO")} Oboli**.`,
      }],
    });
    logger.info({ targetId: target.id, guildId, amount }, "Admin: gold granted");
    return;
  }

  if (sub === "daxp") {
    const target = interaction.options.getUser("jucator", true);
    const amount = interaction.options.getInteger("cantitate", true);
    const player = await getPlayerById(target.id, guildId);
    if (!player) {
      await interaction.editReply({ content: `❌ **${target.username}** nu are încă un profil pe acest server.` });
      return;
    }
    await addPlayerXp(target.id, guildId, amount);
    await interaction.editReply({
      embeds: [{
        color: THEME_COLOR,
        description: `✨ **+${amount.toLocaleString("ro-RO")} XP** adăugat lui **${target.username}**.\nNou total: **${(player.xp + amount).toLocaleString("ro-RO")} XP**.`,
      }],
    });
    logger.info({ targetId: target.id, guildId, amount }, "Admin: XP granted");
    return;
  }

  if (sub === "removeoboli") {
    const target = interaction.options.getUser("jucator", true);
    const amount = interaction.options.getInteger("cantitate", true);
    const player = await getPlayerById(target.id, guildId);
    if (!player) {
      await interaction.editReply({ content: `❌ **${target.username}** nu are încă un profil pe acest server.` });
      return;
    }
    await deductPlayerGold(target.id, guildId, amount);
    const newGold = Math.max(0, player.gold - amount);
    await interaction.editReply({
      embeds: [{
        color: THEME_COLOR,
        description: `💸 **-${amount.toLocaleString("ro-RO")} Oboli** scăzuți de la **${target.username}**.\nNou total: **${newGold.toLocaleString("ro-RO")} Oboli**.`,
      }],
    });
    logger.info({ targetId: target.id, guildId, amount }, "Admin: gold removed");
    return;
  }

  if (sub === "removexp") {
    const target = interaction.options.getUser("jucator", true);
    const amount = interaction.options.getInteger("cantitate", true);
    const player = await getPlayerById(target.id, guildId);
    if (!player) {
      await interaction.editReply({ content: `❌ **${target.username}** nu are încă un profil pe acest server.` });
      return;
    }
    await deductPlayerXp(target.id, guildId, amount);
    const newXp = Math.max(0, player.xp - amount);
    await interaction.editReply({
      embeds: [{
        color: THEME_COLOR,
        description: `💔 **-${amount.toLocaleString("ro-RO")} XP** scăzut de la **${target.username}**.\nNou total: **${newXp.toLocaleString("ro-RO")} XP**.`,
      }],
    });
    logger.info({ targetId: target.id, guildId, amount }, "Admin: XP removed");
    return;
  }

  if (sub === "status") {
    const now = Date.now();

    const uptime = botReadyAt
      ? Math.floor((now - botReadyAt.getTime()) / 1000)
      : null;
    const uptimeStr = uptime === null
      ? "necunoscut"
      : uptime < 60
        ? `${uptime}s`
        : uptime < 3600
          ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
          : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

    const activeBossMap = getGuildActiveBossMap(guildId);
    const bossInfo = activeBossMap.size > 0
      ? [...activeBossMap.values()].map((b) =>
          `🐉 Boss Event #${b.eventId} — HP: ${b.currentHp.toLocaleString()}/${b.maxHp.toLocaleString()} | Luptători: ${b.damageBy.size}`,
        ).join("\n")
      : "⚠️ Niciun boss activ";

    const gs = guildStates.get(guildId);
    const lastActivityAt = gs?.lastActivityAt ?? 0;
    const activityMsgCount = gs?.activityMsgCount ?? 0;

    const lastMsgStr = formatLastMsgStr(lastActivityAt, now);
    const activityStatus = formatActivityStatus(lastActivityAt, now);
    const milestoneStr = formatMilestoneStr(activityMsgCount);

    await interaction.editReply({
      embeds: [{
        color: 0x2ecc71,
        title: "⚙️ Status Bot — Oracolul Cenușii",
        fields: [
          { name: "🟢 Stare", value: botClient?.isReady() ? "Online" : "Offline", inline: true },
          { name: "⏱️ Uptime", value: uptimeStr, inline: true },
          { name: "💬 Ultimul mesaj", value: lastMsgStr, inline: true },
          { name: "📊 Activitate server", value: activityStatus, inline: true },
          { name: "🎁 Progres milestone", value: milestoneStr, inline: true },
          { name: "🐉 Boss", value: bossInfo },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
    return;
  }
}

async function handleSetCanale(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (sub === "vezi") {
    const keys = Object.keys(EVENT_LABELS) as EventType[];
    const lines = keys.map((k) => {
      const id = getChannel(k, guildId);
      if (id) {
        return `✅ **${EVENT_LABELS[k]}**\n> Canal: <#${id}> (\`${id}\`)`;
      }
      return `❌ **${EVENT_LABELS[k]}**\n> *Neconfigurat — folosește \`/setcanale seteaza\` pentru a seta canalul.*`;
    });
    const allConfigured = keys.every((k) => getChannel(k, guildId) !== null);
    const header = allConfigured
      ? "✅ Toate canalele sunt configurate.\n\n"
      : "⚠️ **Unele canale lipsesc.** Botul va sări evenimentele pentru canalele neconfigurate.\nFolosește `/setcanale seteaza` pentru a le configura.\n\n";
    await interaction.editReply({
      content: header + lines.join("\n\n"),
    });
    return;
  }

  if (sub === "seteaza") {
    const eventKey = interaction.options.getString("eveniment", true) as EventType;
    const channel = interaction.options.getChannel("canal", true);
    if (!channel) {
      await interaction.editReply({ content: "❌ Alege un canal valid." });
      return;
    }
    await setChannel(guildId, eventKey, channel.id);
    await interaction.editReply({
      content: `✅ **${EVENT_LABELS[eventKey]}** va fi acum postat în <#${channel.id}>`,
    });
    logger.info({ eventKey, channelId: channel.id, userId: interaction.user.id, guildId }, "Channel configured via /setcanale");
    return;
  }

  if (sub === "reset") {
    const eventKey = interaction.options.getString("eveniment", true) as EventType;
    await resetChannel(guildId, eventKey);
    await interaction.editReply({
      content: `🔄 Canalul pentru **${EVENT_LABELS[eventKey]}** a fost resetat la valoarea implicită.`,
    });
    return;
  }

  if (sub === "resetall") {
    await resetAllChannels(guildId);
    await interaction.editReply({
      content: "🔄 Toate canalele au fost resetate la valorile implicite.",
    });
    return;
  }
}

async function handleClasament(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand(false);

  // ── /clasament servere ──────────────────────────────────────────────────────
  if (sub === "servere") {
    const ranking = await getServerRanking();
    const medals = ["🥇", "🥈", "🥉"];
    const lines = ranking.map((row: ServerRankRow, i) => {
      const name = interaction.client.guilds.cache.get(row.guildId)?.name ?? `Regat necunoscut`;
      const playerWord = row.playerCount === 1 ? "luptător" : "luptători";
      return `${medals[i] ?? `**${i + 1}.**`} **${name}** — ⭐ ${row.totalReputation.toLocaleString("ro-RO")} Reputație · 🏅 Niv. ${row.maxEventLevel} · 👥 ${row.playerCount} ${playerWord}`;
    }).join("\n");

    await interaction.editReply({
      embeds: [
        {
          color: THEME_COLOR,
          title: "🏆 Clasamentul Regatelor Cenușii",
          description: lines || "*Niciun regat nu și-a scris încă legenda.*",
          footer: { text: "Clasament calculat după reputația totală acumulată de toți luptătorii" },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    return;
  }

  // ── /clasament server | /clasament global ──────────────────────────────────
  const isGlobal = sub === "global";
  const top = isGlobal ? await getGlobalTopPlayers() : await getTopPlayers(guildId);
  const medals = ["🥇", "🥈", "🥉"];
  const champAvatar = top[0] ? await avatarById(top[0].discordId) : null;

  const lines = top.map((p, i) => {
    const deathStr = p.deaths > 0 ? ` | 💀 ${p.deaths}×` : "";
    const serverTag = isGlobal ? ` *(${interaction.client.guilds.cache.get(p.guildId)?.name ?? "Regat necunoscut"})* ` : "";
    const repStr = p.reputation > 0 ? `⭐ ${p.reputation.toLocaleString("ro-RO")} Rep.` : "⭐ 0 Rep.";
    const levelStr = p.maxLevel > 0 ? ` · 🏅 Niv. ${p.maxLevel}` : "";
    const prestigeStr = p.prestigeLevel > 0 ? ` · 💎 Prestigiu ${p.prestigeLevel}` : "";
    return `${medals[i] ?? `**${i + 1}.**`} **${p.username}**${serverTag} — ${repStr}${levelStr}${prestigeStr}${deathStr}`;
  }).join("\n");

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (top.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("leaderboard_profile_select")
      .setPlaceholder("📜 Vezi profilul unui luptător…")
      .addOptions(
        top.map((p, i) => ({
          label: `${medals[i] ?? `#${i + 1}`} ${p.username}`.slice(0, 100),
          description: `⭐ ${p.reputation.toLocaleString("ro-RO")} Rep. · 🏅 Niv. ${p.maxLevel}${p.prestigeLevel > 0 ? ` · 💎 Prestigiu ${p.prestigeLevel}` : ""}`.slice(0, 100),
          value: p.discordId,
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  const title = isGlobal
    ? "🌍 Clasament Global — Toate Regatele Cenușii"
    : "👑 Clasament — Regatul Cenușii";

  await interaction.editReply({
    embeds: [
      {
        color: THEME_COLOR,
        title,
        description: lines || "*Nimeni nu a luptat încă.*",
        ...(champAvatar ? { thumbnail: { url: champAvatar } } : {}),
        footer: { text: top.length > 0 ? "Clasament după Reputație și Nivel Eveniment · Alege un luptător pentru profil complet" : BRAND_FOOTER },
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
  const guildId = interaction.guildId!;
  const player = await getPlayerById(discordId, guildId);
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

const CLAIM_TTL_MS = 10 * 60 * 1000;

const CHEST_CLAIM_MSG: Record<string, (user: string, gold: number) => string> = {
  bronz:  (u, g) => `🪙 **${u}** a deschis **Cufărul de Bronz** și a câștigat **${g} Oboli**!`,
  argint: (u, g) => `✨🥈 **${u}** a deschis **Cufărul de Argint** și a câștigat **${g} Oboli**! Argintul strălucește!`,
  aur:    (u, g) => `🌟🥇 **${u}** a deschis **Cufărul de Aur**! **${g} Oboli** aurii se revarsă! 💰💰`,
  mitic:  (u, g) => `💎⚡ **${u}** a deschis un **CUFĂR MITIC**!! **${g} Oboli** răsar din adâncurile timpului! ⚡💎`,
};

async function handleChestClaim(interaction: ButtonInteraction, chestId: string, rarityKey: string, gold: number, multOverride: number = 1) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const claimedChests = getGuildClaimedChests(guildId);

  if (claimedChests.has(chestId)) {
    await interaction.followUp({ content: "😔 Cineva a fost mai rapid! Cufărul a fost deja revendicat.", flags: MessageFlags.Ephemeral });
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(guildId).catch(() => null);

  const effectiveMult = multOverride > 1 ? multOverride : rollChestMultiplier();
  const rmods = getRewardMultipliers(interaction.user.id, guildId);
  const totalGold = Math.round(gold * effectiveMult * rmods.goldMult);

  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await addPlayerGold(interaction.user.id, guildId, totalGold);

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
  setTimeout(() => { void interaction.message.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const claimMsg = CHEST_CLAIM_MSG[rarityKey] ?? CHEST_CLAIM_MSG["bronz"]!;
  const claimReply = await interaction.followUp({ content: claimMsg(interaction.user.username, totalGold) });
  setTimeout(() => { void claimReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const revealContent = effectiveMult > 1
    ? `🎲 **Norocul Cenușii!** A picat **×${effectiveMult}**! Obolii s-au înmulțit (${gold} × ${effectiveMult} = **${totalGold} Oboli**)! ${effectiveMult === 3 ? "🔥🔥🔥" : "✨"}`
    : `🎲 **Norocul Cenușii:** a picat **×1** de data asta — fără bonus. Ai primit **${gold} Oboli**.`;
  const bonusReply = await interaction.followUp({ content: revealContent });
  setTimeout(() => { void bonusReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const keyDrop = KEY_DROP[rarityKey];
  if (keyDrop && Math.random() < keyDrop.chance) {
    const keyType = keyDrop.keyType as KeyType;
    await addPlayerKey(interaction.user.id, guildId, keyType);
    const keyDropReply = await interaction.followUp({ content: buildKeyDropMessage(rarityKey, keyType) });
    setTimeout(() => { void keyDropReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    logger.info({ discordId: interaction.user.id, chestId, rarityKey, keyType }, "Key dropped");
  }

  const effectKind = rollChestEffectKind(rarityKey);
  if (effectKind) {
    const effectDef = effectKind === "blessing"
      ? grantRandomBlessing(interaction.user.id)
      : grantRandomCurse(interaction.user.id);
    const effectReply = await interaction.followUp({ content: buildChestEffectMessage(interaction.user.username, effectDef) });
    setTimeout(() => { void effectReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    logger.info({ discordId: interaction.user.id, chestId, rarityKey, effectKind, effectId: effectDef.id }, "Chest effect granted");
  }

  logger.info({ discordId: interaction.user.id, chestId, rarityKey, gold, effectiveMult, totalGold }, "Chest claimed");
}

async function handleLockedChestClaim(interaction: ButtonInteraction, chestId: string, rarityKey: string, gold: number) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const claimedChests = getGuildClaimedChests(guildId);

  const keyType = CHEST_KEY_REQUIRED[rarityKey] as KeyType | undefined;
  if (!keyType) {
    await interaction.followUp({ content: "❌ Cufăr necunoscut.", flags: MessageFlags.Ephemeral });
    return;
  }
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const sourceLabel = KEY_SOURCE_LABEL[keyType] ?? "cufere comune";

  const keyConsumed = await consumePlayerKey(interaction.user.id, guildId, keyType);
  if (!keyConsumed) {
    await interaction.followUp({
      content:
        `🔒 **Nu ai ${keyLabel}!**\n` +
        `Obți cheia revendicând **${sourceLabel}** — ai noroc la revendicare!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (claimedChests.has(chestId)) {
    await addPlayerKey(interaction.user.id, guildId, keyType);
    await interaction.followUp({
      content: `😔 Cineva a fost mai rapid! **${keyLabel}** ta a fost returnată. Folosește-o la alt cufăr blocat!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(guildId, LOCKCHEST_DBKEY).catch(() => null);

  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const lockedRmods = getRewardMultipliers(interaction.user.id, guildId);
  const boostedGold = Math.round(gold * lockedRmods.goldMult);
  await addPlayerGold(interaction.user.id, guildId, boostedGold);

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Deschis de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => null);
  setTimeout(() => { void interaction.message.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const rarity = CHEST_RARITIES.find((r) => r.key === rarityKey);
  const rarityLabel = rarity?.label ?? rarityKey;
  const boostLine = lockedRmods.goldMult > 1.01 ? ` *(boost ×${lockedRmods.goldMult.toFixed(2)} activ!)*` : "";
  const lockedReply = await interaction.followUp({
    content:
      `🗝️ **${interaction.user.username}** a folosit **${keyLabel}** și a deschis **${rarityLabel}**!\n` +
      `💰 **${boostedGold} Oboli** eliberați din cufărul blocat!${boostLine}`,
  });
  setTimeout(() => { void lockedReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const lockedEffectKind = rollChestEffectKind(rarityKey, true);
  if (lockedEffectKind === "blessing") {
    const effectDef = grantRandomBlessing(interaction.user.id);
    const effectReply = await interaction.followUp({ content: buildChestEffectMessage(interaction.user.username, effectDef) });
    setTimeout(() => { void effectReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    logger.info({ discordId: interaction.user.id, chestId, rarityKey, effectId: effectDef.id }, "Locked chest blessing granted");
  }

  logger.info({ discordId: interaction.user.id, chestId, rarityKey, gold, keyType }, "Locked chest claimed");
}

async function handleKeyChestClaim(interaction: ButtonInteraction, chestId: string, keyType: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const claimedChests = getGuildClaimedChests(guildId);

  if (claimedChests.has(chestId)) {
    await interaction.followUp({ content: "😔 Cineva a fost mai rapid! Cheia a fost deja luată.", flags: MessageFlags.Ephemeral });
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(guildId, KEYCHEST_DBKEY).catch(() => null);

  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await addPlayerKey(interaction.user.id, guildId, keyType as KeyType);

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Luat de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => null);
  setTimeout(() => { void interaction.message.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const keyChestReply = await interaction.followUp({ content: buildKeyChestClaimMessage(interaction.user.username, keyType) });
  setTimeout(() => { void keyChestReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  logger.info({ discordId: interaction.user.id, chestId, keyType }, "Key chest claimed");
}

async function handleTraderClaim(interaction: ButtonInteraction, rarityKey: string) {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId!;

  const offer = TRADER_OFFERS.find((o) => o.rarityKey === rarityKey);
  if (!offer) {
    await interaction.editReply({ content: "❌ Ofertă necunoscută la negustor." });
    return;
  }

  const keyConsumed = await consumePlayerKey(interaction.user.id, guildId, offer.keyType);
  if (!keyConsumed) {
    const keyLabel = KEY_LABEL[offer.keyType] ?? "Cheie";
    await interaction.editReply({
      content: `🔒 **Nu ai ${keyLabel}!**
Negustorul închide gratiile către tine...
Obți cheia revendicând cufere de chei sau învingând evenimente!`,
    });
    return;
  }

  const success = Math.random() < TRADER_SUCCESS_CHANCE;

  if (!success) {
    const keyLabel = KEY_LABEL[offer.keyType] ?? "Cheie";
    const lines = [
      `💥 **Cheia ta ${keyLabel} s-a rupt în broască!**`,
      `
✨ *Negustorul scutură capul în tăcere...*`,
      `💀 Cheia s-a sfărâmat și comoara rămâne închisă.`,
    ];
    await interaction.editReply({ content: lines.join("\n") });
    logger.info({ discordId: interaction.user.id, rarityKey, keyType: offer.keyType, result: "broken" }, "Trader key broke");
    return;
  }

  const result = spawnLockedChest(rarityKey);
  const mult = rollChestMultiplier();
  const traderRmods = getRewardMultipliers(interaction.user.id, guildId);
  if (!result) {
    const baseGold = Math.floor(Math.random() * 200) + 100;
    const gold = Math.round(baseGold * mult * traderRmods.goldMult);
    await addPlayerGold(interaction.user.id, guildId, gold);
    const multEmoji = mult === 3 ? "🔥×3" : mult === 2 ? "✨×2" : "🍀×1";
    const bonusLine = mult > 1 ? `\n🎰 **Multiplicator: ${multEmoji}** \u2014 Norocul Cenușii ține cu tine!` : "";
    await interaction.editReply({
      content: `🎉 **Cheia a funcționat!** Ai găsit **${gold} Oboli** în cufărul întâmplător!${bonusLine}`,
    });
    logger.info({ discordId: interaction.user.id, rarityKey, gold, mult, result: "success-fallback" }, "Trader success (fallback)");
    return;
  }

  const totalGold = Math.round(result.gold * mult * traderRmods.goldMult);
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await addPlayerGold(interaction.user.id, guildId, totalGold);

  const multEmoji = mult === 3 ? "🔥×3" : mult === 2 ? "✨×2" : "🍀×1";
  const bonusLine = mult > 1
    ? `\n🎰 **Multiplicator ${multEmoji}!** — Cufărul ascundea mai mult decât părea!`
    : "";

  const lines = [
    `🎉 **Cheia ta a funcționat!**`,
    `\n👑 Ai deschis **${offer.emoji} ${offer.label}**!`,
    `💰 **${totalGold} Oboli** eliberați!` +
      (mult > 1 ? ` *(baza: ${result.gold} × ${mult})*` : ""),
    bonusLine,
    `\n✨ *Negustorul închide cufărul cu un zâmbet subțire...*`,
  ];
  await interaction.editReply({ content: lines.join("\n") });
  logger.info({ discordId: interaction.user.id, rarityKey, gold: totalGold, baseGold: result.gold, mult, result: "success" }, "Trader chest opened");
}

async function handleJoin(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId!;
  const ev = await getActiveEvent(eventId, guildId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!" });
    return;
  }
  const pl = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const participant = await joinEvent(guildId, eventId, interaction.user.id, interaction.user.username);
  if (!participant) {
    await interaction.editReply({ content: "⚠️ Eroare la intrarea în event." });
    return;
  }
  if (!participant.isAlive) {
    await interaction.editReply({ embeds: [buildDeathEmbed({ totalDamage: participant.totalDamage, oboli: participant.oboli, xp: participant.xp, baseOboli: participant.baseOboli, baseXp: participant.baseXp, itemsFarmed: participant.itemsFarmed })], components: [] });
    return;
  }
  if (participant.pendingLevelup) {
    const lvl = Math.floor(participant.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  await interaction.editReply({ embeds: [buildCombatEmbed(participant, "", interaction.user.displayAvatarURL({ size: 256 }), pl)], components: [combatRow(eventId, participant)] });
}

async function handleAttack(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, pl] = await Promise.all([
    getParticipant(eventId, guildId, interaction.user.id),
    getPlayerById(interaction.user.id, guildId),
  ]);
  if (!p) {
    await interaction.followUp({ content: "❌ Intră mai întâi în luptă!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!p.isAlive) {
    await interaction.editReply({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel, { totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed }) : buildDeathEmbed({ totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed })], components: [] });
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }

  const ev = await getActiveEvent(eventId, guildId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }

  const talismanKey = pl?.talisman ?? null;
  const talismanLevel = pl?.talismanLevel ?? 1;
  const result = doCombat(p, talismanKey, talismanLevel, pl?.bossKills);
  // Veteran ranks: remember every mini-boss this player slays — next time the
  // same boss appears for them, it comes back stronger (+20% HP/dmg per rank).
  const slainBoss = result.monsterDefeated && isBossFight(p.monsterLevel, p.monsterRarity);
  if (slainBoss) {
    void incrementBossKill(p.discordId, guildId, bossIndex(p.monsterLevel))
      .catch((err) => logger.error({ err, discordId: p.discordId, guildId }, "incrementBossKill failed"));
  }
  const killBaseXp = result.xpGained;
  const killBaseOboli = result.oboliGained;

  if (result.oboliGained > 0) {
    const cls = pl?.class && isClassKey(pl.class) ? CLASSES[pl.class] : null;
    if (cls) {
      result.xpGained = Math.round(result.xpGained * cls.xpMult);
      result.oboliGained = Math.round(result.oboliGained * cls.oboliMult);
    }
    const rmods = getRewardMultipliers(p.discordId, guildId);
    result.xpGained = Math.round(result.xpGained * rmods.xpMult);
    result.oboliGained = Math.round(result.oboliGained * rmods.goldMult);
    if (talismanKey === "piatra_eco") {
      result.xpGained = Math.round(result.xpGained * (1 + talismanValue("piatra_eco", talismanLevel) / 100));
    }
    // Prestige gold bonus: +5% Oboli per prestige level
    result.oboliGained = Math.round(result.oboliGained * prestigeGoldMult(pl?.prestigeLevel ?? 0));
  }

  // Roll item drop before buildResultText so the drop line can appear in the combat embed
  const itemDrop = result.oboliGained > 0 ? rollItemDrop(p.monsterLevel) : null;
  // Track everything farmed this event so the final summary can show it
  const itemsFarmed: Record<string, number> = { ...(p.itemsFarmed ?? {}) };
  if (itemDrop) itemsFarmed[itemDrop] = (itemsFarmed[itemDrop] ?? 0) + 1;
  const cristaHeal =
    result.oboliGained > 0 && !result.playerDied && talismanKey === "crista_vietii"
      ? talismanValue("crista_vietii", talismanLevel)
      : 0;
  const extra = buildResultText(result, itemDrop, { baseXp: killBaseXp, baseOboli: killBaseOboli, cristaHeal });

  if (result.playerDied) {
    const lost = Math.floor(p.oboli * 0.2);
    const deathBaseOboli = p.baseOboli;
    const deathBaseXp = p.baseXp;
    await updateParticipant(p.id, { isAlive: false, currentHp: 0, empowerNext: false, shieldNext: false });
    await Promise.all([
      deductPlayerGold(p.discordId, guildId, lost),
      recordPlayerDeath(p.discordId, guildId, p.monsterLevel),
    ]);
    await interaction.editReply({ embeds: [buildDeathEmbed({ lostOboli: lost, totalDamage: p.totalDamage + result.playerDmg, oboli: p.oboli, xp: p.xp, baseOboli: deathBaseOboli, baseXp: deathBaseXp, itemsFarmed: p.itemsFarmed })], components: [] });
    return;
  }

  // crista_vietii: +HP after kill; runa_sangelui: life steal on crit
  let finalPlayerHp = result.newPlayerHp;
  if (cristaHeal > 0) {
    finalPlayerHp = Math.min(p.maxHp, finalPlayerHp + cristaHeal);
  } else if (result.hpRegen > 0) {
    finalPlayerHp = Math.min(p.maxHp, finalPlayerHp + result.hpRegen);
  }

  if (result.oboliGained > 0) {
    const questResult = await incrementDailyQuestKill(p.discordId, guildId);
    void Promise.all([
      addPlayerGold(p.discordId, guildId, result.oboliGained),
      addPlayerXp(p.discordId, guildId, result.xpGained),
      updateMaxLevel(p.discordId, guildId, result.newMonsterLevel),
      ...(itemDrop ? [addPlayerItem(p.discordId, guildId, itemDrop)] : []),
      ...(questResult.justCompleted ? [addPlayerItem(p.discordId, guildId, DAILY_QUESTS.kill_10.reward.itemKey)] : []),
    ]).catch((err) => logger.error({ err, discordId: p.discordId, guildId }, "Async combat writes failed"));
    if (questResult.justCompleted) {
      itemsFarmed[DAILY_QUESTS.kill_10.reward.itemKey] =
        (itemsFarmed[DAILY_QUESTS.kill_10.reward.itemKey] ?? 0) + DAILY_QUESTS.kill_10.reward.qty;
      void interaction.followUp({
        content:
          `📜 **Misiunea zilnică completată!**\n` +
          `${ITEMS[DAILY_QUESTS.kill_10.reward.itemKey].emoji} Ai primit **${DAILY_QUESTS.kill_10.reward.qty}× ${ITEMS[DAILY_QUESTS.kill_10.reward.itemKey].label}** ca recompensă!\n` +
          `Folosește \`/misiuni\` pentru detalii.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  if (result.levelUp) {
    await updateParticipant(p.id, {
      currentHp: finalPlayerHp,
      monsterLevel: result.newMonsterLevel,
      monsterCurrentHp: monsterSpawnHp(result.newMonsterLevel, result.newMonsterRarity, pl?.bossKills),
      monsterRarity: result.newMonsterRarity,
      totalDamage: p.totalDamage + result.playerDmg,
      oboli: p.oboli + result.oboliGained,
      xp: p.xp + result.xpGained,
      baseOboli: p.baseOboli + killBaseOboli,
      baseXp: p.baseXp + killBaseXp,
      itemsFarmed,
      pendingLevelup: true,
      empowerNext: false,
      shieldNext: false,
      bossCharge: result.newBossCharge,
    });
    const lvlDropLine = itemDrop ? `${ITEMS[itemDrop].emoji} **${ITEMS[itemDrop].label}** a căzut din monstru!` : undefined;
    await interaction.editReply({ embeds: [buildLevelupEmbed(Math.floor(result.newMonsterLevel / LEVELUP_INTERVAL), lvlDropLine)], components: levelupRows(eventId) });
    return;
  }

  const updated = await updateParticipant(p.id, {
    currentHp: finalPlayerHp,
    monsterLevel: result.newMonsterLevel,
    monsterCurrentHp: result.newMonsterHp,
    monsterRarity: result.newMonsterRarity,
    totalDamage: p.totalDamage + result.playerDmg,
    oboli: p.oboli + result.oboliGained,
    xp: p.xp + result.xpGained,
    baseOboli: p.baseOboli + killBaseOboli,
    baseXp: p.baseXp + killBaseXp,
    itemsFarmed,
    empowerNext: false,
    shieldNext: false,
    bossCharge: result.newBossCharge,
  });

  await interaction.editReply({ embeds: [buildCombatEmbed(updated, extra, interaction.user.displayAvatarURL({ size: 256 }), pl)], components: [combatRow(eventId, updated)] });
}

async function handleRetreat(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await getParticipant(eventId, guildId, interaction.user.id);
  if (!p) {
    await interaction.followUp({ content: "❌ Nu ești în nicio luptă!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!p.isAlive) {
    await interaction.editReply({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel, { totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed }) : buildDeathEmbed({ totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed })], components: [] });
    return;
  }
  const ev = await getActiveEvent(eventId, guildId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }
  await updateParticipant(p.id, { isAlive: false, fled: true });
  await recordPlayerRetreat(p.discordId, guildId, p.monsterLevel);
  await interaction.editReply({ embeds: [buildRetreatEmbed(p.monsterLevel, { totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed })], components: [] });
}

async function handleBuy(interaction: ButtonInteraction, key: ShopKey) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const cost = shopPrice(key, p[SHOP_COUNT_KEY[key]] as number);
  const updated = await buyPlayerUpgrade(interaction.user.id, guildId, key, cost);
  if (updated) {
    await applyUpgradeToActiveParticipant(interaction.user.id, guildId, key);
  }
  const player = updated ?? p;
  await interaction.editReply({ embeds: [buildShopEmbed(player, "stats")], components: shopStatsRows(player) });
}

async function handleLevelup(interaction: ButtonInteraction, eventId: number, bonus: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, pl] = await Promise.all([
    getParticipant(eventId, guildId, interaction.user.id),
    getPlayerById(interaction.user.id, guildId),
  ]);
  if (!p || !p.isAlive || !p.pendingLevelup) {
    await interaction.followUp({ content: "❌ Nu ai un level-up disponibil!", flags: MessageFlags.Ephemeral });
    return;
  }

  const bonusMap: Record<string, Partial<typeof p>> = {
    xp: { xpPerKill: p.xpPerKill + 5 },
    dodge: { dodgeBonus: p.dodgeBonus + 3 },
    atac: { attackBonus: p.attackBonus + 2 },
    hp: { maxHp: p.maxHp + 5, currentHp: Math.min(p.maxHp + 5, p.currentHp + 5) },
    crit: { critBonus: p.critBonus + 1 },
  };

  const bonusValues = bonusMap[bonus] ?? {};
  const updated = await updateParticipant(p.id, { ...bonusValues, pendingLevelup: false });
  await interaction.editReply({ embeds: [buildCombatEmbed(updated, "✨ **Bonus ales! Umbrele îți recunosc puterea.**", interaction.user.displayAvatarURL({ size: 256 }), pl)], components: [combatRow(eventId, updated)] });
}

async function handleClasa(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({
    embeds: [buildClassEmbed(p)],
    components: p.class && isClassKey(p.class) ? shopClassRows(p) : classRows(),
  });
}

async function handleClassPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const updated = await setPlayerClass(interaction.user.id, guildId, key);
  if (!updated) {
    const cur = await getPlayerById(interaction.user.id, guildId);
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
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({
    embeds: [buildCompanionEmbed(p)],
    components: [],
  });
}

async function handleShopNavStats(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "stats")], components: shopStatsRows(p) });
}

async function handleShopNavComp(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "comp")], components: shopCompRows(p) });
}

async function handleShopNavAbil(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "abil")], components: shopAbilRows(p) });
}

async function handleShopNavPrestige(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "prestige")], components: shopPrestigeRows(p) });
}

async function handleShopNavClass(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "class")], components: shopClassRows(p) });
}

/** Build savedLevels map (talismanKey → level) from player_talismans rows. */
function talismanLevelsMap(rows: { talismanKey: string; level: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.talismanKey, r.level]));
}

async function handleShopNavTalisman(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items, saved] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const savedLevels = talismanLevelsMap(saved);
  await interaction.editReply({ embeds: [buildTalismanPage(p, items, savedLevels)], components: shopTalismanRows(p, items, savedLevels) });
}

async function handleShopTalismanPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  if (!isTalismanKey(key)) return;
  const [p, saved] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const t = TALISMANS[key];
  if (p.talisman === key) return;
  const savedLevels = talismanLevelsMap(saved);
  const owned = (savedLevels[key] ?? 0) > 0;
  if (!owned) {
    // Atomic deduct (WHERE gold >= price) — a double-click can't pay twice or overdraw
    const paid = await tryDeductPlayerGold(interaction.user.id, guildId, t.price);
    if (!paid) {
      await interaction.followUp({
        content: `❌ Nu ai suficienți Oboli! Ai **${p.gold}** / **${t.price}** Oboli.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
  // Save the level of the talisman being unequipped so it's never lost
  if (p.talisman && isTalismanKey(p.talisman)) {
    await saveTalismanLevel(interaction.user.id, guildId, p.talisman, p.talismanLevel ?? 1);
  }
  // Equip at the previously saved level (1 for a fresh purchase) and record ownership
  const newLevel = savedLevels[key] ?? 1;
  await Promise.all([
    equipTalisman(interaction.user.id, guildId, key, newLevel),
    saveTalismanLevel(interaction.user.id, guildId, key, newLevel),
  ]);
  const [updated, items, savedAfter] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const savedLevelsAfter = talismanLevelsMap(savedAfter);
  await interaction.editReply({ embeds: [buildTalismanPage(updated, items, savedLevelsAfter)], components: shopTalismanRows(updated, items, savedLevelsAfter) });
}

async function handleShopTalismanUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  const equippedKey = p.talisman && isTalismanKey(p.talisman) ? p.talisman : null;
  const fromLevel = p.talismanLevel ?? 1;
  if (!equippedKey || fromLevel >= TALISMAN_MAX_LEVEL) {
    await interaction.followUp({ content: "❌ Nu poți evolua acest talisman.", flags: MessageFlags.Ephemeral });
    return;
  }
  const t = TALISMANS[equippedKey];
  const cost = talismanUpgradeCost(equippedKey, fromLevel);
  const ok = await consumePlayerItems(interaction.user.id, guildId, {
    [cost.common]: cost.commonQty,
    [cost.rare]: cost.rareQty,
  });
  if (!ok) {
    await interaction.followUp({ content: "❌ Nu ai materialele necesare pentru evoluție.", flags: MessageFlags.Ephemeral });
    return;
  }
  // Atomic level guard: only write fromLevel+1 if THIS talisman is still equipped at fromLevel
  // (prevents double-upgrade race and the bump landing on a concurrently-switched talisman)
  const upgraded = await tryUpgradeTalismanLevel(interaction.user.id, guildId, equippedKey, fromLevel, fromLevel + 1);
  if (!upgraded) {
    // Another concurrent click already upgraded — refund the consumed items
    await Promise.all([
      addPlayerItem(interaction.user.id, guildId, cost.common, cost.commonQty),
      addPlayerItem(interaction.user.id, guildId, cost.rare, cost.rareQty),
    ]);
    await interaction.followUp({ content: "❌ Talismanul a fost deja evoluat.", flags: MessageFlags.Ephemeral });
    return;
  }
  // Persist the new level per-talisman so it survives switching
  await saveTalismanLevel(interaction.user.id, guildId, equippedKey, fromLevel + 1);
  const [updated, updatedItems, savedAfter] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const savedLevelsAfter = talismanLevelsMap(savedAfter);
  await interaction.followUp({ content: `✨ **${t.label}** a evoluat la **Nv.${fromLevel + 1}**! Pasivul tău este acum mai puternic.`, flags: MessageFlags.Ephemeral });
  await interaction.editReply({ embeds: [buildTalismanPage(updated, updatedItems, savedLevelsAfter)], components: shopTalismanRows(updated, updatedItems, savedLevelsAfter) });
}

async function handleShopClassPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const updated = await setPlayerClass(interaction.user.id, guildId, key);
  const player = updated ?? (await getPlayerById(interaction.user.id, guildId));
  if (!player) return;
  if (!updated) {
    await interaction.followUp({ content: "❌ Ai deja o clasă aleasă. Dacă vrei alta, renunță mai întâi la calea ta din **/magazin → Clasă**.", flags: MessageFlags.Ephemeral });
  }
  await interaction.editReply({ embeds: [buildShopEmbed(player, "class")], components: shopClassRows(player) });
}

async function handlePrestigeBuy(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const cost = prestigeXpCost(p.prestigeLevel);
  const updated = await buyPrestige(interaction.user.id, guildId, p.prestigeLevel, cost);
  const player = updated ?? p;
  await interaction.editReply({ embeds: [buildShopEmbed(player, "prestige")], components: shopPrestigeRows(player) });
}

async function handleShopBack(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "overview")], components: shopRows(p) });
}

async function handleCompBuy(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!isCompanionKey(key)) return;
  const updated = await buyCompanion(interaction.user.id, guildId, key, COMPANION_BUY_COST);
  if (!updated) {
    await interaction.followUp({ content: `❌ Nu poți cumpăra acest companion — ai nevoie de **${COMPANION_BUY_COST} Oboli** și să nu ai deja unul.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "comp")], components: shopCompRows(updated) });
}

async function handleCompUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const cost = upgradeCost(p.companionLevel);
  const updated = await upgradeCompanion(interaction.user.id, guildId, p.companionLevel, cost, UPGRADE_XP_COST);
  if (!updated) {
    await interaction.followUp({ content: `❌ Îmbunătățire eșuată — ai nevoie de un companion, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "comp")], components: shopCompRows(updated) });
}

async function handleClassUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!p.class || !isClassKey(p.class)) {
    await interaction.followUp({ content: "❌ Nu ai o clasă aleasă. Folosește `/clasa` pentru a alege una.", flags: MessageFlags.Ephemeral });
    return;
  }
  const level = p.classLevel ?? 1;
  const cost = classUpgradeCost(level);
  const items = await getPlayerItems(interaction.user.id, guildId);
  const inv = Object.fromEntries(items.map((i) => [i.itemKey, i.quantity]));
  const canAfford =
    p.gold >= cost.gold &&
    p.xp >= cost.xp &&
    cost.items.every((req) => (inv[req.item] ?? 0) >= req.qty);
  if (!canAfford) {
    const itemLines = cost.items.map((req) => `   · ${req.qty}× ${ITEMS[req.item].emoji} ${ITEMS[req.item].label}`).join("\n");
    await interaction.followUp({
      content: `❌ Resurse insuficiente pentru upgrade la Nv.${level + 1}.\n\n**Cost:**\n   · ${cost.gold} Oboli\n   · ${cost.xp} XP${itemLines ? "\n" + itemLines : ""}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const updated = await upgradeClass(interaction.user.id, guildId, p.class, level, cost.gold, cost.xp, cost.items);
  if (!updated) {
    await interaction.followUp({ content: "❌ Upgrade eșuat — resursele s-au schimbat între timp.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildClassEmbed(updated)], components: shopClassRows(updated) });
}

async function handleCompReset(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!p.companion || !isCompanionKey(p.companion)) {
    await interaction.followUp({ content: "❌ Nu ai niciun companion de eliberat.", flags: MessageFlags.Ephemeral });
    return;
  }
  const c = COMPANIONS[p.companion];
  await interaction.followUp({
    content:
      `⚠️ Ești sigur că vrei să eliberezi companionul ${c.emoji} **${c.label}** (Nv.${p.companionLevel})?\n` +
      `Nivelul lui se **pierde definitiv** și nu primești Oboli înapoi. Vei putea cumpăra alt companion (${COMPANION_BUY_COST} Oboli).`,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("shop_compreset_yes").setLabel("Da, eliberează").setEmoji("🔄").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("shop_reset_no").setLabel("Anulează").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function handleClassReset(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!p.class || !isClassKey(p.class)) {
    await interaction.followUp({ content: "❌ Nu ai nicio clasă aleasă.", flags: MessageFlags.Ephemeral });
    return;
  }
  const cls = CLASSES[p.class];
  await interaction.followUp({
    content:
      `⚠️ Ești sigur că vrei să renunți la calea ${cls.emoji} **${cls.label}** (Nv.${p.classLevel ?? 1})?\n` +
      `Nivelul clasei se **pierde definitiv** și nu primești resursele înapoi. Vei putea alege o clasă nouă (de la Nv.1).`,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("shop_classreset_yes").setLabel("Da, renunț").setEmoji("🔄").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("shop_reset_no").setLabel("Anulează").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function handleCompResetConfirm(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const updated = await resetPlayerCompanion(interaction.user.id, guildId);
  if (!updated) {
    await interaction.editReply({ content: "❌ Nu mai ai niciun companion de eliberat.", components: [] });
    return;
  }
  await interaction.editReply({
    content: "🔄 Companionul a fost eliberat. Poți cumpăra unul nou din **/magazin → Companion**.",
    components: [],
  });
}

async function handleClassResetConfirm(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const updated = await resetPlayerClass(interaction.user.id, guildId);
  if (!updated) {
    await interaction.editReply({ content: "❌ Nu mai ai nicio clasă de resetat.", components: [] });
    return;
  }
  await interaction.editReply({
    content: "🔄 Ai renunțat la calea ta. Poți alege o clasă nouă din **/magazin → Clasă** sau cu `/clasa`.",
    components: [],
  });
}

async function handleResetCancel(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  await interaction.editReply({ content: "✅ Anulat — totul rămâne neschimbat.", components: [] });
}

async function handleAbilBuy(interaction: ButtonInteraction, kind: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!isAbilityKey(kind)) return;
  const updated = await buyAbility(interaction.user.id, guildId, kind as AbilityKind, ABILITY_BUY_COST);
  if (updated) {
    const lvl = kind === "empower" ? updated.abilityEmpowerLevel : updated.abilityShieldLevel;
    await applyAbilityLevelToActiveParticipant(interaction.user.id, guildId, kind as AbilityKind, lvl);
  }
  if (!updated) {
    await interaction.followUp({ content: `❌ Nu poți debloca abilitatea — ai nevoie de **${ABILITY_BUY_COST} Oboli** și să nu o deții deja.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil")], components: shopAbilRows(updated) });
}

async function handleAbilUpgrade(interaction: ButtonInteraction, kind: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!isAbilityKey(kind)) return;
  const curLvl = kind === "empower" ? p.abilityEmpowerLevel : p.abilityShieldLevel;
  const cost = upgradeCost(curLvl);
  const updated = await upgradeAbility(interaction.user.id, guildId, kind as AbilityKind, curLvl, cost, UPGRADE_XP_COST);
  if (updated) {
    const lvl = kind === "empower" ? updated.abilityEmpowerLevel : updated.abilityShieldLevel;
    await applyAbilityLevelToActiveParticipant(interaction.user.id, guildId, kind as AbilityKind, lvl);
  }
  if (!updated) {
    await interaction.followUp({ content: `❌ Îmbunătățire eșuată — ai nevoie de abilitate, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil")], components: shopAbilRows(updated) });
}

async function handleAbility(interaction: ButtonInteraction, eventId: number, kind: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, pl] = await Promise.all([
    getParticipant(eventId, guildId, interaction.user.id),
    getPlayerById(interaction.user.id, guildId),
  ]);
  if (!p || !p.isAlive) {
    await interaction.followUp({ content: "❌ Trebuie să fii în luptă ca să folosești abilități!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  const ev = await getActiveEvent(eventId, guildId);
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
    embeds: [buildCombatEmbed(updated, note, interaction.user.displayAvatarURL({ size: 256 }), pl)],
    components: [combatRow(eventId, updated)],
  });
}

async function handleFinalBoss(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const uid = interaction.user.id;
  const guildId = interaction.guildId!;
  const activeBossMap = getGuildActiveBossMap(guildId);
  const boss = activeBossMap.get(eventId);

  const eligibility = checkBossEligibility(boss, uid);
  if (!eligibility.ok) {
    const msg: Record<string, string> = {
      no_boss:  "⌛ Dragonul nu a fost invocat încă.",
      defeated: "💀 Dragonul Stins a fost deja înfrânt de Regat!",
      dead:     "💀 Ești căzut în luptă! Dragonul te-a doborât — nu mai poți lovi.",
    };
    await interaction.followUp({ content: msg[eligibility.reason] ?? "❌ Nu poți participa.", flags: MessageFlags.Ephemeral });
    return;
  }

  const activeBoss = boss!;
  const player = await upsertPlayer(uid, guildId, interaction.user.username);

  activeBoss.playerNames.set(uid, interaction.user.username);

  const clsKey = player.class && isClassKey(player.class) ? player.class : null;
  const cls = clsKey ? classStats(clsKey, player.classLevel ?? 1) : null;
  const comp = player.companion && isCompanionKey(player.companion)
    ? companionStats(player.companion, player.companionLevel ?? 1)
    : null;

  const prestigeMaxHp = 100 + player.maxHpBonus + player.prestigeHpBonus + (cls?.hp ?? 0) + (comp?.hp ?? 0);
  if (!activeBoss.playerHp.has(uid)) {
    activeBoss.playerHp.set(uid, Math.max(10, prestigeMaxHp));
  }
  if (!activeBoss.playerStats.has(uid)) {
    const stats: BossPlayerStats = {
      atk: player.attackBonus + player.prestigeAttackBonus + (cls?.attack ?? 0) + (comp?.attack ?? 0),
      def: player.defenseBonus + player.prestigeDefenseBonus + (comp?.defense ?? 0),
      dodge: player.dodgeBonus + player.prestigeDodgeBonus + (cls?.dodge ?? 0),
      crit: player.critBonus + player.prestigeCritBonus + (cls?.crit ?? 0) + (comp?.crit ?? 0),
      maxHp: prestigeMaxHp,
    };
    activeBoss.playerStats.set(uid, stats);
  }
  const myHp = activeBoss.playerHp.get(uid)!;
  const myMaxHp = prestigeMaxHp;

  const cooldown = checkBossHitCooldown(activeBoss.lastHitAt, uid);
  if (cooldown.onCooldown) {
    await interaction.followUp({
      content: `⏳ Recuperare… mai poți lovi în **${cooldown.remainingSeconds}s**!\n❤️ Viața ta: **${myHp} / ${myMaxHp} HP** | 🐉 Dragon: **${activeBoss.currentHp.toLocaleString()} / ${activeBoss.maxHp.toLocaleString()} HP**`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mods = getCombatModifiers(uid);

  const totalAtk = player.attackBonus + player.prestigeAttackBonus + (cls?.attack ?? 0) + (comp?.attack ?? 0);
  const totalCrit = player.critBonus + player.prestigeCritBonus + (cls?.crit ?? 0) + (comp?.crit ?? 0);
  const totalDef = player.defenseBonus + player.prestigeDefenseBonus + (comp?.defense ?? 0);
  const minDmg = Math.max(30, totalAtk * 5 + 20);
  const maxDmg = Math.max(80, totalAtk * 15 + 60);
  const baseBossDmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
  let playerDmg = baseBossDmg;
  const isCrit = Math.random() * 100 < Math.min(100, Math.max(0, totalCrit + mods.critAdd));
  if (isCrit) playerDmg *= 2;
  const usedEmpower = activeBoss.empowerNext.delete(uid) && player.abilityEmpowerLevel >= 1;
  if (usedEmpower) playerDmg = Math.round(playerDmg * empowerMult(player.abilityEmpowerLevel));
  if (mods.damageMult !== 1) playerDmg = Math.round(playerDmg * mods.damageMult);
  const critTag = isCrit ? " 💥 **CRITIC!**" : "";

  let bossHit = Math.floor(Math.random() * 121) + 80;
  const usedShield = activeBoss.shieldNext.delete(uid) && player.abilityShieldLevel >= 1;
  if (usedShield) bossHit = Math.max(1, Math.round(bossHit * (1 - shieldReduction(player.abilityShieldLevel))));
  bossHit = Math.max(1, bossHit - totalDef);
  if (mods.damageTakenMult !== 1) bossHit = Math.max(1, Math.round(bossHit * mods.damageTakenMult));
  const newPlayerHp = Math.max(0, myHp - bossHit);

  const dmgBreakdownLine = (() => {
    if (playerDmg === baseBossDmg) return "";
    const parts: string[] = [];
    if (isCrit) parts.push("💥 critică ×2");
    if (usedEmpower) parts.push("🌑 abilitate");
    return `🗡️ Daune normale: **${baseBossDmg}** → cu ${parts.length ? parts.join(" + ") : "bonusuri"}: **${playerDmg}**\n`;
  })();

  const abilityLine =
    (usedEmpower ? "🌑 **LOVITURA UMBREI!** Puterea Umbrelor ți-a dublat lovitura!\n" : "") +
    (usedShield ? "🛡️ **SCUT DE CENUȘĂ activ!** Daunele primite au fost reduse.\n" : "") +
    dmgBreakdownLine;

  activeBoss.lastHitAt.set(uid, Date.now());
  activeBoss.damageBy.set(uid, (activeBoss.damageBy.get(uid) ?? 0) + playerDmg);
  activeBoss.hitsBy.set(uid, (activeBoss.hitsBy.get(uid) ?? 0) + 1);
  activeBoss.currentHp = Math.max(0, activeBoss.currentHp - playerDmg);
  activeBoss.playerHp.set(uid, newPlayerHp);

  const bossDefeated = activeBoss.currentHp <= 0 && !activeBoss.defeated;

  // Shared ability charge bar: every hit fills it; when full the boss
  // unleashes its special ability on ALL living fighters, then it resets.
  let bossAbilityAnnouncement = "";
  if (!bossDefeated) {
    activeBoss.charge = (activeBoss.charge ?? 0) + 1;
    if (activeBoss.charge >= FINAL_BOSS_CHARGE_MAX) {
      activeBoss.charge = 0;
      const bossIdentity = BOSSES[bossIndex(activeBoss.level)]!;
      const ab = bossIdentity.ability;
      const hitLines: string[] = [];
      let totalDrained = 0;
      for (const [pid, hp] of activeBoss.playerHp) {
        if (hp <= 0) continue;
        const pMaxHp = activeBoss.playerStats.get(pid)?.maxHp ?? 100;
        const dmg = Math.max(1, Math.round((pMaxHp * ab.pct) / 100));
        const nhp = Math.max(0, hp - dmg);
        activeBoss.playerHp.set(pid, nhp);
        totalDrained += dmg;
        hitLines.push(`💥 <@${pid}> −**${dmg} HP**${nhp <= 0 ? " ⚰️ **doborât!**" : ""}`);
      }
      if (ab.steal && totalDrained > 0) {
        activeBoss.currentHp = Math.min(activeBoss.maxHp, activeBoss.currentHp + totalDrained);
      }
      bossAbilityAnnouncement =
        `${ab.emoji} **${bossIdentity.name} își dezlănțuie abilitatea: ${ab.name}!**\n` +
        hitLines.join("\n") +
        (ab.steal && totalDrained > 0 ? `\n🩸 Bossul absoarbe viața luptătorilor și se vindecă cu **+${totalDrained.toLocaleString()} HP**!` : "");
    }
  }

  if (bossDefeated) {
    activeBoss.defeated = true;
    activeBossMap.delete(eventId);
    await deleteActiveBoss(eventId, activeBoss.guildId).catch(err =>
      logger.error({ err, eventId }, "Failed to delete defeated boss row — stale row may persist until next restart")
    );

    const bossRewards = computeBossRewards(activeBoss.damageBy, activeBoss.rarity, activeBoss.hitsBy);
    const baseRewards = new Map([...bossRewards.entries()].map(([id, r]) => [id, { gold: r.gold, xp: r.xp }]));
    const prestigeLevels = await getPrestigeLevels(activeBoss.guildId, [...bossRewards.keys()]).catch(() => new Map<string, number>());
    for (const [discordId, r] of bossRewards) {
      const rmods = getRewardMultipliers(discordId, activeBoss.guildId);
      r.gold = Math.round(r.gold * rmods.goldMult * prestigeGoldMult(prestigeLevels.get(discordId) ?? 0));
      r.xp = Math.round(r.xp * rmods.xpMult);
    }
    const eventKeyDrops = rollEventKeyDrops([...activeBoss.damageBy.keys()]);
    const bossItemKey = (activeBoss.rarity === "epic" || activeBoss.rarity === "legendar")
      ? "inima_abisului"
      : "coama_dragonului";
    await Promise.all([
      ...[...bossRewards.entries()].flatMap(([discordId, r]) => [
        addPlayerReputation(discordId, guildId, r.rep),
        addPlayerGold(discordId, guildId, r.gold),
        addPlayerXp(discordId, guildId, r.xp),
      ]),
      ...[...eventKeyDrops.entries()].map(([discordId, kt]) => addPlayerKey(discordId, guildId, kt as KeyType)),
      ...[...activeBoss.damageBy.keys()].map((discordId) => addPlayerItem(discordId, guildId, bossItemKey)),
    ]);

    try {
      const fightCh = await interaction.client.channels.fetch(activeBoss.channelId).catch(() => null);
      if (fightCh instanceof TextChannel) {
        const bossMsg = await fightCh.messages.fetch(activeBoss.messageId).catch(() => null);
        await bossMsg?.delete().catch(() => null);
      }
      const bossTopId = getChannel("bossTop", guildId);
      const topCh = bossTopId ? await interaction.client.channels.fetch(bossTopId).catch(() => null) : null;
      if (topCh instanceof TextChannel) {
        const leaderboard = buildBossLeaderboard(activeBoss, activeBoss.damageBy, activeBoss.participants, activeBoss.playerNames, activeBoss.playerHp, activeBoss.hitsBy);
        await topCh.send({ embeds: [leaderboard] }).catch(() => null);
        if (eventKeyDrops.size > 0) {
          const lines = [...eventKeyDrops.entries()].map(
            ([id, kt]) => `${KEY_EMOJI[kt] ?? "🗝️"} <@${id}> a găsit o **${KEY_LABEL[kt] ?? "Cheie"}**!`,
          );
          await topCh.send({ content: `🗝️ **Prada ascunsă a Dragonului:**\n${lines.join("\n")}` }).catch(() => null);
        }
      }
    } catch { /* ignore */ }

    const myReward = bossRewards.get(interaction.user.id);
    const myBase = baseRewards.get(interaction.user.id);
    const goldStr = myReward && myBase && myBase.gold !== myReward.gold
      ? `**+${myReward.gold} Oboli** *(normal ${myBase.gold})*`
      : `**+${myReward?.gold ?? 0} Oboli**`;
    const xpStr = myReward && myBase && myBase.xp !== myReward.xp
      ? `**+${myReward.xp} XP** *(normal ${myBase.xp})*`
      : `**+${myReward?.xp ?? 0} XP**`;
    const rewLine = myReward
      ? `🏅 Tu primești: **+${myReward.rep} Rep**, ${goldStr}, ${xpStr}!`
      : `🏅 Recompensele au fost distribuite!`;
    const bossItemInfo = ITEMS[bossItemKey];
    const itemLine = `${bossItemInfo.emoji} Toți participanții au primit **${bossItemInfo.label}** în inventar!`;

    await interaction.followUp({
      content:
        abilityLine +
        `⚔️ **${interaction.user.username}** a dat lovitura finală! **${playerDmg.toLocaleString()} daune**!${critTag}\n` +
        `💀 **Dragonul Stins a căzut!** Regatul este salvat!\n` +
        rewLine + "\n" +
        itemLine,
    });
    return;
  }

  void persistBossState(activeBoss);

  try {
    const ch = await interaction.client.channels.fetch(activeBoss.channelId);
    if (ch instanceof TextChannel) {
      const bossMsg = await ch.messages.fetch(activeBoss.messageId).catch(() => null);
      if (bossMsg) {
        await bossMsg.edit({
          embeds: [buildFinalBossEmbed(activeBoss.level, activeBoss.rarity, activeBoss.currentHp, activeBoss.maxHp, activeBoss.damageBy, activeBoss.playerNames, activeBoss.playerHp, activeBoss.playerStats, activeBoss.expiresAt, activeBoss.charge)],
          components: [finalBossRow(eventId)],
        }).catch(() => null);
      }
    }
  } catch { /* ignore */ }

  // Public announcement when the boss ability fired (visible to everyone).
  if (bossAbilityAnnouncement) {
    await interaction.followUp({ content: bossAbilityAnnouncement }).catch(() => null);
  }

  const myFinalHp = activeBoss.playerHp.get(uid) ?? newPlayerHp;
  const playerStatus = myFinalHp <= 0
    ? `💀 **Ai fost doborât de Dragon!** Nu mai poți lovi.`
    : `❤️ Viața ta: **${myFinalHp} / ${myMaxHp} HP**`;

  const effectsLine = formatCombatEffects(uid);
  await interaction.followUp({
    content:
      abilityLine +
      `⚔️ Ai lovit Dragonul pentru **${playerDmg.toLocaleString()} daune**!${critTag}\n` +
      `🐉 Dragonul te lovește pentru **${bossHit} daune**! ${playerStatus}\n` +
      `🩸 Dragon: **${activeBoss.currentHp.toLocaleString()} / ${activeBoss.maxHp.toLocaleString()} HP**` +
      (effectsLine ? `\n🔮 **Efectele tale active:**\n${effectsLine}` : ""),
    ephemeral: true,
  });
}

async function handleBossAbility(interaction: ButtonInteraction, eventId: number, kind: string) {
  await interaction.deferUpdate();
  const uid = interaction.user.id;
  const guildId = interaction.guildId!;
  const activeBossMap = getGuildActiveBossMap(guildId);
  const boss = activeBossMap.get(eventId);

  const eligibility = checkBossEligibility(boss, uid);
  if (!eligibility.ok) {
    const msg: Record<string, string> = {
      no_boss:  "⌛ Dragonul nu a fost invocat încă.",
      defeated: "💀 Dragonul Stins a fost deja înfrânt de Regat!",
      dead:     "💀 Ești căzut în luptă! Dragonul te-a doborât — nu mai poți folosi abilități.",
    };
    await interaction.followUp({ content: msg[eligibility.reason] ?? "❌ Nu poți participa.", flags: MessageFlags.Ephemeral });
    return;
  }
  const activeBoss = boss!;
  const player = await upsertPlayer(uid, guildId, interaction.user.username);

  const owns = kind === "shield" ? player.abilityShieldLevel >= 1 : player.abilityEmpowerLevel >= 1;
  if (!owns) {
    await interaction.followUp({ content: "🔒 Nu deții această abilitate. O poți debloca din Forja Cenușii (`/magazin`).", flags: MessageFlags.Ephemeral });
    return;
  }

  const abilityCooldown = checkBossAbilityCooldown(activeBoss.abilityReadyAt, uid);
  if (abilityCooldown.onCooldown) {
    await interaction.followUp({ content: `⏳ Abilitatea e pe cooldown — mai așteaptă **${abilityCooldown.remainingSeconds}s**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  activeBoss.abilityReadyAt.set(uid, Date.now() + ABILITY_COOLDOWN_MS);
  if (kind === "shield") {
    activeBoss.shieldNext.add(uid);
    await interaction.followUp({ content: "🛡️ **Scut de Cenușă activat!** Următorul atac primit de la Dragon va fi redus.", flags: MessageFlags.Ephemeral });
  } else {
    activeBoss.empowerNext.add(uid);
    await interaction.followUp({ content: "🌑 **Lovitura Umbrei pregătită!** Următoarea ta lovitură în Dragon va fi dublă.", flags: MessageFlags.Ephemeral });
  }
  void persistBossState(activeBoss);
}

async function handleAdminResetConfirm(interaction: ButtonInteraction, buttonId: string) {
  if (interaction.user.id !== SUPER_ADMIN_ID) {
    await interaction.reply({ content: "🔒 Nu ai permisiunea să confirmi această acțiune.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate();
  const pending = pendingAdminResets.get(buttonId);
  if (!pending) {
    await interaction.editReply({ content: "⌛ Sesiunea de confirmare a expirat (2 minute). Rulează comanda din nou.", components: [] });
    return;
  }
  pendingAdminResets.delete(buttonId);
  if (pending.targetId === "ALL") {
    const count = await resetAllPlayersInGuild(pending.guildId);
    await interaction.editReply({
      content: `💀 **Resetare completă!** Progresul a **${count}** jucători de pe server a fost șters complet.`,
      components: [],
    });
    logger.info({ guildId: pending.guildId, count }, "Admin: all players reset");
  } else {
    const ok = await resetPlayer(pending.targetId, pending.guildId);
    if (!ok) {
      await interaction.editReply({ content: `❌ **${pending.targetUsername}** nu a fost găsit în baza de date.`, components: [] });
      return;
    }
    await interaction.editReply({
      content:
        `✅ **Progresul lui ${pending.targetUsername} a fost resetat complet.**\n` +
        `> XP, Oboli, nivel, clasă, companion, abilități, upgrade-uri și chei — toate șterse.`,
      components: [],
    });
    logger.info({ targetId: pending.targetId, guildId: pending.guildId }, "Admin: player progress reset");
  }
}

async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith("admin_reset_confirm_") || id.startsWith("admin_resetall_confirm_")) {
    return handleAdminResetConfirm(interaction, id);
  }
  if (id === "admin_reset_cancel") {
    await interaction.update({ content: "❌ **Resetare anulată.**", components: [] });
    return;
  }

  if (id.startsWith("profile_view_")) {
    return handleViewProfile(interaction, id.replace("profile_view_", ""));
  }

  if (id.startsWith("trader_")) {
    const m = id.match(/^trader_(\w+)$/);
    if (m) return handleTraderClaim(interaction, m[1]!);
  }

  if (id.startsWith("lockchest_") && !id.endsWith("_claimed") && !id.endsWith("_expired")) {
    const m = id.match(/^(lockchest_\d+)_(\w+)_(\d+)$/);
    if (m) return handleLockedChestClaim(interaction, m[1]!, m[2]!, parseInt(m[3]!));
  }

  if (id.startsWith("keychest_") && !id.endsWith("_claimed") && !id.endsWith("_expired")) {
    const m = id.match(/^keychest_\d+_(\w+)$/);
    if (m) return handleKeyChestClaim(interaction, id, m[1]!);
  }

  if (id.startsWith("chest_") && !id.endsWith("_claimed") && !id.endsWith("_expired") && !id.endsWith("_opening")) {
    const newMatch = id.match(/^(chest_\d+)_(\w+)_(\d+)(?:_x([23]))?$/);
    if (newMatch) {
      const mult = newMatch[4] ? (parseInt(newMatch[4]!) as 2 | 3) : 1;
      return handleChestClaim(interaction, newMatch[1]!, newMatch[2]!, parseInt(newMatch[3]!), mult);
    }
    const legacyMatch = id.match(/^(chest_\d+)_(\d+)$/);
    if (legacyMatch) {
      return handleChestClaim(interaction, legacyMatch[1]!, "bronz", parseInt(legacyMatch[2]!));
    }
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
    const parts = id.split("_");
    return handleAbility(interaction, parseInt(parts[2]!), parts[3]!);
  }
  if (id.startsWith("ora_retreat_")) return handleRetreat(interaction, parseInt(id.replace("ora_retreat_", "")));
  if (id.startsWith("finalboss_")) return handleFinalBoss(interaction, parseInt(id.replace("finalboss_", "")));
  if (id.startsWith("bossability_")) {
    const parts = id.split("_");
    return handleBossAbility(interaction, parseInt(parts[1]!), parts[2]!);
  }
  if (id.startsWith("class_pick_")) return handleClassPick(interaction, id.replace("class_pick_", ""));

  if (id === "shop_nav_stats") return handleShopNavStats(interaction);
  if (id === "shop_nav_comp") return handleShopNavComp(interaction);
  if (id === "shop_nav_abil") return handleShopNavAbil(interaction);
  if (id === "shop_nav_prestige") return handleShopNavPrestige(interaction);
  if (id === "shop_nav_class") return handleShopNavClass(interaction);
  if (id === "shop_nav_talisman") return handleShopNavTalisman(interaction);
  if (id.startsWith("shop_talisman_") && id !== "shop_talisman_upgrade") return handleShopTalismanPick(interaction, id.replace("shop_talisman_", ""));
  if (id === "shop_talisman_upgrade") return handleShopTalismanUpgrade(interaction);
  if (id.startsWith("shop_class_")) return handleShopClassPick(interaction, id.replace("shop_class_", ""));
  if (id === "shop_prestigebuy") return handlePrestigeBuy(interaction);
  if (id === "shop_back") return handleShopBack(interaction);

  if (id.startsWith("shop_buy_")) {
    return handleBuy(interaction, id.replace("shop_buy_", "") as ShopKey);
  }
  if (id.startsWith("shop_compbuy_")) return handleCompBuy(interaction, id.replace("shop_compbuy_", ""));
  if (id === "shop_compup") return handleCompUpgrade(interaction);
  if (id === "shop_classup") return handleClassUpgrade(interaction);
  if (id === "shop_compreset") return handleCompReset(interaction);
  if (id === "shop_classreset") return handleClassReset(interaction);
  if (id === "shop_compreset_yes") return handleCompResetConfirm(interaction);
  if (id === "shop_classreset_yes") return handleClassResetConfirm(interaction);
  if (id === "shop_reset_no") return handleResetCancel(interaction);
  if (id.startsWith("shop_abilbuy_")) return handleAbilBuy(interaction, id.replace("shop_abilbuy_", ""));
  if (id.startsWith("shop_abilup_")) return handleAbilUpgrade(interaction, id.replace("shop_abilup_", ""));

  if (id.startsWith("ora_lvlup_")) {
    const parts = id.split("_");
    const bonus = parts[parts.length - 1]!;
    const eventId = parseInt(parts[2]!);
    return handleLevelup(interaction, eventId, bonus);
  }
}

async function setupTrader(client: Client, guildId: string): Promise<void> {
  if (isTraderSetupInProgress(guildId)) {
    logger.info({ guildId }, "Trader setup already in progress — skipping duplicate call");
    return;
  }
  traderSetupInProgress.set(guildId, true);
  try {
    const traderChannelId = getChannel("trader", guildId);
    const channel = traderChannelId ? await client.channels.fetch(traderChannelId).catch(() => null) : null;
    if (!(channel instanceof TextChannel)) {
      logger.warn({ channelId: traderChannelId, guildId }, "Trader channel not found");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xc9a227)
      .setAuthor({ name: "Taraba din Umbră • Regatul Cenușii" })
      .setTitle("🏪 Negustorul Misterios al Cenușii")
      .setDescription(
        "*Un bătrân cu pălăria lăsată pe ochi te cântărește din umbră, fără să-și ridice privirea...*\n\n" +
        "> 🗣️ *«Am cufere smulse din lăcomia țarilor morți... dar norocul ți-l vinzi singur.*\n" +
        "> *O cheie pentru un cufăr. Poate se deschide, poate cheia se frânge. Așa-i jocul Cenușii.»*\n\n" +
        "Alege un cufăr de mai jos — **dacă ai cheia potrivită**, negustorul îți încearcă norocul.",
      )
      .addFields(
        {
          name: "🎲 Norocul Negustorului",
          value:
            "🟢 **30%** — cheia se rotește, cufărul se deschide, Obolii sunt ai tăi.\n" +
            "🔴 **70%** — cheia se frânge în broască și comoara rămâne ferecată.",
        },
        {
          name: "🗝️ Ofertele de azi",
          value:
            "🥈 **Cufăr Blocat de Argint** — necesită 🗝️ Cheie de Rar\n" +
            "👑 **Cufăr Blocat de Aur** — necesită 🔑 Cheie de Epic\n" +
            "⚜️ **Cufărul Regal** — necesită ⚜️ Cheie Regală",
        },
      )
      .setImage(IMG.trader)
      .setFooter({ text: `Deschide doar cu cheile pe care le ai • ${BRAND_FOOTER}` });

    const STYLE_BY_RARITY: Record<string, ButtonStyle> = {
      argint: ButtonStyle.Secondary,
      aur:    ButtonStyle.Primary,
      regal:  ButtonStyle.Danger,
    };

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (const offer of TRADER_OFFERS) {
      const btn = new ButtonBuilder()
        .setCustomId(`trader_${offer.rarityKey}`)
        .setLabel(`${offer.emoji} ${offer.label}`)
        .setStyle(STYLE_BY_RARITY[offer.rarityKey] ?? ButtonStyle.Primary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
      rows.push(row);
    }

    let msgId = getTraderMessageId(guildId);
    if (!msgId) {
      msgId = await loadTraderMessageId(guildId);
      setTraderMessageId(guildId, msgId);
    }

    const currentSig = IMG.trader ?? "";
    const storedSig = await loadTraderEmbedSig(guildId);
    const imageChanged = storedSig !== currentSig;

    if (msgId) {
      try {
        const oldMsg = await channel.messages.fetch(msgId);
        if (!imageChanged) {
          await oldMsg.edit({ embeds: [embed], components: rows });
          logger.info({ traderMessageId: msgId, guildId }, "Trader message edited on reconnect");
          return;
        }
        try {
          await oldMsg.delete();
        } catch (delErr) {
          const delCode = (delErr as { code?: number } | null)?.code;
          if (delCode !== 10008) {
            logger.warn({ delErr, traderMessageId: msgId, guildId }, "Trader delete failed (transient) — keeping message, will retry next restart");
            return;
          }
        }
        logger.info({ traderMessageId: msgId, guildId }, "Trader image changed — replacing message so the new image renders");
        setTraderMessageId(guildId, null);
        await clearTraderMessageId(guildId).catch(() => null);
        msgId = null;
      } catch (err) {
        const code = (err as { code?: number } | null)?.code;
        if (code !== 10008) {
          logger.warn({ err, traderMessageId: msgId, guildId }, "Trader edit failed (transient) — keeping message, will retry next restart");
          return;
        }
        logger.warn({ traderMessageId: msgId, guildId }, "Trader message no longer exists (10008) — re-posting once");
        setTraderMessageId(guildId, null);
        await clearTraderMessageId(guildId).catch(() => null);
        msgId = null;
      }
    }

    const msg = await channel.send({ embeds: [embed], components: rows });
    setTraderMessageId(guildId, msg.id);
    await saveTraderMessageId(guildId, msg.id);
    await saveTraderEmbedSig(guildId, currentSig);
    logger.info({ traderMessageId: msg.id, channelId: getChannel("trader", guildId), guildId }, "Trader message posted and persisted");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to set up trader");
  } finally {
    traderSetupInProgress.set(guildId, false);
  }
}

export async function startBot(onReady?: () => void): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot will not start");
    return;
  }

  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ];
  const wantsMessageContent =
    process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true" && !privilegedIntentFellBack;
  if (wantsMessageContent) {
    intents.push(GatewayIntentBits.MessageContent);
  } else if (process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true" && privilegedIntentFellBack) {
    logger.warn(
      "MessageContent intent was rejected (code 4014) on a prior attempt — booting WITHOUT it. " +
        "Enable the 'Message Content Intent' toggle in the Discord Developer Portal, then restart the bot.",
    );
  }
  const client = new Client({ intents });

  // Event-loop lag monitor: if the loop is blocked, interactions pile up and
  // expire (10062). A tick scheduled every second should fire ~on time.
  {
    let lastTick = Date.now();
    setInterval(() => {
      const now = Date.now();
      const lagMs = now - lastTick - 1000;
      lastTick = now;
      if (lagMs > 500) {
        logger.warn({ lagMs }, "Event loop lag detected — something is blocking the process");
      }
    }, 1000).unref?.();
  }

  let rejectTerminated!: (err: Error) => void;
  let resolveTerminated!: () => void;
  const terminated = new Promise<void>((resolve, reject) => {
    resolveTerminated = resolve;
    rejectTerminated = reject;
  });

  // Set when a newer bot instance claims leadership in the DB and this one
  // shuts itself down — suppresses disconnect alerts caused by our own destroy().
  let yieldedLeadership = false;

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "✅ Discord bot online and ready");
    botClient = client;
    botReadyAt = new Date();
    shardStatus = "ready";

    await ensureBotStateTable().catch((err) =>
      logger.error({ err }, "Failed to ensure bot_state table exists"),
    );

    // Run multi-guild migrations once at startup
    await runMultiGuildMigrations().catch((err) =>
      logger.error({ err }, "Failed to run multi-guild migrations"),
    );

    // Initialize each guild the bot is in
    const guilds = c.guilds.cache;
    logger.info({ guildCount: guilds.size }, "Bot is in guilds — initializing per-guild scheduler");

    for (const [guildId, guild] of guilds) {
      await initChannelConfig(guildId).catch((err) =>
        logger.error({ err, guildId }, "Failed to load channel config for guild"),
      );
      if (!hasAnyChannelConfigured(guildId)) {
        void sendOnboardingMessage(guild).catch((err) =>
          logger.warn({ err, guildId }, "Failed to send onboarding message"),
        );
      }
      startGuildScheduler(client, guildId);
      void setupTrader(client, guildId);
    }

    logOracleChatStatus();
    if (onReady) onReady();

    await maybeAlertOracleRecovery(getOracleReplyMode, consumeOracleFellBackMarker, sendAlert);

    // ── Single-instance guard ─────────────────────────────────────────────────
    // Claim leadership (last writer wins), then periodically re-check the
    // marker. If a NEWER process claims it (e.g. after a redeploy while this
    // old VM is still alive), shut this bot down so two gateway sessions never
    // race to acknowledge the same interactions (40060/10062 → laggy bot).
    const instanceId = randomUUID();
    try {
      await claimBotInstance(instanceId);
      logger.info({ instanceId }, "Claimed bot instance leadership");
    } catch (err) {
      // Could not claim — skip the watchdog entirely so a stale marker from a
      // previous instance can never make THIS legitimate instance yield.
      logger.error({ err }, "Failed to claim bot instance leadership — watchdog disabled");
      return;
    }

    const watchdog = setInterval(() => {
      void getBotInstanceHolder()
        .then((holder) => {
          if (yieldedLeadership || !shouldYieldLeadership(holder, instanceId)) return;
          yieldedLeadership = true;
          clearInterval(watchdog);
          logger.error(
            { holder, instanceId },
            "Another bot instance claimed leadership — yielding: stopping schedulers and disconnecting this bot",
          );
          shardStatus = "yielded";
          botClient = null;
          for (const [guildId] of client.guilds.cache) {
            stopGuildScheduler(guildId);
          }
          void sendAlert(
            "⚠️ **Instanță duplicată detectată.** O instanță mai nouă a botului a preluat controlul — instanța veche s-a oprit singură pentru a evita răspunsuri duble/lente.",
          );
          void client.destroy();
          resolveTerminated();
        })
        .catch((err) => {
          logger.warn({ err }, "Bot instance watchdog check failed — will retry");
        });
    }, INSTANCE_WATCHDOG_INTERVAL_MS);
    watchdog.unref?.();
  });

  // When the bot joins a new guild, start the scheduler for it
  client.on(Events.GuildCreate, async (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Bot joined new guild");
    // Clear any guild-specific commands so only global commands show (prevents duplicates)
    void new REST().setToken(token!).put(
      Routes.applicationGuildCommands(APPLICATION_ID, guild.id),
      { body: [] },
    ).catch((err) => logger.warn({ err, guildId: guild.id }, "Could not clear guild commands on join"));
    await initChannelConfig(guild.id).catch((err) =>
      logger.error({ err, guildId: guild.id }, "Failed to init channel config for new guild"),
    );
    if (!hasAnyChannelConfigured(guild.id)) {
      void sendOnboardingMessage(guild).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "Failed to send onboarding message"),
      );
    }
    startGuildScheduler(client, guild.id);
    void setupTrader(client, guild.id);
  });

  // When the bot leaves a guild, clean up in-memory state
  client.on(Events.GuildDelete, (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Bot left guild — cleaning up scheduler state");
    stopGuildScheduler(guild.id);
    traderMessageIds.delete(guild.id);
    traderSetupInProgress.delete(guild.id);
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.guildId) return;
    try {
      recordMessage(
        message.author.id,
        message.member?.displayName ?? message.author.username,
        message.content ?? "",
      );
    } catch (err) {
      logger.error({ err }, "Oracle messageCreate handler failed");
    }
    // Only messages in the configured main channel count toward the activity
    // gate and milestone trigger — prevents unrelated channels from keeping
    // chest spawns alive or triggering bonus chests.
    const mainChannelId = getChannel("main", message.guildId);
    if (mainChannelId && message.channelId === mainChannelId) {
      recordGuildActivity(client, message.guildId);
    }
    void handleToxicity(client, message).then((handled) => {
      if (!handled) void maybeReplyAsOracle(client, message);
    });
  });

  function scheduleDisconnectAlert(closeCode: number) {
    if (disconnectAlertTimer) return;
    const thresholdMin = Math.round(DISCONNECT_ALERT_THRESHOLD_MS / 60_000);
    disconnectAlertTimer = setTimeout(() => {
      disconnectAlertTimer = null;
      void sendAlert(
        `⚠️ **Bot has been offline for over ${thresholdMin} minute${thresholdMin === 1 ? "" : "s"}** and has not reconnected yet.\nShard disconnected with code ${closeCode}. Check server logs for details.`,
      );
    }, DISCONNECT_ALERT_THRESHOLD_MS);
  }

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
    // Deliberate self-shutdown after losing instance leadership — not an outage.
    if (yieldedLeadership) return;
    if (event.code === 4014 && wantsMessageContent) {
      logger.error(
        { shardId },
        "Discord rejected the MessageContent intent (code 4014) — it is not enabled in the Developer Portal. " +
          "Restarting WITHOUT it; the Oracle will only answer @mentions and ping-on replies until the toggle is enabled.",
      );
      privilegedIntentFellBack = true;
      void markOracleFellBack();
      botClient = null;
      shardStatus = "fatal_disconnect";
      client.destroy();
      void sendAlert(
        "⚠️ **Oracolul nu a putut activa intenția \u201eMessage Content\u201d.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
          "Botul repornește fără ea — răspunde doar la @mention și la reply-uri cu ping. Activează comutatorul în portal, apoi repornește botul.",
      );
      rejectTerminated(new Error("Disallowed MessageContent intent (4014) — falling back without it"));
      return;
    }
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

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    clearDisconnectAlert("ShardResume");
    shardStatus = "ready";
    botReadyAt = new Date();
    logger.info({ shardId, replayedEvents }, "Discord shard resumed");
  });

  client.on(Events.ShardReady, (shardId) => {
    clearDisconnectAlert("ShardReady");
    shardStatus = "ready";
    botReadyAt = new Date();
    // Re-setup trader for all known guilds on reconnect
    for (const [guildId] of client.guilds.cache) {
      void setupTrader(client, guildId);
    }
    logger.info({ shardId }, "Discord shard ready (fresh identify)");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (seenInteractionIds.has(interaction.id)) {
      logger.warn({ interactionId: interaction.id }, "Duplicate interaction delivery — skipping");
      return;
    }
    seenInteractionIds.add(interaction.id);
    setTimeout(() => seenInteractionIds.delete(interaction.id), INTERACTION_DEDUP_TTL_MS).unref?.();

    // Ignore DM interactions — all commands require a guild context
    if (!interaction.guildId) return;

    const label = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : "customId" in interaction
        ? String(interaction.customId)
        : interaction.type.toString();

    // Diagnose latency: how old was this interaction when it reached us?
    const ageMs = Date.now() - interaction.createdTimestamp;
    if (ageMs > 1500) {
      logger.warn(
        { ageMs, label, wsPing: client.ws.ping },
        "Interaction arrived late — gateway/event-loop lag (>3s causes 10062)",
      );
    }

    function dispatch(p: Promise<unknown>) {
      const startedAt = Date.now();
      p.then(
        () => {
          const durationMs = Date.now() - startedAt;
          if (durationMs > 2500) {
            logger.warn({ durationMs, label }, "Slow interaction handler");
          }
        },
        (err) => {
          logger.error({ err, label, ageMs, durationMs: Date.now() - startedAt }, "Interaction error");
        },
      );
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "profil") dispatch(handleProfil(interaction));
      if (interaction.commandName === "clasament") dispatch(handleClasament(interaction));
      if (interaction.commandName === "magazin") dispatch(handleMagazin(interaction));
      if (interaction.commandName === "clasa") dispatch(handleClasa(interaction));
      if (interaction.commandName === "companion") dispatch(handleCompanion(interaction));
      if (interaction.commandName === "ajutor") dispatch(handleAjutor(interaction));
      if (interaction.commandName === "misiuni") dispatch(handleMisiune(interaction));
      if (interaction.commandName === "startevent") dispatch(handleStartEvent(interaction));
      if (interaction.commandName === "cufar") dispatch(handleSpawnChest(interaction));
      if (interaction.commandName === "spawnboss") dispatch(handleSpawnBoss(interaction));
      if (interaction.commandName === "blestem") dispatch(handleBlestem(interaction));
      if (interaction.commandName === "admin") dispatch(handleAdmin(interaction));
      if (interaction.commandName === "setcanale") dispatch(handleSetCanale(interaction));
    } else if (interaction.isButton()) {
      dispatch(handleButton(interaction as ButtonInteraction));
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "leaderboard_profile_select") {
        dispatch(handleClasamentSelect(interaction));
      }
    }

  });

  try {
    await client.login(token);
  } catch (err) {
    if (wantsMessageContent && isDisallowedIntentError(err)) {
      logger.error(
        { err },
        "Login rejected for the MessageContent intent (disallowed) — restarting WITHOUT it. " +
          "Enable the 'Message Content Intent' toggle in the Discord Developer Portal.",
      );
      privilegedIntentFellBack = true;
      void markOracleFellBack();
      void sendAlert(
        "⚠️ **Oracolul nu a putut activa intenția \u201eMessage Content\u201d.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
          "Botul repornește fără ea — răspunde doar la @mention și la reply-uri cu ping. Activează comutatorul în portal, apoi repornește botul.",
      );
    }
    throw err;
  }

  // Register commands globally so they appear on every server
  const rest = new REST().setToken(token);
  const body = slashCommands.map((c) => c.toJSON());
  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body });
  logger.info("Commands registered globally");

  // Remove any leftover guild-specific commands (can cause duplicates in Discord)
  const clearGuildCommands = async (guildId: string) => {
    try {
      await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, guildId), { body: [] });
    } catch (err) {
      logger.warn({ err, guildId }, "Could not clear guild commands (non-fatal)");
    }
  };
  await Promise.all([...client.guilds.cache.keys()].map(clearGuildCommands));
  logger.info({ count: client.guilds.cache.size }, "Cleared guild-specific commands for all guilds");

  await terminated;
}
