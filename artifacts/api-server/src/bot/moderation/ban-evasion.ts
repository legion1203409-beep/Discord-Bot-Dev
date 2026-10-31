/**
 * Ocolirea banului: cine primește ban își face des un cont nou și intră înapoi.
 * Botul ține minte cum arăta contul banat (numele și poza, la GuildBanAdd) și,
 * când intră un cont tânăr, îl compară cu banurile recente. Dacă seamănă, staff-ul
 * primește o alertă cu butoanele Ban și „Nu e el”; botul nu decide singur, pentru
 * că o asemănare de nume poate fi o simplă coincidență.
 *
 * Botul nu vede IP-ul sau dispozitivul nimănui, deci asta e doar un semnal.
 * Setările: config.banEvasion (Sancțiuni → Ocolire ban în panou).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, MessageFlags, PermissionFlagsBits,
  type ButtonInteraction, type Client, type GuildBan, type GuildMember, type PartialGuildMember, type User,
} from "discord.js";
import { logger } from "../../lib/logger";
import type { ModerationConfig } from "../../moderation/config";
import { moderationStore, type BanFingerprint } from "../../moderation/store";

const DAY_MS = 86_400_000;
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };

/** A name reduced to what a person keeps when making a look-alike: no case, accents, digits, dots or decorations. */
export function normalizeName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0134578@$!]/g, (char) => LEET[char] ?? char)
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/** True when two names are the same once normalized, one holds the other, or they differ by a letter or two. */
export function namesLookAlike(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (a.length < 4 || b.length < 4) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 5 && long.includes(short)) return true;
  return 1 - levenshtein(a, b) / long.length >= 0.8;
}

export type JoiningAccount = { id: string; username: string; globalName: string | null; avatarHash: string | null; createdAt: Date };

export type EvasionMatch = { fingerprint: BanFingerprint; reasons: string[] };

/** The banned accounts a joining account resembles, with why, best match first. */
export function findEvasionMatches(
  account: JoiningAccount,
  fingerprints: BanFingerprint[],
  settings: Pick<ModerationConfig["banEvasion"], "matchName" | "matchAvatar">,
): EvasionMatch[] {
  const matches: Array<EvasionMatch & { score: number }> = [];
  for (const fingerprint of fingerprints) {
    if (fingerprint.userId === account.id) continue;
    const reasons: string[] = [];
    let score = 0;
    if (settings.matchAvatar && account.avatarHash && account.avatarHash === fingerprint.avatarHash) {
      reasons.push("Are exact aceeași poză de profil");
      score += 3;
    }
    if (settings.matchName) {
      const pairs: Array<[string | null, string | null]> = [
        [account.username, fingerprint.username], [account.globalName, fingerprint.globalName],
        [account.username, fingerprint.globalName], [account.globalName, fingerprint.username],
      ];
      const pair = pairs.find(([left, right]) => namesLookAlike(left, right));
      if (pair) {
        reasons.push(`Nume asemănător: „${pair[0]}” ↔ „${pair[1]}”`);
        score += 2;
      }
    }
    if (!score) continue;
    if (account.createdAt.getTime() >= fingerprint.bannedAt.getTime()) {
      reasons.push("Contul a fost creat după ban");
      score += 1;
    }
    matches.push({ fingerprint, reasons, score });
  }
  return matches.sort((a, b) => b.score - a.score).map(({ fingerprint, reasons }) => ({ fingerprint, reasons }));
}

function fingerprintOf(guildId: string, user: User, bannedAt = new Date()): BanFingerprint {
  return {
    guildId, userId: user.id, username: user.username ?? "", globalName: user.globalName ?? null,
    avatarHash: user.avatar ?? null, accountCreatedAt: user.createdAt ?? null, bannedAt,
  };
}

function relativeDays(from: Date, to = new Date()): string {
  const days = Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
  return days === 0 ? "azi" : days === 1 ? "acum o zi" : `acum ${days} zile`;
}

export function evasionAlert(member: JoiningAccount, matches: EvasionMatch[], color = 0xd94a2b) {
  const best = matches[0]!;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("🕵️ Posibilă ocolire de ban")
    .setDescription(`<@${member.id}> (\`${member.username}\`, \`${member.id}\`) seamănă cu un cont banat. Verifică înainte să decizi: poate fi o coincidență.`)
    .addFields(
      { name: "Contul banat", value: `<@${best.fingerprint.userId}> · \`${best.fingerprint.username || best.fingerprint.userId}\` · ban ${relativeDays(best.fingerprint.bannedAt)}` },
      { name: "De ce", value: best.reasons.map((reason) => `• ${reason}`).join("\n").slice(0, 1_024) },
      { name: "Contul nou", value: `Creat ${relativeDays(member.createdAt)}` },
    )
    .setTimestamp(new Date());
  if (matches.length > 1) {
    embed.addFields({ name: "Seamănă și cu", value: matches.slice(1, 4).map((match) => `<@${match.fingerprint.userId}>`).join(", ") });
  }
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`evasion_ban_${member.id}_${best.fingerprint.userId}`).setLabel("Ban").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`evasion_dismiss_${member.id}`).setLabel("Nu e el").setStyle(ButtonStyle.Secondary),
    )],
    allowedMentions: { parse: [] as never[] },
  };
}

type Deps = {
  getConfig: (guildId: string) => Promise<ModerationConfig>;
  executeModerationAction: (input: {
    guildId: string; actorId: string; type: "ban"; targetId: string; reason: string; source: "manual"; idempotencyKey?: string;
  }) => Promise<unknown>;
};

let deps: Deps | null = null;

async function onMemberJoin(member: GuildMember): Promise<void> {
  if (!deps || member.user.bot) return;
  const config = await deps.getConfig(member.guild.id);
  const settings = config.banEvasion;
  if (!settings?.enabled || !settings.alertChannelId || (!settings.matchName && !settings.matchAvatar)) return;
  const createdAt = member.user.createdAt;
  if (Date.now() - createdAt.getTime() > settings.maxAccountAgeDays * DAY_MS) return;
  const fingerprints = await moderationStore.listRecentBanFingerprints?.(member.guild.id, new Date(Date.now() - settings.watchDays * DAY_MS), 500) ?? [];
  const account: JoiningAccount = {
    id: member.id, username: member.user.username, globalName: member.user.globalName ?? null, avatarHash: member.user.avatar ?? null, createdAt,
  };
  const matches = findEvasionMatches(account, fingerprints, settings);
  if (!matches.length) return;
  const channel = await member.guild.channels.fetch(settings.alertChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) return;
  const hex = config.embeds?.color;
  const color = typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : 0xd94a2b;
  await channel.send(evasionAlert(account, matches, color) as never);
  await moderationStore.writeAudit({
    guildId: member.guild.id, actorId: null, eventType: "ban_evasion.suspected", targetType: "member", targetId: member.id,
    detail: { bannedUserId: matches[0]!.fingerprint.userId, reasons: matches[0]!.reasons },
  }).catch(() => undefined);
}

/** Registers the three events once: a ban remembers the account, an unban forgets it, a join is compared. */
export function attachBanEvasion(client: Client, dependencies: Deps): void {
  deps = dependencies;
  const marked = client as Client & { __banEvasionAttached?: boolean };
  if (marked.__banEvasionAttached) return;
  marked.__banEvasionAttached = true;
  client.on(Events.GuildBanAdd, (ban: GuildBan) => {
    void moderationStore.recordBanFingerprint?.(fingerprintOf(ban.guild.id, ban.user))
      .catch((error) => logger.warn({ error, guildId: ban.guild.id }, "Could not remember a banned account"));
  });
  client.on(Events.GuildBanRemove, (ban: GuildBan) => {
    void moderationStore.removeBanFingerprint?.(ban.guild.id, ban.user.id).catch(() => undefined);
  });
  client.on(Events.GuildMemberAdd, (member: GuildMember | PartialGuildMember) => {
    void onMemberJoin(member as GuildMember)
      .catch((error) => logger.warn({ error, guildId: member.guild.id }, "Ban evasion check failed"));
  });
}

/** The buttons on the alert: Ban goes through the normal ban (with the staff member's permissions), „Nu e el” closes it. */
export async function handleBanEvasionButton(interaction: ButtonInteraction): Promise<boolean> {
  const ban = interaction.customId.match(/^evasion_ban_(\d{5,25})_(\d{5,25})$/);
  const dismiss = interaction.customId.match(/^evasion_dismiss_(\d{5,25})$/);
  if (!ban && !dismiss) return false;
  if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    await interaction.reply({ content: "🛡️ Doar cine are permisiunea Ban Members poate decide.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const closeAlert = async (line: string) => {
    const embed = interaction.message.embeds[0];
    await interaction.message.edit({
      embeds: embed ? [EmbedBuilder.from(embed).setColor(0x8a8f98).addFields({ name: "Decizia", value: line.slice(0, 1_024) })] : [],
      components: [],
    }).catch(() => undefined);
  };
  if (dismiss) {
    await interaction.deferUpdate();
    await closeAlert(`Nu e același om — <@${interaction.user.id}>`);
    await moderationStore.writeAudit({
      guildId: interaction.guildId, actorId: interaction.user.id, eventType: "ban_evasion.dismissed", targetType: "member", targetId: dismiss[1]!, detail: {},
    }).catch(() => undefined);
    return true;
  }
  const [, targetId, bannedId] = ban!;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!deps) throw new Error("Moderarea nu e pornită.");
    await deps.executeModerationAction({
      guildId: interaction.guildId, actorId: interaction.user.id, type: "ban", targetId: targetId!,
      reason: `Ocolirea banului lui ${bannedId} (cont nou asemănător)`, source: "manual",
      idempotencyKey: `evasion:${interaction.guildId}:${targetId}`,
    });
    await closeAlert(`Ban dat de <@${interaction.user.id}>`);
    await interaction.editReply("⛔ Contul a primit ban.");
  } catch (error) {
    await interaction.editReply(`⚠️ Banul nu a mers: ${error instanceof Error ? error.message : "eroare necunoscută"}`);
  }
  return true;
}
