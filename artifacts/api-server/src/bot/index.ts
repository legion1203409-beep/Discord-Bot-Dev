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
import { startScheduler, APPLICATION_ID, fireEvent, fireChest, fireChestForced, fireFinalBoss, fireLockedChest, fireKeyChest, claimedChests, activeBossMap, checkBossEligibility, checkBossHitCooldown, BOSS_HIT_COOLDOWN_MS, persistBossState, type BossState, type BossPlayerStats } from "./scheduler";
import { recordMessage } from "./oracle";
import { maybeReplyAsOracle, logOracleChatStatus } from "./oracle-chat";
import { handleToxicity } from "./oracle-guard";
import { getRewardMultipliers, getCombatModifiers, formatActiveEffects } from "./status-effects";
import { handleBlestem, handleAdminGhid } from "./oracle-blestem";
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
  addPlayerKey,
  consumePlayerKey,
  deleteActiveBoss,
  clearActiveChest,
  KEYCHEST_DBKEY,
  LOCKCHEST_DBKEY,
  type AbilityKind,
  type KeyType,
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
  empowerMult,
  shieldReduction,
  buildFinalBossEmbed,
  buildBossLeaderboard,
  buildLockedChestEmbed,
  buildKeyDropMessage,
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
// Set when a login attempt that requested the privileged MessageContent intent
// is rejected with code 4014 ("Disallowed intent"). On the supervisor's next
// restart the bot then boots WITHOUT the privileged intent (degraded — only
// mention/ping-reply behavior) instead of looping forever bricked. This makes
// flipping ORACLE_MESSAGE_CONTENT_ENABLED on safe even if the operator forgets
// to enable the Message Content toggle in the Discord Developer Portal.
let privilegedIntentFellBack = false;

// Durable marker recording that the Oracle fell back to degraded mode because the
// "Message Content" portal toggle was missing (code 4014). `privilegedIntentFellBack`
// is in-memory and resets on every process restart — which is exactly the recovery
// path (operator flips the toggle, then restarts) — so it cannot tell a fresh
// process that it had previously fallen back. The marker is persisted in the DB
// (see recordOracleFellBack/consumeOracleFellBack in ./db) so it survives not just
// an in-container restart but a full redeploy or autoscale instance swap — a fresh
// container wipes os.tmpdir(), which would otherwise silently drop the pending
// recovery alert. The recovery alert then fires once the Oracle boots back in
// full-reply mode.

// Record that we fell back, so a later full-mode boot can confirm the recovery.
async function markOracleFellBack(): Promise<void> {
  try {
    const { recordOracleFellBack } = await import("./db");
    await recordOracleFellBack();
  } catch (err) {
    logger.warn(
      { err },
      "Could not persist Oracle fallback marker — the recovery alert may not fire after restart",
    );
  }
}

// Returns true (and clears the marker) when a prior fallback is recorded. Used at
// ClientReady in full mode to send a one-time recovery alert.
async function consumeOracleFellBackMarker(): Promise<boolean> {
  try {
    const { consumeOracleFellBack } = await import("./db");
    return await consumeOracleFellBack();
  } catch (err) {
    logger.warn({ err }, "Could not read/clear the Oracle fallback marker after recovery");
    return false;
  }
}

// Checks whether the Oracle just recovered to full-reply mode after a prior
// portal-toggle fallback, and fires the one-time operator alert if so.
// Extracted from the ClientReady handler so it can be unit-tested with
// injected dependencies — the real call site passes the live implementations.
// Correctness requirements:
//   • Only alerts when mode is "full" AND a marker was actually recorded —
//     no noise on a normal first-time full-mode boot.
//   • Does NOT consume the marker when mode is degraded (short-circuits before
//     the consume call) so a future full-mode boot still sees the marker.
//   • Alert fires exactly once because consumeMarker is an atomic DELETE …
//     RETURNING — only one concurrent boot wins the row.
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

// Whether the Oracle is currently answering every reply ("full") or only
// @mentions and ping-on replies ("degraded"). Full mode requires the privileged
// MessageContent intent, which needs BOTH the env flag AND the Developer-Portal
// toggle. The reason distinguishes the operator not enabling the feature at all
// from the runtime 4014 fallback (toggle missing in the portal).
export function getOracleReplyMode(): OracleReplyMode {
  const enabled = process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true";
  if (!enabled) return { mode: "degraded", reason: "disabled" };
  if (privilegedIntentFellBack) return { mode: "degraded", reason: "portal_toggle_missing" };
  return { mode: "full", reason: "active" };
}

export function getBotClient(): Client | null {
  return botClient;
}

export { GUILD_ID };

// Discord Gateway close codes that mean the session cannot be resumed.
// discord.js will NOT auto-reconnect for these; the supervisor must restart.
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4013, 4014]);

// Whether a thrown login error is Discord rejecting a privileged intent we asked
// for (code 4014 / "Disallowed intents"). discord.js raises this in different
// shapes across versions, so match on code and message text defensively.
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

async function handleMagazin(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const p = await upsertPlayer(interaction.user.id, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "overview")], components: shopRows(p) });
}

async function isOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.guild && interaction.user.id === interaction.guild.ownerId) return true;
  await interaction.reply({
    content: "🔒 Doar creatorul Regatului poate folosi această comandă.",
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
  const tipOpt = interaction.options.getString("tip") ?? "normal";
  const multStr = interaction.options.getString("multiplicator") ?? "1";
  const mult = (multStr === "2" || multStr === "3") ? (parseInt(multStr) as 2 | 3) : undefined;

  if (tipOpt === "cheie") {
    const keyOpt = interaction.options.getString("cheie") ?? "random";
    await interaction.reply({ content: "🗝️ *Cenușa zornăie…* Un cufăr de chei apare în Regat!", ephemeral: true });
    if (botClient) await fireKeyChest(botClient, keyOpt);
    return;
  }

  const isLocked = tipOpt === "blocat" || rarityOpt === "regal";

  if (isLocked) {
    const lockedRarity = rarityOpt === "random" ? "argint" : rarityOpt;
    await interaction.reply({ content: "🔒 *Cenușa se ridică…* Un cufăr blocat apare în Regat!", ephemeral: true });
    if (botClient) await fireLockedChest(botClient, lockedRarity);
  } else {
    await interaction.reply({ content: "📦 *Cenușa se ridică…* Un cufăr apare în Regat!", ephemeral: true });
    if (botClient) {
      if (rarityOpt === "random") {
        if (mult != null) {
          // Admin picked a specific multiplier — roll a rarity and use fireChestForced
          // so the bonus is encoded in the customId and applied at claim time.
          const { rarity } = rollChest();
          await fireChestForced(botClient, rarity.key, mult);
        } else {
          await fireChest(botClient);
        }
      } else {
        await fireChestForced(botClient, rarityOpt, mult);
      }
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
  const sub = interaction.options.getSubcommand();
  // ghid is available to any admin — no owner check needed
  if (sub === "ghid") { await handleAdminGhid(interaction); return; }
  if (!(await isOwner(interaction))) return;

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

const CLAIM_TTL_MS = 10 * 60 * 1000;

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
  void clearActiveChest().catch(() => null);

  // Determine effective multiplier: an admin-forced bonus (_x2/_x3 in customId)
  // takes priority; otherwise roll a surprise multiplier (×1/×2/×3) at claim time.
  const effectiveMult = multOverride > 1 ? multOverride : rollChestMultiplier();
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
  setTimeout(() => { void interaction.message.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const claimMsg = CHEST_CLAIM_MSG[rarityKey] ?? CHEST_CLAIM_MSG["bronz"]!;
  const claimReply = await interaction.followUp({ content: claimMsg(interaction.user.username, totalGold) });
  setTimeout(() => { void claimReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  // Reveal the surprise multiplier — every claim shows what landed.
  const revealContent = effectiveMult > 1
    ? `🎲 **Norocul Cenușii!** A picat **×${effectiveMult}**! Obolii s-au înmulțit (${gold} × ${effectiveMult} = **${totalGold} Oboli**)! ${effectiveMult === 3 ? "🔥🔥🔥" : "✨"}`
    : `🎲 **Norocul Cenușii:** a picat **×1** de data asta — fără bonus. Ai primit **${gold} Oboli**.`;
  const bonusReply = await interaction.followUp({ content: revealContent });
  setTimeout(() => { void bonusReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  // Key drop roll
  const keyDrop = KEY_DROP[rarityKey];
  if (keyDrop && Math.random() < keyDrop.chance) {
    const keyType = keyDrop.keyType as KeyType;
    await addPlayerKey(interaction.user.id, keyType);
    const keyDropReply = await interaction.followUp({ content: buildKeyDropMessage(rarityKey, keyType) });
    setTimeout(() => { void keyDropReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    logger.info({ discordId: interaction.user.id, chestId, rarityKey, keyType }, "Key dropped");
  }

  logger.info({ discordId: interaction.user.id, chestId, rarityKey, gold, effectiveMult, totalGold }, "Chest claimed");
}

async function handleLockedChestClaim(interaction: ButtonInteraction, chestId: string, rarityKey: string, gold: number) {
  await interaction.deferUpdate();

  const keyType = CHEST_KEY_REQUIRED[rarityKey] as KeyType | undefined;
  if (!keyType) {
    await interaction.followUp({ content: "❌ Cufăr necunoscut.", flags: MessageFlags.Ephemeral });
    return;
  }
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const sourceLabel = KEY_SOURCE_LABEL[keyType] ?? "cufere comune";

  // Atomic key consume — if returns false, player has no key
  const keyConsumed = await consumePlayerKey(interaction.user.id, keyType);
  if (!keyConsumed) {
    await interaction.followUp({
      content:
        `🔒 **Nu ai ${keyLabel}!**\n` +
        `Obți cheia revendicând **${sourceLabel}** — ai noroc la revendicare!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Key was consumed — try to be first claimer
  if (claimedChests.has(chestId)) {
    // Someone else already opened it — refund the key
    await addPlayerKey(interaction.user.id, keyType);
    await interaction.followUp({
      content: `😔 Cineva a fost mai rapid! **${keyLabel}** ta a fost returnată. Folosește-o la alt cufăr blocat!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(LOCKCHEST_DBKEY).catch(() => null);

  await upsertPlayer(interaction.user.id, interaction.user.username);
  await addPlayerGold(interaction.user.id, gold);

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
  const lockedReply = await interaction.followUp({
    content:
      `🗝️ **${interaction.user.username}** a folosit **${keyLabel}** și a deschis **${rarityLabel}**!\n` +
      `💰 **${gold} Oboli** eliberați din cufărul blocat!`,
  });
  setTimeout(() => { void lockedReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  logger.info({ discordId: interaction.user.id, chestId, rarityKey, gold, keyType }, "Locked chest claimed");
}

async function handleKeyChestClaim(interaction: ButtonInteraction, chestId: string, keyType: string) {
  await interaction.deferUpdate();
  // has()/add() stay adjacent (no await between) so concurrent clicks can't double-claim.
  if (claimedChests.has(chestId)) {
    await interaction.followUp({ content: "😔 Cineva a fost mai rapid! Cheia a fost deja luată.", flags: MessageFlags.Ephemeral });
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(KEYCHEST_DBKEY).catch(() => null);

  await upsertPlayer(interaction.user.id, interaction.user.username);
  await addPlayerKey(interaction.user.id, keyType as KeyType);

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
    // Oracle blessings/curses also scale combat rewards.
    const rmods = getRewardMultipliers(p.discordId);
    result.xpGained = Math.round(result.xpGained * rmods.xpMult);
    result.oboliGained = Math.round(result.oboliGained * rmods.goldMult);
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

const EVENT_CHANNEL_ID   = "1521185682200989726";
const BOSS_CHANNEL_ID    = "1521186913476673556";
/** Dedicated channel where boss leaderboards are posted permanently. */
const BOSS_TOP_CHANNEL_ID = "1521186981525327993";

async function handleFinalBoss(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  // Boss fight happens AFTER the event ends — check activeBossMap, not DB active status
  const uid = interaction.user.id;
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

  // Participant confirmed — register in DB if needed
  const activeBoss = boss!;
  const player = await upsertPlayer(uid, interaction.user.username);

  // Store username for embed + leaderboard
  activeBoss.playerNames.set(uid, interaction.user.username);

  // Initialize player HP + stats from global player record (first hit only)
  if (!activeBoss.playerHp.has(uid)) {
    activeBoss.playerHp.set(uid, Math.max(10, 100 + player.maxHpBonus));
  }
  if (!activeBoss.playerStats.has(uid)) {
    const stats: BossPlayerStats = {
      atk: player.attackBonus,
      def: player.defenseBonus,
      dodge: player.dodgeBonus,
      crit: player.critBonus,
      maxHp: 100 + player.maxHpBonus,
    };
    activeBoss.playerStats.set(uid, stats);
  }
  const myHp = activeBoss.playerHp.get(uid)!;
  const myMaxHp = 100 + player.maxHpBonus;

  // 4-second cooldown per player
  const cooldown = checkBossHitCooldown(activeBoss.lastHitAt, uid);
  if (cooldown.onCooldown) {
    await interaction.followUp({
      content: `⏳ Recuperare… mai poți lovi în **${cooldown.remainingSeconds}s**!\n❤️ Viața ta: **${myHp} / ${myMaxHp} HP** | 🐉 Dragon: **${activeBoss.currentHp.toLocaleString()} / ${activeBoss.maxHp.toLocaleString()} HP**`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Oracle blessings/curses apply live in boss fights too.
  const mods = getCombatModifiers(uid);

  // Player damage based on global attack stat, with crit + ability + effect multipliers
  const minDmg = Math.max(30, player.attackBonus * 5 + 20);
  const maxDmg = Math.max(80, player.attackBonus * 15 + 60);
  let playerDmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
  const isCrit = Math.random() * 100 < Math.min(100, Math.max(0, player.critBonus + mods.critAdd));
  if (isCrit) playerDmg *= 2;
  // Lovitura Umbrei (empower) — consume any queued empower for this player.
  const usedEmpower = activeBoss.empowerNext.delete(uid) && player.abilityEmpowerLevel >= 1;
  if (usedEmpower) playerDmg = Math.round(playerDmg * empowerMult(player.abilityEmpowerLevel));
  if (mods.damageMult !== 1) playerDmg = Math.round(playerDmg * mods.damageMult);
  const critTag = isCrit ? " 💥 **CRITIC!**" : "";

  // Boss counter-attack — REAL damage to player HP, scaled by shield + damage-taken effects
  let bossHit = Math.floor(Math.random() * 121) + 80; // 80–200
  // Scut de Cenușă (shield) — consume any queued shield for this player.
  const usedShield = activeBoss.shieldNext.delete(uid) && player.abilityShieldLevel >= 1;
  if (usedShield) bossHit = Math.max(1, Math.round(bossHit * (1 - shieldReduction(player.abilityShieldLevel))));
  if (mods.damageTakenMult !== 1) bossHit = Math.max(1, Math.round(bossHit * mods.damageTakenMult));
  const newPlayerHp = Math.max(0, myHp - bossHit);

  const abilityLine =
    (usedEmpower ? "🌑 **LOVITURA UMBREI!** Puterea Umbrelor ți-a dublat lovitura!\n" : "") +
    (usedShield ? "🛡️ **SCUT DE CENUȘĂ activ!** Daunele primite au fost reduse.\n" : "");

  // Apply damage
  activeBoss.lastHitAt.set(uid, Date.now());
  activeBoss.damageBy.set(uid, (activeBoss.damageBy.get(uid) ?? 0) + playerDmg);
  activeBoss.currentHp = Math.max(0, activeBoss.currentHp - playerDmg);
  activeBoss.playerHp.set(uid, newPlayerHp);

  const bossDefeated = activeBoss.currentHp <= 0 && !activeBoss.defeated;

  if (bossDefeated) {
    activeBoss.defeated = true;
    activeBossMap.delete(eventId);
    // Await the DB delete so a crash immediately after rewarding cannot
    // leave a stale row that gets rehydrated as a live boss.
    await deleteActiveBoss(eventId).catch(err =>
      logger.error({ err, eventId }, "Failed to delete defeated boss row — stale row may persist until next restart")
    );

    // Reward everyone who dealt damage — scaled by rank + boss rarity
    const bossRewards = computeBossRewards(activeBoss.damageBy, activeBoss.rarity);
    // Oracle blessings/curses scale each fighter's boss rewards (XP + Oboli).
    for (const [discordId, r] of bossRewards) {
      const rmods = getRewardMultipliers(discordId);
      r.gold = Math.round(r.gold * rmods.goldMult);
      r.xp = Math.round(r.xp * rmods.xpMult);
    }
    // Random key drops for fighters — keys can also be found during events.
    const eventKeyDrops = rollEventKeyDrops([...activeBoss.damageBy.keys()]);
    await Promise.all([
      ...[...bossRewards.entries()].flatMap(([discordId, r]) => [
        addPlayerReputation(discordId, r.rep),
        addPlayerGold(discordId, r.gold),
        addPlayerXp(discordId, r.xp),
      ]),
      ...[...eventKeyDrops.entries()].map(([discordId, kt]) => addPlayerKey(discordId, kt as KeyType)),
    ]);

    // Delete boss message from fight channel; send leaderboard to permanent top channel.
    try {
      const fightCh = await interaction.client.channels.fetch(activeBoss.channelId).catch(() => null);
      if (fightCh instanceof TextChannel) {
        const bossMsg = await fightCh.messages.fetch(activeBoss.messageId).catch(() => null);
        await bossMsg?.delete().catch(() => null);
      }
      const topCh = await interaction.client.channels.fetch(BOSS_TOP_CHANNEL_ID).catch(() => null);
      if (topCh instanceof TextChannel) {
        const leaderboard = buildBossLeaderboard(activeBoss, activeBoss.damageBy, activeBoss.participants, activeBoss.playerNames, activeBoss.playerHp);
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
    const rewLine = myReward
      ? `🏅 Tu primești: **+${myReward.rep} Rep, +${myReward.gold} Oboli, +${myReward.xp} XP**!`
      : `🏅 Recompensele au fost distribuite!`;

    await interaction.followUp({
      content:
        abilityLine +
        `⚔️ **${interaction.user.username}** a dat lovitura finală! **${playerDmg.toLocaleString()} daune**!${critTag}\n` +
        `💀 **Dragonul Stins a căzut!** Regatul este salvat!\n` +
        rewLine,
    });
    return;
  }

  // Snapshot the updated fight state to DB so a restart can resume the fight.
  void persistBossState(activeBoss);

  // Update boss embed with new HP + live damage list
  try {
    const ch = await interaction.client.channels.fetch(activeBoss.channelId);
    if (ch instanceof TextChannel) {
      const bossMsg = await ch.messages.fetch(activeBoss.messageId).catch(() => null);
      if (bossMsg) {
        await bossMsg.edit({
          embeds: [buildFinalBossEmbed(activeBoss.level, activeBoss.rarity, activeBoss.currentHp, activeBoss.maxHp, activeBoss.damageBy, activeBoss.playerNames, activeBoss.playerHp, activeBoss.playerStats, activeBoss.expiresAt)],
          components: [finalBossRow(eventId)],
        }).catch(() => null);
      }
    }
  } catch { /* ignore */ }

  const playerStatus = newPlayerHp <= 0
    ? `💀 **Ai fost doborât de Dragon!** Nu mai poți lovi.`
    : `❤️ Viața ta: **${newPlayerHp} / ${myMaxHp} HP**`;

  const effectsLine = formatActiveEffects(uid);
  await interaction.followUp({
    content:
      abilityLine +
      `⚔️ Ai lovit Dragonul pentru **${playerDmg.toLocaleString()} daune**!${critTag}\n` +
      `🐉 Dragonul te lovește pentru **${bossHit} daune**! ${playerStatus}\n` +
      `🩸 Dragon: **${activeBoss.currentHp.toLocaleString()} / ${activeBoss.maxHp.toLocaleString()} HP**` +
      (effectsLine ? `\n✨ **Efecte active:**\n${effectsLine}` : ""),
    ephemeral: true,
  });
}

// Activate Lovitura Umbrei (empower) or Scut de Cenușă (shield) during a boss
// fight. Abilities are boss-local here (the event/participant is gone), so the
// queued flag + cooldown live on BossState, keyed by discordId.
async function handleBossAbility(interaction: ButtonInteraction, eventId: number, kind: string) {
  await interaction.deferUpdate();
  const uid = interaction.user.id;
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
  const player = await upsertPlayer(uid, interaction.user.username);

  const owns = kind === "shield" ? player.abilityShieldLevel >= 1 : player.abilityEmpowerLevel >= 1;
  if (!owns) {
    await interaction.followUp({ content: "🔒 Nu deții această abilitate. O poți debloca din Forja Cenușii (`/magazin`).", flags: MessageFlags.Ephemeral });
    return;
  }

  const readyAt = activeBoss.abilityReadyAt.get(uid) ?? 0;
  if (readyAt > Date.now()) {
    const remaining = Math.ceil((readyAt - Date.now()) / 1000);
    await interaction.followUp({ content: `⏳ Abilitatea e pe cooldown — mai așteaptă **${remaining}s**.`, flags: MessageFlags.Ephemeral });
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
  // Persist ability state so a restart doesn't lose queued abilities/cooldowns.
  void persistBossState(activeBoss);
}


async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith("profile_view_")) {
    return handleViewProfile(interaction, id.replace("profile_view_", ""));
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
  if (id.startsWith("bossability_")) {
    const parts = id.split("_"); // bossability_<eventId>_<kind>
    return handleBossAbility(interaction, parseInt(parts[1]!), parts[2]!);
  }
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

  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ];
  // MessageContent is privileged — only request it when explicitly enabled so a
  // missing Developer-Portal toggle can never brick the bot at login (code 4014).
  // If a previous attempt was rejected with 4014, fall back to running without it
  // so the bot still boots (degraded) instead of looping forever.
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
      logOracleChatStatus();
    } else {
      logger.info("Scheduler already running — skipping re-init after restart");
    }
    if (onReady) onReady();

    await maybeAlertOracleRecovery(getOracleReplyMode, consumeOracleFellBackMarker, sendAlert);
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  // Feed the Oracle activity/toxicity tracker. Never logs message content.
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
    // Toxicity guard first: if the user swore at the bot, apply the curse and
    // skip the normal Oracle reply. Both paths are fire-and-forget.
    void handleToxicity(client, message).then((handled) => {
      if (!handled) void maybeReplyAsOracle(client, message);
    });
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
    // Disallowed intent: we requested MessageContent but the portal toggle is off.
    // Mark the fallback so the supervisor's next restart drops the privileged
    // intent and the bot boots (degraded) instead of bricking in a restart loop.
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
        "⚠️ **Oracolul nu a putut activa intenția „Message Content”.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
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
        if (interaction.commandName === "blestem") await handleBlestem(interaction);
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

  try {
    await client.login(token);
  } catch (err) {
    // Some discord.js versions surface a disallowed privileged intent here rather
    // than via ShardDisconnect. Detect it and fall back so the next restart drops
    // the privileged intent instead of looping forever on a fatal login error.
    if (wantsMessageContent && isDisallowedIntentError(err)) {
      logger.error(
        { err },
        "Login rejected for the MessageContent intent (disallowed) — restarting WITHOUT it. " +
          "Enable the 'Message Content Intent' toggle in the Discord Developer Portal.",
      );
      privilegedIntentFellBack = true;
      void markOracleFellBack();
      void sendAlert(
        "⚠️ **Oracolul nu a putut activa intenția „Message Content”.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
          "Botul repornește fără ea — răspunde doar la @mention și la reply-uri cu ping. Activează comutatorul în portal, apoi repornește botul.",
      );
    }
    throw err;
  }

  const rest = new REST().setToken(token);
  const body = slashCommands.map((c) => c.toJSON());
  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: [] });
  await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID), { body });
  logger.info("Commands registered");

  // Hold here until a fatal disconnect signals the supervisor to restart.
  await terminated;
}
