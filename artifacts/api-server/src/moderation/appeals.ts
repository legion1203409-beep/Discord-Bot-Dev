/**
 * Contestațiile de ban de pe site. Cine are ban nu mai poate deschide un tichet
 * pe server, așa că se loghează cu Discord pe /contestatie, își vede banul și
 * scrie de ce să fie scos. Botul postează contestația în canalul de staff ales
 * în panou (Sancțiuni → Contestații), cu butoanele Acceptă / Respinge / Cere
 * clarificări (bot/moderation/appeal-web.ts). Acceptarea scoate banul, dacă
 * setarea e pornită; după o respingere, același ban se poate contesta din nou
 * după numărul de zile ales (30 implicit).
 *
 * Contestația stă în moderation_appeals, lângă cele din tichete, cu
 * channel_id = "web:<id>" și source = "web" (moderation/store.ts).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type Client, type Guild, type GuildBan, type Message,
} from "discord.js";
import { logger } from "../lib/logger";
import { PUBLIC_DISCORD_GUILD_ID, PUBLIC_DISCORD_INVITE } from "../lib/discord-invite";
import { ModerationAuthError } from "./auth";
import type { ModerationConfig } from "./config";
import { moderationStore, webAppealChannelId, type ModerationCase, type ModerationCaseAppeal, type ModerationWebAppeal } from "./store";

export const APPEAL_MIN_LENGTH = 30;
export const APPEAL_MAX_LENGTH = 2_000;
export const APPEAL_ANSWER_MAX_LENGTH = 1_500;
const DAY_MS = 86_400_000;

/** A refusal with a message for the appellant; the moderation error handler turns it into a JSON reply. */
export class AppealError extends ModerationAuthError {}

export type AppealView = {
  enabled: boolean;
  guild: { id: string; name: string; iconUrl: string | null };
  banned: boolean;
  ban: { reason: string | null; caseId: string | null; at: string | null } | null;
  appeal: {
    id: string; status: ModerationCaseAppeal["status"]; body: string | null; createdAt: string;
    decidedAt: string | null; decisionNote: string | null; question: { id: string; text: string } | null;
  } | null;
  canAppeal: boolean;
  /** When a rejected ban can be appealed again. */
  nextAllowedAt: string | null;
  /** The server's invite, once the ban is gone after an accepted appeal. */
  inviteUrl: string | null;
  /** The text of the invite button (the server's own, set in the panel). */
  inviteLabel: string;
};

type Found = {
  config: ModerationConfig;
  guild: Guild | null;
  ban: GuildBan | null;
  banned: boolean;
  banCase: ModerationCase | null;
  appeal: ModerationCaseAppeal | null;
};

function discordCode(error: unknown): number | null {
  return error && typeof error === "object" && "code" in error && Number.isFinite(Number((error as { code: unknown }).code))
    ? Number((error as { code: unknown }).code)
    : null;
}

async function fetchGuild(client: Client | null, guildId: string): Promise<Guild | null> {
  if (!client?.isReady()) return null;
  return client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
}

/** The member's ban on Discord, or null; a bot that cannot see bans cannot judge appeals. */
async function fetchBan(guild: Guild, userId: string): Promise<GuildBan | null> {
  try {
    return await guild.bans.fetch({ user: userId, force: true });
  } catch (error) {
    if (discordCode(error) === 10026) return null;
    if (discordCode(error) === 50013) throw new AppealError(503, "Botul nu are permisiunea Ban Members, deci nu poate verifica banurile. Încearcă mai târziu.");
    throw error;
  }
}

async function find(client: Client | null, guildId: string, userId: string): Promise<Found> {
  const { config } = await moderationStore.getConfig(guildId);
  const guild = await fetchGuild(client, guildId);
  const ban = guild ? await fetchBan(guild, userId) : null;
  const [banCase] = await moderationStore.listCases(guildId, { userId, actionType: "ban", limit: 1, offset: 0 });
  const appeal = banCase ? await moderationStore.getLatestAppeal?.(guildId, banCase.id) ?? null : null;
  // An accepted appeal lifted that ban: a ban standing now is a new one (given from Discord, with no case yet).
  if (ban && appeal?.status === "accepted" && config.appeals?.unbanOnAccept !== false) {
    return { config, guild, ban, banned: true, banCase: null, appeal: null };
  }
  return { config, guild, ban, banned: Boolean(ban), banCase: banCase ?? null, appeal };
}

/** Whether a new appeal can be made now, and from when after a rejection. */
export function appealWindow(
  appeal: Pick<ModerationCaseAppeal, "status" | "decidedAt"> | null,
  cooldownDays: number,
  now = Date.now(),
): { canAppeal: boolean; nextAllowedAt: Date | null } {
  if (!appeal) return { canAppeal: true, nextAllowedAt: null };
  if (appeal.status === "pending" || appeal.status === "accepted") return { canAppeal: false, nextAllowedAt: null };
  const decided = appeal.decidedAt ? new Date(appeal.decidedAt).getTime() : now;
  const next = decided + cooldownDays * DAY_MS;
  return next <= now ? { canAppeal: true, nextAllowedAt: null } : { canAppeal: false, nextAllowedAt: new Date(next) };
}

function viewOf(guildId: string, found: Found, invite: string | null = null, now = Date.now()): AppealView {
  const enabled = Boolean(found.config.appeals?.enabled);
  // An appeal accepted earlier does not stop a new one for a later ban (a new case).
  const window = appealWindow(found.appeal, found.config.appeals?.cooldownDays ?? 30, now);
  const appeal = found.appeal;
  return {
    enabled,
    guild: {
      id: guildId,
      name: found.guild?.name ?? "Serverul",
      iconUrl: found.guild?.iconURL({ size: 128 }) ?? null,
    },
    banned: found.banned,
    ban: found.banned || found.banCase
      ? {
        reason: found.ban?.reason ?? found.banCase?.reason ?? null,
        caseId: found.banCase?.id ?? null,
        at: found.banCase?.createdAt ? new Date(found.banCase.createdAt).toISOString() : null,
      }
      : null,
    appeal: appeal
      ? {
        id: appeal.id, status: appeal.status, body: appeal.body, createdAt: new Date(appeal.createdAt).toISOString(),
        decidedAt: appeal.decidedAt ? new Date(appeal.decidedAt).toISOString() : null, decisionNote: appeal.decisionNote,
        question: appeal.clarification ? { id: appeal.clarification.id, text: appeal.clarification.question } : null,
      }
      : null,
    canAppeal: enabled && found.banned && window.canAppeal,
    nextAllowedAt: found.banned && window.nextAllowedAt ? window.nextAllowedAt.toISOString() : null,
    inviteUrl: !found.banned && appeal?.status === "accepted" ? invite : null,
    inviteLabel: found.config.appeals?.acceptedButton ?? "Intră în regat",
  };
}

export async function appealStatus(client: Client | null, guildId: string, userId: string): Promise<AppealView> {
  const found = await find(client, guildId, userId);
  const invite = !found.banned && found.appeal?.status === "accepted" && found.guild
    ? await acceptedInvite(found.guild, userId, found.config)
    : null;
  return viewOf(guildId, found, invite);
}

/** The text of an appeal as the bot keeps it: trimmed, without control characters. */
export function cleanAppealText(value: unknown, max = APPEAL_MAX_LENGTH): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

export async function submitAppeal(
  client: Client | null,
  guildId: string,
  user: { userId: string; name: string; username: string },
  text: string,
): Promise<AppealView> {
  const body = cleanAppealText(text);
  if (body.length < APPEAL_MIN_LENGTH) throw new AppealError(400, `Scrie cel puțin ${APPEAL_MIN_LENGTH} de caractere: ce s-a întâmplat și de ce să fie scos banul.`);
  if (!client?.isReady()) throw new AppealError(503, "Botul nu e disponibil acum. Încearcă din nou peste câteva minute.");
  const found = await find(client, guildId, user.userId);
  if (!found.config.appeals?.enabled) throw new AppealError(403, "Contestațiile de pe site sunt oprite pe acest server.");
  if (!found.banned) throw new AppealError(400, "Nu ai ban pe acest server, deci nu ai ce contesta.");
  const window = appealWindow(found.appeal, found.config.appeals.cooldownDays);
  if (!window.canAppeal) {
    throw new AppealError(409, found.appeal?.status === "pending"
      ? "Ai deja o contestație care așteaptă răspuns."
      : window.nextAllowedAt
        ? `Poți face o contestație nouă după ${window.nextAllowedAt.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}.`
        : "Nu poți face o contestație nouă acum.");
  }
  // A ban given straight from Discord has no case yet: it gets one, so the appeal has somewhere to live.
  const banCase = found.banCase ?? await moderationStore.createCase({
    guildId, subjectId: user.userId, actorId: null, actionType: "ban",
    reason: found.ban?.reason?.slice(0, 500) || "Ban dat direct din Discord",
    metadata: { source: "discord" },
  });
  const appeal = await moderationStore.createWebAppeal?.({ guildId, caseId: banCase.id, appellantId: user.userId, body });
  if (!appeal) throw new AppealError(409, "Ai deja o contestație care așteaptă răspuns.");
  await postToStaff(client, found.config, appeal, user, found.ban?.reason ?? banCase.reason).catch((error) => {
    logger.warn({ error, guildId, appealId: appeal.id }, "Ban appeal saved but not posted to the staff channel");
  });
  return viewOf(guildId, { ...found, banCase, appeal });
}

export async function answerClarification(
  client: Client | null,
  guildId: string,
  user: { userId: string; name: string },
  clarificationId: string,
  text: string,
): Promise<AppealView> {
  const answer = cleanAppealText(text, APPEAL_ANSWER_MAX_LENGTH);
  if (answer.length < 2) throw new AppealError(400, "Scrie răspunsul la întrebare.");
  const found = await find(client, guildId, user.userId);
  const appeal = found.appeal;
  if (!appeal || appeal.source !== "web" || appeal.status !== "pending" || appeal.clarification?.id !== clarificationId || !found.banCase) {
    throw new AppealError(409, "Întrebarea nu mai așteaptă răspuns. Reîncarcă pagina.");
  }
  const answered = await moderationStore.respondAppealClarification({
    guildId, caseId: found.banCase.id, channelId: webAppealChannelId(appeal.id), appellantId: user.userId, clarificationId, answer,
  });
  if (!answered) throw new AppealError(409, "Întrebarea nu mai așteaptă răspuns. Reîncarcă pagina.");
  const web = await moderationStore.getWebAppeal?.(guildId, appeal.id);
  if (web && client?.isReady()) {
    await replyInStaffThread(client, web, `💬 **${user.name}** a răspuns la întrebarea lui <@${answered.staffId}>:\n> ${answered.question.slice(0, 300)}\n\n${answer}`).catch((error) => {
      logger.warn({ error, guildId, appealId: appeal.id }, "Appeal clarification answer saved but not posted to staff");
    });
    await refreshStaffMessage(client, web.id, guildId).catch(() => undefined);
  }
  return viewOf(guildId, { ...found, appeal: { ...appeal, clarification: null } });
}

/* ------------------------------------------------------------------ */
/* Mesajul pentru staff                                                */
/* ------------------------------------------------------------------ */

const STATUS_TEXT: Record<ModerationCaseAppeal["status"], string> = {
  pending: "🕯️ Așteaptă decizia staff-ului",
  accepted: "✅ Acceptată",
  rejected: "❌ Respinsă",
};

export function staffAppealMessage(
  appeal: ModerationWebAppeal,
  member: { name: string; username?: string },
  banReason: string | null,
  color = 0xd94a2b,
) {
  const embed = new EmbedBuilder()
    .setColor(appeal.status === "accepted" ? 0x3ddc84 : appeal.status === "rejected" ? 0x8a8f98 : color)
    .setTitle("⚖️ Contestație de ban")
    .setDescription((appeal.body ?? "").slice(0, 4_000) || "—")
    .addFields(
      { name: "Membrul", value: `<@${appeal.appellantId}> · ${member.username ? `@${member.username}` : member.name} · \`${appeal.appellantId}\``.slice(0, 1_024) },
      { name: "Motivul banului", value: (banReason || "Fără motiv").slice(0, 1_024) },
      { name: "Cazul", value: `\`${appeal.caseId}\`` },
      { name: "Starea", value: STATUS_TEXT[appeal.status] },
    )
    .setFooter({ text: "Contestație depusă pe site" })
    .setTimestamp(new Date(appeal.createdAt));
  if (appeal.clarification) embed.addFields({ name: "Întrebare trimisă, așteaptă răspuns", value: appeal.clarification.question.slice(0, 1_024) });
  if (appeal.decisionNote && appeal.status !== "pending") {
    embed.addFields({ name: appeal.status === "accepted" ? "Nota" : "Motivul respingerii", value: `${appeal.decisionNote.slice(0, 900)}${appeal.decidedBy ? ` — <@${appeal.decidedBy}>` : ""}` });
  }
  const components = appeal.status === "pending"
    ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket_appeal_web_accept_${appeal.id}`).setLabel("Acceptă").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_appeal_web_reject_${appeal.id}`).setLabel("Respinge").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket_appeal_web_ask_${appeal.id}`).setLabel("Cere clarificări").setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(appeal.clarification)),
    )]
    : [];
  return { embeds: [embed], components, allowedMentions: { parse: [] as never[] } };
}

async function staffChannel(client: Client, config: ModerationConfig, guildId: string) {
  const channelId = config.appeals?.channelId;
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel) || ("guildId" in channel && channel.guildId !== guildId)) return null;
  return channel;
}

async function postToStaff(client: Client, config: ModerationConfig, appeal: ModerationWebAppeal, user: { name: string; username: string }, banReason: string | null): Promise<void> {
  const channel = await staffChannel(client, config, appeal.guildId);
  if (!channel) {
    logger.warn({ guildId: appeal.guildId, appealId: appeal.id }, "Ban appeal saved; no staff channel is set for appeals");
    return;
  }
  const message = await channel.send(staffAppealMessage(appeal, user, banReason, colorOf(config)) as never) as Message;
  await moderationStore.setAppealStaffMessage?.({ guildId: appeal.guildId, appealId: appeal.id, channelId: message.channelId, messageId: message.id });
}

function colorOf(config: ModerationConfig): number {
  const hex = config.embeds?.color;
  return typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : 0xd94a2b;
}

async function staffMessage(client: Client, appeal: ModerationWebAppeal): Promise<Message | null> {
  if (!appeal.staffChannelId || !appeal.staffMessageId) return null;
  const channel = await client.channels.fetch(appeal.staffChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) return null;
  return channel.messages.fetch(appeal.staffMessageId).catch(() => null);
}

/** Redraws the staff message with the appeal's current state (decision, question). */
export async function refreshStaffMessage(client: Client, appealId: string, guildId: string): Promise<void> {
  const appeal = await moderationStore.getWebAppeal?.(guildId, appealId);
  if (!appeal) return;
  const message = await staffMessage(client, appeal);
  if (!message) return;
  const { config } = await moderationStore.getConfig(guildId);
  const banCase = await moderationStore.getCase(guildId, appeal.caseId);
  const user = await client.users.fetch(appeal.appellantId).catch(() => null);
  await message.edit(staffAppealMessage(appeal, { name: user?.globalName ?? user?.username ?? appeal.appellantId, username: user?.username }, banCase?.reason ?? null, colorOf(config)) as never);
}

async function replyInStaffThread(client: Client, appeal: ModerationWebAppeal, content: string): Promise<void> {
  const message = await staffMessage(client, appeal);
  if (!message) return;
  await message.reply({ content: content.slice(0, 2_000), allowedMentions: { parse: [] } });
}

/* ------------------------------------------------------------------ */
/* Deciziile staff-ului                                                */
/* ------------------------------------------------------------------ */

export type AppealDecision = "accepted" | "rejected";

/**
 * Records staff's decision. Accepting lifts the ban first (when the setting is on),
 * so a ban Discord refused to lift never shows as accepted.
 */
export async function decideWebAppeal(client: Client, input: {
  guildId: string; appealId: string; actorId: string; actorTag: string; decision: AppealDecision; note: string;
}): Promise<{ appeal: ModerationWebAppeal; unbanned: boolean; notified: boolean }> {
  const appeal = await moderationStore.getWebAppeal?.(input.guildId, input.appealId);
  if (!appeal || appeal.status !== "pending") throw new AppealError(409, "Contestația a fost deja decisă.");
  const { config } = await moderationStore.getConfig(input.guildId);
  let unbanned = false;
  if (input.decision === "accepted" && config.appeals?.unbanOnAccept !== false) {
    const guild = await fetchGuild(client, input.guildId);
    if (!guild) throw new AppealError(503, "Serverul nu e disponibil pentru bot.");
    try {
      await guild.bans.remove(appeal.appellantId, `Contestație acceptată de ${input.actorTag}: ${input.note}`.slice(0, 512));
      unbanned = true;
    } catch (error) {
      // Already unbanned by someone: the decision still counts.
      if (discordCode(error) !== 10026) {
        throw new AppealError(502, discordCode(error) === 50013
          ? "Botului îi lipsește Ban Members, deci nu poate scoate banul. Contestația rămâne deschisă."
          : "Discord nu a scos banul. Contestația rămâne deschisă; încearcă din nou.");
      }
    }
  }
  const recorded = await moderationStore.decideAppeal({
    guildId: input.guildId, caseId: appeal.caseId, channelId: webAppealChannelId(appeal.id),
    actorId: input.actorId, decision: input.decision, note: input.note,
  });
  if (!recorded) throw new AppealError(409, "Contestația a fost deja decisă.");
  if (unbanned) {
    await moderationStore.updateCase({ guildId: input.guildId, caseId: appeal.caseId, status: "closed", actorId: input.actorId }).catch(() => null);
    await moderationStore.writeAudit({
      guildId: input.guildId, actorId: input.actorId, eventType: "action.applied", targetType: "member", targetId: appeal.appellantId,
      detail: { type: "unban", summary: `Banul a fost scos după o contestație acceptată.`, caseId: appeal.caseId, appealId: appeal.id },
    }).catch(() => undefined);
  }
  const updated = await moderationStore.getWebAppeal?.(input.guildId, appeal.id) ?? appeal;
  await refreshStaffMessage(client, appeal.id, input.guildId).catch(() => undefined);
  let notified = false;
  if (input.decision === "accepted") {
    const guild = await fetchGuild(client, input.guildId);
    if (config.appeals?.dmOnAccept !== false) {
      const invite = guild ? await acceptedInvite(guild, appeal.appellantId, config) : config.appeals?.inviteUrl ?? null;
      notified = await notifyAccepted(client, appeal.appellantId, acceptedAppealMessage(config, guild?.name ?? "server", input.note, invite, colorOf(config)));
    }
    if (config.appeals?.dmOnAccept !== false) await moderationStore.addCaseNote({
      guildId: input.guildId, caseId: appeal.caseId, authorId: input.actorId,
      body: notified ? "Membrul a primit în privat vestea și linkul serverului." : "Mesajul privat nu a ajuns (DM-uri închise sau niciun server comun cu botul); vestea și linkul sunt pe pagina de contestație.",
    }).catch(() => null);
  }
  return { appeal: updated, unbanned, notified };
}

const createdInvites = new Map<string, { url: string; expiresAt: number }>();
const INVITE_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * The invite for someone whose appeal was accepted: the one set in the panel, the
 * official community's public one, or a single-use invite of 7 days made by the
 * bot (kept for the same person, so reloading the page does not make new ones).
 */
export async function acceptedInvite(guild: Guild, userId: string, config: ModerationConfig): Promise<string | null> {
  if (config.appeals?.inviteUrl) return config.appeals.inviteUrl;
  if (guild.id === PUBLIC_DISCORD_GUILD_ID) return PUBLIC_DISCORD_INVITE;
  const key = `${guild.id}:${userId}`;
  const cached = createdInvites.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const me = guild.members.me;
  const channels = [guild.systemChannel, guild.rulesChannel, ...guild.channels.cache.values()];
  const channel = channels.find((candidate) => candidate && "createInvite" in candidate && candidate.isTextBased()
    && (!me || candidate.permissionsFor(me)?.has("CreateInstantInvite")));
  if (!channel || !("createInvite" in channel)) return null;
  try {
    const invite = await channel.createInvite({ maxAge: INVITE_AGE_SECONDS, maxUses: 1, unique: true, reason: "Contestație de ban acceptată" });
    createdInvites.set(key, { url: invite.url, expiresAt: Date.now() + (INVITE_AGE_SECONDS - 60) * 1_000 });
    if (createdInvites.size > 1_000) createdInvites.delete(createdInvites.keys().next().value!);
    return invite.url;
  } catch (error) {
    logger.warn({ error, guildId: guild.id }, "Could not make an invite for an accepted ban appeal");
    return null;
  }
}

/** The private message after an accepted appeal, as the server wrote it in the panel; {guild} is its name. */
export function acceptedAppealMessage(config: ModerationConfig, guildName: string, note: string, inviteUrl: string | null, color = 0xd94a2b) {
  const settings = config.appeals;
  const fill = (text: string) => text.replaceAll("{guild}", guildName.slice(0, 100));
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(fill(settings?.acceptedTitle ?? "✅ Contestația ta a fost acceptată").slice(0, 256))
    .setDescription(fill(settings?.acceptedMessage ?? "Banul de pe **{guild}** a fost scos. Te poți întoarce oricând.").slice(0, 4_000))
    .setTimestamp(new Date());
  const cleanNote = note.trim();
  if (cleanNote && cleanNote !== "Contestație acceptată.") embed.addFields({ name: "Mesaj de la staff", value: cleanNote.slice(0, 1_024) });
  return {
    embeds: [embed],
    components: inviteUrl
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel((settings?.acceptedButton ?? "Intră în regat").slice(0, 80)).setStyle(ButtonStyle.Link).setURL(inviteUrl),
      )]
      : [],
    allowedMentions: { parse: [] as never[] },
  };
}

/** Best effort: a user who shares no server with the bot, or has closed DMs, does not get it. */
async function notifyAccepted(client: Client, userId: string, payload: ReturnType<typeof acceptedAppealMessage>): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);
    await user.send(payload as never);
    return true;
  } catch {
    return false;
  }
}

export async function askWebAppeal(client: Client, input: { guildId: string; appealId: string; actorId: string; question: string; clarificationId: string }): Promise<void> {
  const appeal = await moderationStore.getWebAppeal?.(input.guildId, input.appealId);
  if (!appeal || appeal.status !== "pending") throw new AppealError(409, "Contestația a fost deja decisă.");
  if (appeal.clarification) throw new AppealError(409, "Membrul încă n-a răspuns la întrebarea de dinainte.");
  const asked = await moderationStore.requestAppealClarification({
    guildId: input.guildId, caseId: appeal.caseId, channelId: webAppealChannelId(appeal.id),
    actorId: input.actorId, clarificationId: input.clarificationId, question: input.question,
  });
  if (!asked) throw new AppealError(409, "Întrebarea nu a putut fi trimisă: contestația s-a schimbat între timp.");
  await refreshStaffMessage(client, appeal.id, input.guildId).catch(() => undefined);
}
