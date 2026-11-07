/**
 * Stele și pentru tichetele făcute de alt bot (aplicații de staff,
 * parteneriate, ajutor, contestații). Oracolul nu le deschide și nu le
 * închide, așa că le urmărește:
 *  - când apare canalul în categoria tichetelor, află cine l-a deschis (membrul
 *    cu acces propriu la canal) și îl trece în support_tickets cu id-ul
 *    „ext:<tip>”, deci evaluarea și reputația merg exact ca la tichetele botului;
 *  - când scrie cineva din staff, ține minte ultimul care a răspuns;
 *  - când canalul e șters sau membrul pierde accesul, tichetul e închis și
 *    membrul primește întrebarea cu stele (în privat sau în tichet, cum e setat).
 */
import { Events, PermissionFlagsBits, type Client, type GuildMember, type Message, type TextChannel } from "discord.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { getOracleTicketKindFromParentId } from "./oracle-chat";
import {
  EXTERNAL_TICKET_LABELS,
  askForRating,
  ensureSupportTicketTables,
  isTicketStaff,
  loadSupportTicketsConfig,
  memberCanSee,
  type ExternalTicketKind,
} from "./support-tickets";
import { getTicketConfig } from "./ticket-config";

/** Discord's overwrite type for a member (OverwriteType.Member). */
const MEMBER_OVERWRITE = 1;

type Tracked = { id: number; guildId: string; openerId: string; kind: ExternalTicketKind };
/** Open external tickets by channel, so a message only costs a map lookup. */
const tracked = new Map<string, Tracked>();

export const externalCategoryId = (kind: ExternalTicketKind) => `ext:${kind}`;

type ChannelLike = {
  id: string;
  guildId?: string | null;
  parentId?: string | null;
  guild?: { id: string; members?: { cache?: Map<string, GuildMember> } };
  isTextBased?: () => boolean;
  permissionOverwrites?: { cache?: { values(): Iterable<{ id: string; type: number; allow: { has(bit: bigint): boolean }; deny: { has(bit: bigint): boolean } }> } };
};

/** The member a ticket channel was opened for: the one non-bot, non-staff member with their own access to it. */
export function findTicketOpener(
  overwrites: Iterable<{ id: string; type: number; allow: { has(bit: bigint): boolean }; deny: { has(bit: bigint): boolean } }>,
  isExcluded: (userId: string) => boolean,
): string | null {
  const members = [...overwrites]
    .filter((overwrite) => overwrite.type === MEMBER_OVERWRITE)
    .filter((overwrite) => overwrite.allow.has(PermissionFlagsBits.ViewChannel) && !overwrite.deny.has(PermissionFlagsBits.ViewChannel))
    .map((overwrite) => overwrite.id)
    .filter((id) => !isExcluded(id));
  return members.length === 1 ? members[0]! : members[0] ?? null;
}

function ticketKindOf(channel: ChannelLike): ExternalTicketKind | null {
  if (!channel.guildId || !channel.parentId || !channel.isTextBased?.()) return null;
  return getOracleTicketKindFromParentId(channel.parentId, channel.guildId) as ExternalTicketKind | null;
}

async function staffRolesOf(guildId: string): Promise<string[]> {
  const roles = new Set<string>();
  const review = getTicketConfig(guildId).staffReviewRoleId;
  if (review) roles.add(review);
  try {
    const config = await loadSupportTicketsConfig(guildId);
    for (const id of config.staffRoleIds) roles.add(id);
  } catch { /* the bot's own tickets may not be set up */ }
  return [...roles];
}

function isStaffMember(member: GuildMember | null | undefined, roles: string[]): boolean {
  if (!member || member.user?.bot) return false;
  return isTicketStaff(member, roles)
    || Boolean(member.permissions?.has?.(PermissionFlagsBits.ManageMessages) || member.permissions?.has?.(PermissionFlagsBits.ModerateMembers));
}

/** Starts following a ticket channel of the other bot. Safe to call again on every update. */
export async function trackExternalTicket(channel: unknown, client: Client): Promise<void> {
  const candidate = channel as ChannelLike;
  if (!candidate?.id || tracked.has(candidate.id)) return;
  const kind = ticketKindOf(candidate);
  if (!kind) return;
  const guild = client.guilds.cache.get(candidate.guildId!);
  if (!guild) return;
  const roles = await staffRolesOf(guild.id);
  const opener = findTicketOpener(candidate.permissionOverwrites?.cache?.values() ?? [], (userId) => {
    if (userId === client.user?.id) return true;
    const member = guild.members.cache.get(userId);
    return Boolean(member?.user.bot) || isStaffMember(member, roles);
  });
  if (!opener) return;
  try {
    await ensureSupportTicketTables();
    const result = await pool.query<{ id: number; status: string }>(
      `INSERT INTO support_tickets (guild_id, channel_id, opener_id, category_id, category_label)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (channel_id) DO UPDATE SET channel_id = EXCLUDED.channel_id
       RETURNING id, status`,
      [guild.id, candidate.id, opener, externalCategoryId(kind), EXTERNAL_TICKET_LABELS[kind]],
    );
    const row = result.rows[0];
    if (row && row.status === "open") tracked.set(candidate.id, { id: row.id, guildId: guild.id, openerId: opener, kind });
  } catch (error) {
    logger.warn({ error, guildId: guild.id, channelId: candidate.id }, "External ticket could not be tracked");
  }
}

/** Remembers the last staff member who answered in a followed ticket. */
export async function noteExternalTicketMessage(message: Message): Promise<void> {
  const ticket = tracked.get(message.channelId);
  if (!ticket || message.author.bot || message.author.id === ticket.openerId) return;
  const roles = await staffRolesOf(ticket.guildId);
  const member = message.member ?? await message.guild?.members.fetch(message.author.id).catch(() => null);
  if (!isStaffMember(member ?? null, roles)) return;
  await pool.query(`UPDATE support_tickets SET claimed_by = $2 WHERE id = $1 AND status = 'open'`, [ticket.id, message.author.id]).catch(() => undefined);
}

/** True when the ticket's member can no longer see it (the other bot closed it). */
export function lostAccess(channel: unknown, openerId: string): boolean {
  const overwrite = [...((channel as ChannelLike).permissionOverwrites?.cache?.values() ?? [])].find((item) => item.id === openerId);
  return !overwrite || overwrite.deny.has(PermissionFlagsBits.ViewChannel) || !overwrite.allow.has(PermissionFlagsBits.ViewChannel);
}

/** Closes a followed ticket (deleted, or its member lost access) and asks for stars. */
export async function closeExternalTicket(channel: unknown, client: Client, deleted: boolean): Promise<void> {
  const candidate = channel as ChannelLike;
  const ticket = tracked.get(candidate?.id);
  if (!ticket) return;
  if (!deleted && !lostAccess(channel, ticket.openerId)) return;
  tracked.delete(candidate.id);
  try {
    const closed = await pool.query<{ id: number; opener_id: string; category_label: string; claimed_by: string | null }>(
      `UPDATE support_tickets SET status = 'closed', closed_at = now() WHERE id = $1 AND status = 'open' RETURNING id, opener_id, category_label, claimed_by`,
      [ticket.id],
    );
    const row = closed.rows[0];
    if (!row?.claimed_by || row.claimed_by === row.opener_id) return;
    const config = await loadSupportTicketsConfig(ticket.guildId);
    if (!config.rating.enabled || !config.rating.external[ticket.kind]) return;
    const guild = client.guilds.cache.get(ticket.guildId);
    await askForRating(client, config, row, row.claimed_by, guild?.name ?? "server", deleted ? null : (channel as TextChannel));
  } catch (error) {
    logger.warn({ error, guildId: ticket.guildId, channelId: candidate.id }, "External ticket could not be closed or rated");
  }
}

/** After a restart: follow again the external tickets still open whose channels still exist. */
export async function loadOpenExternalTickets(client: Client): Promise<void> {
  try {
    await ensureSupportTicketTables();
    const result = await pool.query<{ id: number; guild_id: string; channel_id: string; opener_id: string; category_id: string }>(
      `SELECT id, guild_id, channel_id, opener_id, category_id FROM support_tickets WHERE status = 'open' AND category_id LIKE 'ext:%'`,
    );
    for (const row of result.rows) {
      const channel = client.channels.cache.get(row.channel_id);
      if (!channel) {
        // Deleted while the bot was away: closed, without a question nobody asked for in time.
        await pool.query(`UPDATE support_tickets SET status = 'closed', closed_at = now() WHERE id = $1 AND status = 'open'`, [row.id]);
        continue;
      }
      tracked.set(row.channel_id, { id: row.id, guildId: row.guild_id, openerId: row.opener_id, kind: row.category_id.slice(4) as ExternalTicketKind });
    }
  } catch (error) {
    logger.warn({ error }, "Open external tickets could not be loaded");
  }
}

/** For tests. */
export function trackedExternalTicket(channelId: string): Tracked | undefined {
  return tracked.get(channelId);
}

/** Hooks the following of external tickets onto the client's events. */
export function attachExternalTicketRating(client: Client): void {
  client.on(Events.ChannelCreate, (channel) => {
    // The other bot sets the member's access a moment after it creates the channel.
    setTimeout(() => { void trackExternalTicket(channel, client); }, 3_000).unref?.();
  });
  client.on(Events.ChannelUpdate, (_before, channel) => {
    void (async () => {
      if (trackedExternalTicket(channel.id)) await closeExternalTicket(channel, client, false);
      else await trackExternalTicket(channel, client);
    })();
  });
  client.on(Events.ChannelDelete, (channel) => { void closeExternalTicket(channel, client, true); });
  client.on(Events.MessageCreate, (message) => { void noteExternalTicketMessage(message).catch(() => undefined); });
  if (client.isReady()) void loadOpenExternalTickets(client);
  else client.once(Events.ClientReady, () => { void loadOpenExternalTickets(client); });
}
