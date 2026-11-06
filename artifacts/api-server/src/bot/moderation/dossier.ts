/**
 * /dosar @membru: tot ce știe moderarea despre un membru, într-un singur mesaj
 * vizibil doar celui care a cerut-o: contul, intrarea pe server, sancțiunile
 * (pe fel și ultimele cazuri), contestațiile și o stare generală
 * („curat”, „de urmărit”, „risc ridicat”). E doar citire, nu schimbă nimic.
 */
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type GuildMember, type User } from "discord.js";
import { logger } from "../../lib/logger";
import { moderationStore, type ModerationCase } from "../../moderation/store";

const DAY_MS = 86_400_000;
const WATCH_DAYS = 30;

const ACTION_LABELS: Record<string, { label: string; emoji: string }> = {
  warn: { label: "Avertismente", emoji: "⚠️" },
  mute: { label: "Timeout-uri", emoji: "🔇" },
  kick: { label: "Kick-uri", emoji: "👢" },
  ban: { label: "Banuri", emoji: "⛔" },
  unmute: { label: "Timeout-uri ridicate", emoji: "🔈" },
  purge: { label: "Curățări de mesaje", emoji: "🧹" },
  nick: { label: "Porecle schimbate", emoji: "🏷️" },
  role: { label: "Roluri date", emoji: "🎭" },
};
/** The sanctions that count towards the member's standing. */
const SANCTIONS = ["warn", "mute", "kick", "ban"] as const;

export type DossierInput = {
  user: { id: string; username: string; displayName: string; avatarUrl: string; bot: boolean; createdAt: Date };
  member: { joinedAt: Date | null; roleCount: number; timeoutUntil: Date | null; nickname: string | null } | null;
  banned: { reason: string | null } | null;
  cases: Array<Pick<ModerationCase, "id" | "actionType" | "reason" | "status" | "createdAt" | "actorId" | "appealStatus">>;
  now: Date;
};

export type Standing = { level: "clean" | "watch" | "risk"; label: string; color: number; why: string };

/** A quick read of how a member stands, from recent sanctions. It is a hint for staff, never a verdict. */
export function dossierStanding(cases: DossierInput["cases"], banned: boolean, now: Date): Standing {
  const recent = cases.filter((item) => SANCTIONS.includes(item.actionType as never) && now.getTime() - item.createdAt.getTime() <= WATCH_DAYS * DAY_MS);
  const hardOnes = cases.filter((item) => item.actionType === "ban" || item.actionType === "kick").length;
  if (banned) return { level: "risk", label: "🔴 Risc ridicat", color: 0xd94a2b, why: "Are ban activ pe server." };
  if (recent.length >= 3 || hardOnes > 0) {
    return { level: "risk", label: "🔴 Risc ridicat", color: 0xd94a2b, why: hardOnes > 0 ? "Are un kick sau un ban în istoric." : `${recent.length} sancțiuni în ultimele ${WATCH_DAYS} de zile.` };
  }
  if (recent.length >= 1) return { level: "watch", label: "🟡 De urmărit", color: 0xd8a964, why: `${recent.length} ${recent.length === 1 ? "sancțiune" : "sancțiuni"} în ultimele ${WATCH_DAYS} de zile.` };
  return { level: "clean", label: "🟢 Curat", color: 0x36a878, why: cases.length ? "Are sancțiuni vechi, nimic recent." : "Nicio sancțiune în istoric." };
}

const stamp = (date: Date | null | undefined, style: "D" | "R" = "D") => date ? `<t:${Math.floor(date.getTime() / 1_000)}:${style}>` : "necunoscut";
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const APPEAL_TEXT = { pending: "contestație în așteptare", accepted: "contestație acceptată", rejected: "contestație respinsă" } as const;

export function buildDossierEmbed(input: DossierInput): EmbedBuilder {
  const { user, member, banned, cases, now } = input;
  const standing = dossierStanding(cases, Boolean(banned), now);
  const counts = new Map<string, number>();
  for (const item of cases) counts.set(item.actionType, (counts.get(item.actionType) ?? 0) + 1);
  const accountAgeDays = Math.max(0, Math.floor((now.getTime() - user.createdAt.getTime()) / DAY_MS));

  const embed = new EmbedBuilder()
    .setColor(standing.color)
    .setAuthor({ name: `Dosar · ${user.displayName}`, iconURL: user.avatarUrl })
    .setThumbnail(user.avatarUrl)
    .setTitle(standing.label)
    .setDescription(`<@${user.id}> · \`${user.username}\` · \`${user.id}\`${user.bot ? " · 🤖 bot" : ""}\n${standing.why}`)
    .setFooter({ text: "Dosar de moderare · doar pentru staff" })
    .setTimestamp(now);

  const who = [
    `**Cont creat:** ${stamp(user.createdAt)} (${accountAgeDays} zile)`,
    member
      ? `**Pe server din:** ${stamp(member.joinedAt)}${member.joinedAt ? ` · ${stamp(member.joinedAt, "R")}` : ""}`
      : "**Pe server:** nu e acum pe server",
    member ? `**Roluri:** ${member.roleCount}${member.nickname ? ` · poreclă „${clip(member.nickname, 32)}”` : ""}` : null,
    member?.timeoutUntil && member.timeoutUntil > now ? `**Timeout activ până:** ${stamp(member.timeoutUntil, "R")}` : null,
    banned ? `**Ban activ:** ${banned.reason ? clip(banned.reason, 200) : "fără motiv scris"}` : null,
  ].filter(Boolean).join("\n");
  embed.addFields({ name: "👤 Despre cont", value: who });

  const sanctionLines = SANCTIONS.filter((type) => counts.has(type))
    .map((type) => `${ACTION_LABELS[type]!.emoji} ${ACTION_LABELS[type]!.label}: **${counts.get(type)}**`);
  const openCount = cases.filter((item) => item.status === "open").length;
  embed.addFields({
    name: "🛡️ Sancțiuni",
    value: sanctionLines.length
      ? `${sanctionLines.join("\n")}\nCazuri deschise: **${openCount}** din ${cases.length}`
      : "Nicio sancțiune înregistrată.",
  });

  const appeals = cases.filter((item) => item.appealStatus);
  if (appeals.length) {
    const byStatus = (["pending", "accepted", "rejected"] as const)
      .map((status) => ({ status, count: appeals.filter((item) => item.appealStatus === status).length }))
      .filter((item) => item.count > 0)
      .map((item) => `${item.count} ${APPEAL_TEXT[item.status]}`);
    embed.addFields({ name: "📨 Contestații", value: byStatus.join(" · ") });
  }

  const latest = [...cases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
  if (latest.length) {
    embed.addFields({
      name: "🗂️ Ultimele cazuri",
      value: latest.map((item) => {
        const meta = ACTION_LABELS[item.actionType];
        const reason = item.reason ? clip(item.reason.replace(/\s+/g, " "), 70) : "fără motiv";
        const appeal = item.appealStatus ? ` · ${APPEAL_TEXT[item.appealStatus]}` : "";
        return `${meta?.emoji ?? "•"} \`${item.id.slice(0, 8)}\` ${stamp(item.createdAt)} · **${item.actionType}**${item.status === "open" ? " · deschis" : ""}${appeal}\n> ${reason}${item.actorId ? ` — <@${item.actorId}>` : " — automat"}`;
      }).join("\n").slice(0, 1_024),
    });
  }
  return embed;
}

/** Staff only: Moderate Members, an administrator, or one of the staff roles chosen in the panel. */
export async function canOpenDossier(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const permissions = interaction.memberPermissions;
  if (permissions?.has(PermissionFlagsBits.ModerateMembers) || permissions?.has(PermissionFlagsBits.Administrator)) return true;
  try {
    const { config } = await moderationStore.getConfig(interaction.guildId!);
    const roles = [...((interaction.member as GuildMember | null)?.roles?.cache?.keys() ?? [])];
    return roles.some((id) => config.permissions.staffRoleIds.includes(id));
  } catch {
    return false;
  }
}

async function load(guild: Guild, user: User, now: Date): Promise<DossierInput> {
  const [member, cases, banned] = await Promise.all([
    guild.members.fetch(user.id).catch(() => null),
    moderationStore.listCases(guild.id, { userId: user.id, limit: 100, offset: 0 }).catch(() => [] as ModerationCase[]),
    guild.bans.fetch({ user: user.id, force: true }).then((ban) => ({ reason: ban.reason ?? null })).catch(() => null),
  ]);
  const storedJoin = member?.joinedAt ?? await moderationStore.getMemberJoinAt(guild.id, user.id).catch(() => null);
  return {
    user: {
      id: user.id, username: user.username, displayName: member?.displayName ?? user.globalName ?? user.username,
      avatarUrl: member?.displayAvatarURL() ?? user.displayAvatarURL(), bot: user.bot, createdAt: user.createdAt,
    },
    member: member ? {
      joinedAt: storedJoin, roleCount: Math.max(0, member.roles.cache.size - 1),
      timeoutUntil: member.communicationDisabledUntil ?? null, nickname: member.nickname,
    } : null,
    banned,
    cases,
    now,
  };
}

export async function handleDossierCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "dosar") return false;
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "Dosarul se deschide doar pe un server.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!await canOpenDossier(interaction)) {
    await interaction.reply({ content: "🛡️ Dosarul e doar pentru staff.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const user = interaction.options.getUser("membru", true);
    const embed = buildDossierEmbed(await load(interaction.guild, user, new Date()));
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    await moderationStore.writeAudit({
      guildId: interaction.guildId!, actorId: interaction.user.id, eventType: "dossier.viewed", targetType: "member", targetId: user.id, detail: {},
    }).catch(() => undefined);
  } catch (error) {
    logger.warn({ error, guildId: interaction.guildId }, "Member dossier could not be built");
    await interaction.editReply("❌ Dosarul nu a putut fi deschis. Încearcă din nou peste puțin timp.").catch(() => undefined);
  }
  return true;
}
