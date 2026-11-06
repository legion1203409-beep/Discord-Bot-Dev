/**
 * Tichetele botului: un panou cu un meniu de categorii (alese din panoul site-ului),
 * iar la alegere botul creează singur un canal privat pentru membru și staff, cu
 * butoanele „Preia” și „Închide”. La închidere păstrează o transcriere în canalul
 * de jurnal și îl întreabă pe membru „Cum ai evalua ajutorul primit?” (⭐ 1–5, cu
 * comentariu dacă vrea). Din evaluări iese reputația staff-ului: /topstaff și pagina
 * din panou.
 *
 * E separat de tichetele vechi (ticket-config.ts / ticket-ui.ts), care pun formulare
 * în canalele create de alt bot; ambele pot merge în același timp. Butoanele de aici
 * încep cu „tichet_”, ca să nu se amestece cu „ticket_”.
 */
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder,
  PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type Client, type Guild, type GuildMember, type ModalSubmitInteraction,
  type OverwriteResolvable, type StringSelectMenuInteraction, type TextChannel,
} from "discord.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { loadSupportTicketsSetting, saveSupportTicketsSetting } from "./db";

/* ------------------------------------------------------------------ */
/* Setări                                                               */
/* ------------------------------------------------------------------ */

export type SupportTicketCategory = {
  /** Stable id (letters, digits, dash), used in the menu and in the database. */
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** The Discord category the channels go under; empty = the one of the panel's channel. */
  parentId: string;
  /** Staff roles of this category; empty = the general staff roles. */
  staffRoleIds: string[];
  /** The first message in the ticket; {user} is the member. */
  welcome: string;
  /** Ask the member to say what it is about before the channel opens. */
  askReason: boolean;
};

export type SupportTicketsConfig = {
  enabled: boolean;
  panelChannelId: string;
  panelMessageId: string;
  panelTitle: string;
  panelDescription: string;
  color: string;
  staffRoleIds: string[];
  /** Transcripts, closings and ratings. */
  logChannelId: string;
  maxOpenPerUser: number;
  /** Delete the channel a little after it is closed (the transcript stays in the log). */
  deleteAfterClose: boolean;
  rating: { enabled: boolean; question: string };
  categories: SupportTicketCategory[];
};

export const MAX_TICKET_CATEGORIES = 25;

const DEFAULT_CATEGORIES: SupportTicketCategory[] = [
  { id: "ajutor", label: "Ajutor general", emoji: "🙋", description: "Ai o întrebare sau ai nevoie de ajutor.", parentId: "", staffRoleIds: [], welcome: "Salut, {user}! Spune-ne cu ce te putem ajuta, iar cineva din staff îți răspunde cât mai repede.", askReason: false },
  { id: "raport", label: "Raportează un membru", emoji: "🚨", description: "Cineva încalcă regulile.", parentId: "", staffRoleIds: [], welcome: "{user}, mulțumim că ne anunți. Scrie cine, ce s-a întâmplat și, dacă poți, pune capturi.", askReason: true },
  { id: "tehnic", label: "Problemă tehnică", emoji: "🛠️", description: "Un bot, un rol sau un canal nu merge.", parentId: "", staffRoleIds: [], welcome: "{user}, descrie problema și ce ai încercat deja.", askReason: false },
  { id: "intrebari", label: "Întrebări despre server", emoji: "❓", description: "Reguli, roluri, evenimente.", parentId: "", staffRoleIds: [], welcome: "Salut, {user}! Pune întrebarea, te ajutăm imediat.", askReason: false },
];

export const DEFAULT_SUPPORT_TICKETS_CONFIG: SupportTicketsConfig = {
  enabled: false,
  panelChannelId: "",
  panelMessageId: "",
  panelTitle: "🎫 Deschide un tichet",
  panelDescription: "Alege mai jos ce te aduce aici. Se deschide un canal privat doar pentru tine și staff.",
  color: "#d8a964",
  staffRoleIds: [],
  logChannelId: "",
  maxOpenPerUser: 1,
  deleteAfterClose: true,
  rating: { enabled: true, question: "Cum ai evalua ajutorul primit?" },
  categories: DEFAULT_CATEGORIES,
};

const isSnowflake = (value: unknown): value is string => typeof value === "string" && /^\d{5,25}$/.test(value);
const text = (value: unknown, fallback: string, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback);
const roleList = (value: unknown) => (Array.isArray(value) ? [...new Set(value.filter(isSnowflake))].slice(0, 10) : []);

export function categorySlug(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

export function normalizeSupportTicketsConfig(value: unknown): SupportTicketsConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const defaults = DEFAULT_SUPPORT_TICKETS_CONFIG;
  const seen = new Set<string>();
  const categories = (Array.isArray(raw.categories) ? raw.categories : defaults.categories)
    .filter((item: unknown): item is Record<string, any> => Boolean(item) && typeof item === "object")
    .map((item: Record<string, any>) => {
      const label = text(item.label, "", 80);
      let id = categorySlug(typeof item.id === "string" && item.id ? item.id : label) || "categorie";
      while (seen.has(id)) id = `${id.slice(0, 28)}-${seen.size + 1}`;
      seen.add(id);
      return {
        id, label,
        emoji: text(item.emoji, "🎫", 32),
        description: typeof item.description === "string" ? item.description.trim().slice(0, 100) : "",
        parentId: isSnowflake(item.parentId) ? item.parentId : "",
        staffRoleIds: roleList(item.staffRoleIds),
        welcome: text(item.welcome, "Salut, {user}! Spune-ne cu ce te putem ajuta.", 1_500),
        askReason: item.askReason === true,
      };
    })
    .filter((item: SupportTicketCategory) => item.label)
    .slice(0, MAX_TICKET_CATEGORIES);
  const maxOpen = Number(raw.maxOpenPerUser);
  return {
    enabled: raw.enabled === true,
    panelChannelId: isSnowflake(raw.panelChannelId) ? raw.panelChannelId : "",
    panelMessageId: isSnowflake(raw.panelMessageId) ? raw.panelMessageId : "",
    panelTitle: text(raw.panelTitle, defaults.panelTitle, 256),
    panelDescription: text(raw.panelDescription, defaults.panelDescription, 2_000),
    color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : defaults.color,
    staffRoleIds: roleList(raw.staffRoleIds),
    logChannelId: isSnowflake(raw.logChannelId) ? raw.logChannelId : "",
    maxOpenPerUser: Number.isInteger(maxOpen) && maxOpen >= 1 && maxOpen <= 5 ? maxOpen : defaults.maxOpenPerUser,
    deleteAfterClose: raw.deleteAfterClose !== false,
    rating: {
      enabled: raw.rating?.enabled !== false,
      question: text(raw.rating?.question, defaults.rating.question, 200),
    },
    categories,
  };
}

export async function loadSupportTicketsConfig(guildId: string): Promise<SupportTicketsConfig> {
  return normalizeSupportTicketsConfig(await loadSupportTicketsSetting(guildId));
}

export async function saveSupportTicketsConfig(guildId: string, value: unknown): Promise<SupportTicketsConfig> {
  const config = normalizeSupportTicketsConfig(value);
  await saveSupportTicketsSetting(guildId, config);
  return config;
}

/* ------------------------------------------------------------------ */
/* Baza de date                                                         */
/* ------------------------------------------------------------------ */

export type SupportTicketRow = {
  id: number; guild_id: string; channel_id: string; opener_id: string; category_id: string; category_label: string;
  reason: string | null; status: "open" | "closed"; claimed_by: string | null; opened_at: Date; closed_at: Date | null;
  closed_by: string | null; rating: number | null; rating_comment: string | null; rated_staff_id: string | null;
};

let tablesReady: Promise<void> | null = null;
export function ensureSupportTicketTables(): Promise<void> {
  tablesReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id serial PRIMARY KEY,
      guild_id text NOT NULL,
      channel_id text NOT NULL UNIQUE,
      opener_id text NOT NULL,
      category_id text NOT NULL,
      category_label text NOT NULL,
      reason text,
      status text NOT NULL DEFAULT 'open',
      claimed_by text,
      opened_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      closed_by text,
      rating integer,
      rating_comment text,
      rated_staff_id text,
      rated_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS support_tickets_open_idx ON support_tickets (guild_id, opener_id) WHERE status = 'open';
    CREATE INDEX IF NOT EXISTS support_tickets_rated_idx ON support_tickets (guild_id, rated_staff_id) WHERE rating IS NOT NULL;
  `).then(() => undefined).catch((error) => {
    tablesReady = null;
    throw error;
  });
  return tablesReady;
}

async function ticketById(id: number): Promise<SupportTicketRow | null> {
  await ensureSupportTicketTables();
  const result = await pool.query<SupportTicketRow>(`SELECT * FROM support_tickets WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Cine e staff                                                         */
/* ------------------------------------------------------------------ */

export function staffRolesFor(config: SupportTicketsConfig, category: SupportTicketCategory | undefined): string[] {
  return category?.staffRoleIds.length ? category.staffRoleIds : config.staffRoleIds;
}

export function isTicketStaff(member: GuildMember | null | undefined, roleIds: string[]): boolean {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild) || member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return roleIds.some((roleId) => member.roles?.cache?.has(roleId));
}

/* ------------------------------------------------------------------ */
/* Panoul                                                               */
/* ------------------------------------------------------------------ */

const colorOf = (config: SupportTicketsConfig) => Number.parseInt(config.color.slice(1), 16);

export function buildTicketPanel(config: SupportTicketsConfig) {
  const embed = new EmbedBuilder()
    .setColor(colorOf(config))
    .setTitle(config.panelTitle)
    .setDescription(config.panelDescription)
    .addFields(config.categories.slice(0, 10).map((category) => ({
      name: `${category.emoji} ${category.label}`, value: category.description || "​", inline: true,
    })))
    .setFooter({ text: "Tichetele sunt private: le văd doar staff-ul și tu." });
  const menu = new StringSelectMenuBuilder()
    .setCustomId("tichet_open")
    .setPlaceholder("Alege categoria tichetului")
    .addOptions(config.categories.map((category) => ({
      label: category.label.slice(0, 100), value: category.id, description: category.description.slice(0, 100) || undefined,
      emoji: category.emoji,
    })));
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

/** Posts the panel, or updates the one already posted; returns the message id. */
export async function publishSupportTicketPanel(client: Client, guildId: string, config: SupportTicketsConfig): Promise<string> {
  if (!config.panelChannelId) throw new Error("Alege canalul panoului de tichete.");
  if (!config.categories.length) throw new Error("Adaugă cel puțin o categorie.");
  const channel = await client.channels.fetch(config.panelChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel) || ("guildId" in channel && channel.guildId !== guildId)) {
    throw new Error("Canalul panoului nu e un canal text al serverului sau botul nu îl vede.");
  }
  const payload = buildTicketPanel(config);
  if (config.panelMessageId && "messages" in channel) {
    const existing = await channel.messages.fetch(config.panelMessageId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return existing.id;
    }
  }
  const message = await channel.send(payload);
  return message.id;
}

/* ------------------------------------------------------------------ */
/* Deschiderea                                                          */
/* ------------------------------------------------------------------ */

export function ticketChannelName(category: SupportTicketCategory, username: string): string {
  const who = categorySlug(username) || "membru";
  return `${category.emoji}・${categorySlug(category.label) || "tichet"}-${who}`.slice(0, 90);
}

function ticketButtons(id: number, claimedBy: string | null) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tichet_claim_${id}`).setStyle(ButtonStyle.Primary)
      .setLabel(claimedBy ? "Preluat" : "Preia").setEmoji("🙋").setDisabled(Boolean(claimedBy)),
    new ButtonBuilder().setCustomId(`tichet_close_${id}`).setStyle(ButtonStyle.Danger).setLabel("Închide").setEmoji("🔒"),
  );
}

async function openTicket(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction, config: SupportTicketsConfig, category: SupportTicketCategory, reason: string | null,
): Promise<void> {
  const guild = interaction.guild!;
  await ensureSupportTicketTables();
  const open = await pool.query<{ channel_id: string }>(
    `SELECT channel_id FROM support_tickets WHERE guild_id = $1 AND opener_id = $2 AND status = 'open' ORDER BY opened_at`,
    [guild.id, interaction.user.id],
  );
  // A ticket whose channel was deleted by hand does not count.
  const alive = open.rows.filter((row) => guild.channels.cache.has(row.channel_id));
  if (alive.length >= config.maxOpenPerUser) {
    await interaction.editReply(`🎫 Ai deja ${alive.length === 1 ? "un tichet deschis" : `${alive.length} tichete deschise`}: ${alive.map((row) => `<#${row.channel_id}>`).join(", ")}. Închide-l înainte să deschizi altul.`);
    return;
  }
  const staff = staffRolesFor(config, category).filter((roleId) => guild.roles.cache.has(roleId));
  const parentId = category.parentId
    || (config.panelChannelId ? (guild.channels.cache.get(config.panelChannelId) as TextChannel | undefined)?.parentId ?? undefined : undefined);
  const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.client.user!.id, allow: [...access, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
    { id: interaction.user.id, allow: access },
    ...staff.map((roleId) => ({ id: roleId, allow: access })),
  ];
  const channel = await guild.channels.create({
    name: ticketChannelName(category, interaction.user.username),
    type: ChannelType.GuildText,
    ...(parentId ? { parent: parentId } : {}),
    topic: `Tichet ${category.label} · ${interaction.user.tag ?? interaction.user.username} (${interaction.user.id})`,
    permissionOverwrites: overwrites,
    reason: `Tichet deschis de ${interaction.user.id}`,
  });
  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO support_tickets (guild_id, channel_id, opener_id, category_id, category_label, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [guild.id, channel.id, interaction.user.id, category.id, category.label, reason],
  );
  const id = inserted.rows[0]!.id;
  const embed = new EmbedBuilder()
    .setColor(colorOf(config))
    .setAuthor({ name: interaction.user.globalName ?? interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setTitle(`${category.emoji} ${category.label}`)
    .setDescription(category.welcome.replaceAll("{user}", `<@${interaction.user.id}>`).slice(0, 4_000))
    .setFooter({ text: `Tichet #${id} · „Preia” e pentru staff, „Închide” pentru oricine din tichet` })
    .setTimestamp();
  if (reason) embed.addFields({ name: "📝 Despre ce e vorba", value: reason.slice(0, 1_024) });
  await channel.send({
    content: [`<@${interaction.user.id}>`, ...staff.map((roleId) => `<@&${roleId}>`)].join(" "),
    embeds: [embed],
    components: [ticketButtons(id, null)],
    allowedMentions: { users: [interaction.user.id], roles: staff },
  });
  await interaction.editReply(`✅ Tichetul tău e gata: <#${channel.id}>`);
}

/* ------------------------------------------------------------------ */
/* Închiderea, transcrierea și evaluarea                                */
/* ------------------------------------------------------------------ */

export function transcriptLine(message: { createdAt: Date; author: { username: string; bot?: boolean }; content: string; attachments?: Map<string, { url: string }> | { values(): Iterable<{ url: string }> }; embeds?: Array<{ title?: string | null; description?: string | null }> }): string {
  const time = message.createdAt.toISOString().replace("T", " ").slice(0, 16);
  const files = message.attachments ? [...message.attachments.values()].map((item) => item.url) : [];
  const embeds = (message.embeds ?? []).map((embed) => [embed.title, embed.description].filter(Boolean).join(" — ")).filter(Boolean);
  const body = [message.content, ...embeds.map((value) => `[embed] ${value}`), ...files.map((url) => `[fișier] ${url}`)].filter(Boolean).join("\n    ");
  return `[${time}] ${message.author.username}${message.author.bot ? " (bot)" : ""}: ${body || "(fără text)"}`;
}

async function buildTranscript(channel: TextChannel): Promise<{ text: string; count: number }> {
  const messages: Array<Parameters<typeof transcriptLine>[0]> = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { text: messages.map(transcriptLine).join("\n"), count: messages.length };
}

export function ratingRow(id: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents([1, 2, 3, 4, 5].map((stars) =>
    new ButtonBuilder().setCustomId(`tichet_rate_${id}_${stars}`).setStyle(stars >= 4 ? ButtonStyle.Success : stars === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setLabel(`${stars}`).setEmoji("⭐"),
  ));
}

export const stars = (count: number) => "⭐".repeat(Math.max(0, Math.min(5, count))) + "☆".repeat(Math.max(0, 5 - count));

function minutesText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} zile`;
}

async function logChannelOf(guild: Guild, config: SupportTicketsConfig): Promise<TextChannel | null> {
  if (!config.logChannelId) return null;
  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  return channel?.isTextBased() && "send" in channel ? channel as TextChannel : null;
}

async function closeTicket(interaction: ButtonInteraction, config: SupportTicketsConfig, ticket: SupportTicketRow): Promise<void> {
  const guild = interaction.guild!;
  const closed = await pool.query<SupportTicketRow>(
    `UPDATE support_tickets SET status = 'closed', closed_at = now(), closed_by = $2 WHERE id = $1 AND status = 'open' RETURNING *`,
    [ticket.id, interaction.user.id],
  );
  const row = closed.rows[0];
  if (!row) {
    await interaction.editReply("Tichetul e deja închis.");
    return;
  }
  const channel = interaction.channel as TextChannel;
  await channel.permissionOverwrites?.edit(row.opener_id, { SendMessages: false }).catch(() => undefined);
  const transcript = await buildTranscript(channel);
  const category = config.categories.find((item) => item.id === row.category_id);
  // Who the member rates: whoever took the ticket, or the staff member who closed it.
  const closerIsStaff = interaction.user.id !== row.opener_id && isTicketStaff(interaction.member as GuildMember, staffRolesFor(config, category));
  const helper = row.claimed_by ?? (closerIsStaff ? interaction.user.id : null);
  const summary = new EmbedBuilder()
    .setColor(0x8a8f98)
    .setTitle(`🔒 Tichet închis · #${row.id} ${category?.emoji ?? "🎫"} ${row.category_label}`)
    .addFields(
      { name: "👤 Membru", value: `<@${row.opener_id}>`, inline: true },
      { name: "🙋 Preluat de", value: row.claimed_by ? `<@${row.claimed_by}>` : "nimeni", inline: true },
      { name: "🔒 Închis de", value: `<@${interaction.user.id}>`, inline: true },
      { name: "⏱️ Durata", value: minutesText(Date.now() - new Date(row.opened_at).getTime()), inline: true },
      { name: "💬 Mesaje", value: String(transcript.count), inline: true },
    )
    .setTimestamp();
  if (row.reason) summary.addFields({ name: "📝 Motiv", value: row.reason.slice(0, 1_024) });
  const log = await logChannelOf(guild, config);
  await log?.send({
    embeds: [summary],
    files: [new AttachmentBuilder(Buffer.from(transcript.text || "(tichet gol)", "utf8"), { name: `tichet-${row.id}.txt` })],
    allowedMentions: { parse: [] },
  }).catch((error) => logger.warn({ error, guildId: guild.id }, "Ticket transcript could not be posted"));

  let ratingInChannel = false;
  if (config.rating.enabled && helper && helper !== row.opener_id) {
    await pool.query(`UPDATE support_tickets SET rated_staff_id = $2 WHERE id = $1`, [row.id, helper]);
    const prompt = {
      embeds: [new EmbedBuilder().setColor(colorOf(config)).setTitle(`⭐ ${config.rating.question}`)
        .setDescription(`Tichetul **${row.category_label}** de pe **${guild.name}** s-a închis. Te-a ajutat <@${helper}>.\nAlege de la 1 la 5 stele; răspunsul ajută echipa să se facă mai bună.`)],
      components: [ratingRow(row.id)],
    };
    const opener = await interaction.client.users.fetch(row.opener_id).catch(() => null);
    const sent = await opener?.send(prompt).catch(() => null);
    if (!sent) {
      // Private messages are closed: the question goes in the ticket, which then stays a while longer.
      await channel.send({ content: `<@${row.opener_id}>`, ...prompt, allowedMentions: { users: [row.opener_id] } }).catch(() => undefined);
      ratingInChannel = true;
    }
  }
  const delay = ratingInChannel ? 10 * 60_000 : 10_000;
  await interaction.editReply(config.deleteAfterClose
    ? `🔒 Tichet închis. Canalul se șterge ${ratingInChannel ? "în 10 minute (până atunci membrul poate evalua aici)" : "în câteva secunde"}; transcrierea rămâne în jurnal.`
    : "🔒 Tichet închis. Transcrierea e în jurnal.");
  if (config.deleteAfterClose) {
    setTimeout(() => { void channel.delete(`Tichet #${row.id} închis`).catch(() => undefined); }, delay).unref?.();
  }
}

async function recordRating(interaction: ButtonInteraction, id: number, value: number): Promise<void> {
  await ensureSupportTicketTables();
  const updated = await pool.query<SupportTicketRow>(
    `UPDATE support_tickets SET rating = $3, rated_at = now()
      WHERE id = $1 AND opener_id = $2 AND status = 'closed' AND rating IS NULL AND rated_staff_id IS NOT NULL RETURNING *`,
    [id, interaction.user.id, value],
  );
  const row = updated.rows[0];
  if (!row) {
    const existing = await ticketById(id);
    await interaction.reply({
      content: !existing || existing.opener_id !== interaction.user.id ? "Doar cine a deschis tichetul îl poate evalua." : "Ai evaluat deja tichetul acesta. Mulțumim!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0x36a878).setTitle("Mulțumim pentru evaluare!").setDescription(`${stars(value)} pentru <@${row.rated_staff_id}>.`)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tichet_comment_${id}`).setStyle(ButtonStyle.Secondary).setLabel("Adaugă un comentariu").setEmoji("💬"),
    )],
  });
  const client = interaction.client;
  const guild = client.guilds.cache.get(row.guild_id);
  if (guild) {
    const config = await loadSupportTicketsConfig(row.guild_id);
    const log = await logChannelOf(guild, config);
    await log?.send({
      embeds: [new EmbedBuilder().setColor(value >= 4 ? 0x36a878 : value === 3 ? 0xd8a964 : 0xd95050)
        .setTitle(`${stars(value)} · tichet #${row.id}`)
        .setDescription(`<@${row.opener_id}> a evaluat ajutorul lui <@${row.rated_staff_id}> (${row.category_label}).`)],
      allowedMentions: { parse: [] },
    }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Reputația staff-ului                                                 */
/* ------------------------------------------------------------------ */

export type StaffReputationRow = { staffId: string; ratings: number; average: number; score: number; handled: number; distribution: number[] };

/** Fewer than this many ratings and a perfect average would beat a long, very good record; the score pulls them to the middle. */
export const REPUTATION_PRIOR = { weight: 3, mean: 3.5 };

/** The average, pulled toward 3.5 while there are few ratings (a Bayesian average): one ⭐⭐⭐⭐⭐ does not top twenty ⭐⭐⭐⭐. */
export function reputationScore(average: number, ratings: number): number {
  return (average * ratings + REPUTATION_PRIOR.mean * REPUTATION_PRIOR.weight) / (ratings + REPUTATION_PRIOR.weight);
}

export async function getStaffReputation(guildId: string, sinceDays: number | null, limit = 25): Promise<StaffReputationRow[]> {
  await ensureSupportTicketTables();
  const since = sinceDays ? new Date(Date.now() - sinceDays * 86_400_000) : null;
  const [ratings, handled] = await Promise.all([
    pool.query<{ staff: string; ratings: number; average: string; s1: number; s2: number; s3: number; s4: number; s5: number }>(
      `SELECT rated_staff_id AS staff, COUNT(*)::int AS ratings, AVG(rating)::text AS average,
              COUNT(*) FILTER (WHERE rating = 1)::int AS s1, COUNT(*) FILTER (WHERE rating = 2)::int AS s2,
              COUNT(*) FILTER (WHERE rating = 3)::int AS s3, COUNT(*) FILTER (WHERE rating = 4)::int AS s4,
              COUNT(*) FILTER (WHERE rating = 5)::int AS s5
         FROM support_tickets
        WHERE guild_id = $1 AND rating IS NOT NULL AND ($2::timestamptz IS NULL OR rated_at >= $2)
        GROUP BY rated_staff_id`,
      [guildId, since],
    ),
    pool.query<{ staff: string; handled: number }>(
      `SELECT COALESCE(claimed_by, rated_staff_id) AS staff, COUNT(*)::int AS handled
         FROM support_tickets
        WHERE guild_id = $1 AND status = 'closed' AND COALESCE(claimed_by, rated_staff_id) IS NOT NULL
          AND ($2::timestamptz IS NULL OR closed_at >= $2)
        GROUP BY COALESCE(claimed_by, rated_staff_id)`,
      [guildId, since],
    ),
  ]);
  const handledBy = new Map(handled.rows.map((row) => [row.staff, Number(row.handled)]));
  return ratings.rows
    .map((row) => {
      const average = Number(row.average);
      return {
        staffId: row.staff, ratings: Number(row.ratings), average, score: reputationScore(average, Number(row.ratings)),
        handled: handledBy.get(row.staff) ?? 0, distribution: [row.s1, row.s2, row.s3, row.s4, row.s5].map(Number),
      };
    })
    .sort((a, b) => b.score - a.score || b.ratings - a.ratings)
    .slice(0, limit);
}

export function buildStaffReputationEmbed(input: { guildName: string; periodLabel: string; rows: StaffReputationRow[]; color?: number; viewerId?: string }): EmbedBuilder {
  const medal = (index: number) => ["🥇", "🥈", "🥉"][index] ?? `**${index + 1}.**`;
  const lines = input.rows.slice(0, 10).map((row, index) =>
    `${medal(index)} <@${row.staffId}> · **${row.average.toFixed(1).replace(".", ",")}** ⭐ din ${row.ratings} ${row.ratings === 1 ? "evaluare" : "evaluări"} · ${row.handled} ${row.handled === 1 ? "tichet" : "tichete"}`);
  const embed = new EmbedBuilder()
    .setColor(input.color ?? 0xd8a964)
    .setAuthor({ name: `Staff · ${input.guildName.slice(0, 100)}` })
    .setTitle("🏆 Reputația staff-ului")
    .setDescription(lines.length ? lines.join("\n") : "Încă nicio evaluare în perioada asta. După fiecare tichet închis, membrul poate da 1–5 stele.")
    .addFields({ name: "📅 Perioada", value: input.periodLabel, inline: true })
    .setFooter({ text: "Ordinea ține cont și de câte evaluări are fiecare, nu doar de medie." })
    .setTimestamp();
  if (input.viewerId) {
    const place = input.rows.findIndex((row) => row.staffId === input.viewerId);
    if (place >= 0) embed.addFields({ name: "📍 Tu", value: `Locul **${place + 1}** · ${stars(Math.round(input.rows[place]!.average))}`, inline: true });
  }
  return embed;
}

export const REPUTATION_PERIODS = [
  { value: "7", label: "ultimele 7 zile", days: 7 },
  { value: "30", label: "ultimele 30 de zile", days: 30 },
  { value: "90", label: "ultimele 90 de zile", days: 90 },
  { value: "all", label: "de la început", days: null },
] as const;

export async function handleTopStaffCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "topstaff") return false;
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "Topul staff-ului se vede doar pe un server.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply();
  const period = REPUTATION_PERIODS.find((item) => item.value === (interaction.options.getString("perioada") ?? "30")) ?? REPUTATION_PERIODS[1];
  const config = await loadSupportTicketsConfig(interaction.guildId!);
  const rows = await getStaffReputation(interaction.guildId!, period.days);
  await interaction.editReply({
    embeds: [buildStaffReputationEmbed({ guildName: interaction.guild.name, periodLabel: period.label, rows, color: colorOf(config), viewerId: interaction.user.id })],
    allowedMentions: { parse: [] },
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* Interacțiunile                                                       */
/* ------------------------------------------------------------------ */

const reply = (interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, content: string) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

export async function handleSupportTicketInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (!id.startsWith("tichet_")) return false;
  try {
    // Ratings arrive in private messages, outside the server.
    const rate = id.match(/^tichet_rate_(\d+)_([1-5])$/);
    if (rate && interaction.isButton()) {
      await recordRating(interaction, Number(rate[1]), Number(rate[2]));
      return true;
    }
    const comment = id.match(/^tichet_comment_(\d+)$/);
    if (comment && interaction.isButton()) {
      const ticket = await ticketById(Number(comment[1]));
      if (!ticket || ticket.opener_id !== interaction.user.id || ticket.rating === null) {
        await reply(interaction, "Comentariul se poate adăuga doar după evaluare, de cine a deschis tichetul.");
        return true;
      }
      await interaction.showModal(new ModalBuilder().setCustomId(`tichet_commentform_${ticket.id}`).setTitle("Comentariu pentru staff").addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("text").setLabel("Ce a mers bine sau ce s-ar putea face mai bine?")
          .setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)),
      ));
      return true;
    }
    const commentForm = id.match(/^tichet_commentform_(\d+)$/);
    if (commentForm && interaction.isModalSubmit()) {
      const value = interaction.fields.getTextInputValue("text").trim().slice(0, 500);
      const saved = await pool.query(
        `UPDATE support_tickets SET rating_comment = $3 WHERE id = $1 AND opener_id = $2 AND rating IS NOT NULL AND rating_comment IS NULL RETURNING id`,
        [Number(commentForm[1]), interaction.user.id, value],
      );
      await reply(interaction, saved.rowCount ? "💬 Mulțumim, comentariul a ajuns la staff." : "Comentariul a fost deja trimis.");
      return true;
    }

    if (!interaction.inGuild() || !interaction.guild) return true;
    const config = await loadSupportTicketsConfig(interaction.guildId!);

    if (id === "tichet_open" && interaction.isStringSelectMenu()) {
      const category = config.categories.find((item) => item.id === interaction.values[0]);
      if (!config.enabled || !category) {
        await reply(interaction, "🎫 Tichetele nu sunt deschise acum sau categoria nu mai există.");
        return true;
      }
      if (category.askReason) {
        await interaction.showModal(new ModalBuilder().setCustomId(`tichet_reason_${category.id}`).setTitle(`${category.label}`.slice(0, 45)).addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Despre ce e vorba?")
            .setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1_000).setRequired(true)),
        ));
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await openTicket(interaction, config, category, null);
      return true;
    }
    const reasonForm = id.match(/^tichet_reason_([a-z0-9-]+)$/);
    if (reasonForm && interaction.isModalSubmit()) {
      const category = config.categories.find((item) => item.id === reasonForm[1]);
      if (!config.enabled || !category) {
        await reply(interaction, "🎫 Tichetele nu sunt deschise acum sau categoria nu mai există.");
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await openTicket(interaction, config, category, interaction.fields.getTextInputValue("reason").trim());
      return true;
    }

    const action = id.match(/^tichet_(claim|close|confirm)_(\d+)$/);
    if (action && interaction.isButton()) {
      const ticket = await ticketById(Number(action[2]));
      if (!ticket || ticket.guild_id !== interaction.guildId) {
        await reply(interaction, "Tichetul nu mai există.");
        return true;
      }
      if (ticket.status !== "open") {
        await reply(interaction, "Tichetul e deja închis.");
        return true;
      }
      const category = config.categories.find((item) => item.id === ticket.category_id);
      const staff = isTicketStaff(interaction.member as GuildMember, staffRolesFor(config, category));
      if (action[1] === "claim") {
        if (!staff) {
          await reply(interaction, "🙋 Doar staff-ul poate prelua un tichet.");
          return true;
        }
        const claimed = await pool.query(`UPDATE support_tickets SET claimed_by = $2 WHERE id = $1 AND claimed_by IS NULL AND status = 'open' RETURNING id`, [ticket.id, interaction.user.id]);
        if (!claimed.rowCount) {
          await reply(interaction, `Tichetul e deja preluat de <@${ticket.claimed_by}>.`);
          return true;
        }
        await interaction.update({ components: [ticketButtons(ticket.id, interaction.user.id)] });
        await (interaction.channel as TextChannel)?.send({ content: `🙋 <@${interaction.user.id}> a preluat tichetul și te ajută de acum.`, allowedMentions: { parse: [] } }).catch(() => undefined);
        return true;
      }
      if (!staff && interaction.user.id !== ticket.opener_id) {
        await reply(interaction, "🔒 Doar cine a deschis tichetul sau staff-ul îl poate închide.");
        return true;
      }
      if (action[1] === "close") {
        await interaction.reply({
          content: "Sigur închizi tichetul? Se păstrează o transcriere în jurnal.",
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`tichet_confirm_${ticket.id}`).setStyle(ButtonStyle.Danger).setLabel("Da, închide").setEmoji("🔒"),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await closeTicket(interaction, config, ticket);
      return true;
    }
    await reply(interaction, "⌛ Butonul acesta nu mai e valabil.");
    return true;
  } catch (error) {
    logger.warn({ error, guildId: interaction.guildId, customId: id }, "Support ticket interaction failed");
    const message = "❌ N-a mers. Verifică dacă botul are permisiunea Manage Channels și încearcă din nou.";
    if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(() => undefined);
    else await reply(interaction, message).catch(() => undefined);
    return true;
  }
}
