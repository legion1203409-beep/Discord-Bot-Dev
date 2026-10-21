import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { pool } from "@workspace/db";
import { getVerificationOAuthUrl } from "../moderation/oauth";
import { loadVerificationConfig, saveVerificationConfig, type VerificationConfig } from "./db";
import { normalizeMessageImageUrl, publicMessageImageUrl } from "./message-media";

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  enabled: false,
  channelId: "",
  roleId: "",
  title: "Verifică-ți contul",
  message: "Apasă butonul de mai jos pentru a confirma că deții contul Discord și pentru a primi rolul comunității.",
  buttonLabel: "Verifică-mă",
  buttonEmoji: "✅",
  successMessage: "Contul tău a fost verificat. Rolul a fost acordat.",
  alreadyVerifiedMessage: "Contul tău este deja verificat.",
  imageUrl: "",
  thumbnailUrl: "",
  panelMessageId: "",
};

export function normalizeVerificationConfig(value: Partial<VerificationConfig> | null | undefined): VerificationConfig {
  return {
    ...DEFAULT_VERIFICATION_CONFIG,
    ...(value ?? {}),
    enabled: value?.enabled === true,
    channelId: typeof value?.channelId === "string" ? value.channelId.trim() : "",
    roleId: typeof value?.roleId === "string" ? value.roleId.trim() : "",
    title: typeof value?.title === "string" && value.title.trim() ? value.title.trim() : DEFAULT_VERIFICATION_CONFIG.title,
    message: typeof value?.message === "string" && value.message.trim() ? value.message.trim() : DEFAULT_VERIFICATION_CONFIG.message,
    buttonLabel: typeof value?.buttonLabel === "string" && value.buttonLabel.trim() ? value.buttonLabel.trim() : DEFAULT_VERIFICATION_CONFIG.buttonLabel,
    buttonEmoji: typeof value?.buttonEmoji === "string" ? value.buttonEmoji.trim() : "",
    successMessage: typeof value?.successMessage === "string" && value.successMessage.trim() ? value.successMessage.trim() : DEFAULT_VERIFICATION_CONFIG.successMessage,
    alreadyVerifiedMessage: typeof value?.alreadyVerifiedMessage === "string" && value.alreadyVerifiedMessage.trim() ? value.alreadyVerifiedMessage.trim() : DEFAULT_VERIFICATION_CONFIG.alreadyVerifiedMessage,
    imageUrl: normalizeMessageImageUrl(value?.imageUrl),
    thumbnailUrl: normalizeMessageImageUrl(value?.thumbnailUrl),
    panelMessageId: typeof value?.panelMessageId === "string" ? value.panelMessageId.trim() : "",
  };
}

export function verificationPanel(config: VerificationConfig, verificationUrl: string) {
  const labelCustomEmoji = /<(a?):([a-zA-Z0-9_]+):(\d+)>/.exec(config.buttonLabel);
  const cleanLabel = config.buttonLabel.replace(/<(?:a?):[a-zA-Z0-9_]+:\d+>/g, "").trim() || "Verifică-mă";
  const button = new ButtonBuilder()
    .setLabel(cleanLabel.slice(0, 80))
    .setStyle(ButtonStyle.Link)
    .setURL(verificationUrl);
  if (config.buttonEmoji || labelCustomEmoji) {
    const custom = /^<(a?):([a-zA-Z0-9_]+):(\d+)>$/.exec(config.buttonEmoji) || labelCustomEmoji;
    button.setEmoji(custom
      ? { id: custom[3], name: custom[2], animated: custom[1] === "a" }
      : config.buttonEmoji);
  }
  const embed = new EmbedBuilder()
    .setTitle(config.title.slice(0, 256))
    .setDescription(config.message.slice(0, 4_000))
    .setColor(0x8f5bff);
  const imageUrl = publicMessageImageUrl(config.imageUrl);
  const thumbnailUrl = publicMessageImageUrl(config.thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return {
    embeds: [
      embed,
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

export class VerificationPanelPersistenceError extends Error {
  constructor(public readonly publishedConfig: VerificationConfig, options?: ErrorOptions) {
    super("Verification panel was published but its configuration could not be persisted.", options);
    this.name = "VerificationPanelPersistenceError";
  }
}

const VERIFICATION_PANEL_RECONCILE_PAGE_SIZE = 100;
const VERIFICATION_PANEL_RECONCILE_MAX_MESSAGES = 500;
const verificationPanelLocks = new Map<string, Promise<void>>();

async function withVerificationPanelLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = verificationPanelLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  verificationPanelLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (verificationPanelLocks.get(key) === current) verificationPanelLocks.delete(key);
  }
}

function isVerificationPanelMessage(message: Message, botUserId: string): boolean {
  return message.author.id === botUserId
    && message.components.some((row) => "components" in row && row.components.some(
      (component) => (
        ("customId" in component && component.customId === "verification_start")
        || ("url" in component && typeof component.url === "string" && isVerificationOAuthUrl(component.url))
      ),
    ));
}

function isVerificationOAuthUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname === "/api/moderation/oauth/discord"
      && url.searchParams.get("verification") === "1";
  } catch {
    return false;
  }
}

function verificationPanelReconciliationError(reason: string): Error {
  return new Error(
    `Nu pot verifica în siguranță dacă panoul de verificare există deja (${reason}). Verifică permisiunea Read Message History și panourile existente, apoi reîncearcă; nu a fost trimis un panou nou.`,
  );
}

function discordErrorCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = Number((error as { code: unknown }).code);
  return Number.isFinite(code) ? code : null;
}

function isOlderDiscordMessage(candidate: Message, current: Message): boolean {
  if (candidate.createdTimestamp !== current.createdTimestamp) {
    return candidate.createdTimestamp < current.createdTimestamp;
  }
  try {
    return BigInt(candidate.id) < BigInt(current.id);
  } catch {
    return false;
  }
}

type VerificationPanelHistoryChannel = {
  messages: {
    fetch(options: { limit: number; before?: string }): Promise<{
      size: number;
      values(): IterableIterator<Message>;
    }>;
  };
};

async function findExistingVerificationPanel(
  channel: VerificationPanelHistoryChannel,
  botUserId: string,
): Promise<Message | null> {
  const found: Message[] = [];
  let scanned = 0;
  let before: string | undefined;
  while (true) {
    const limit = Math.min(VERIFICATION_PANEL_RECONCILE_PAGE_SIZE, VERIFICATION_PANEL_RECONCILE_MAX_MESSAGES - scanned);
    let page;
    try {
      page = await channel.messages.fetch({ limit, ...(before ? { before } : {}) });
    } catch {
      throw verificationPanelReconciliationError("fetching channel history failed");
    }
    const messages = [...page.values()];
    for (const message of messages) {
      if (isVerificationPanelMessage(message, botUserId)) {
        found.push(message);
        if (found.length > 1) {
          throw verificationPanelReconciliationError("multiple bot-authored verification panels were found");
        }
      }
    }

    scanned += messages.length;
    if (messages.length < limit) return found[0] ?? null;
    if (scanned >= VERIFICATION_PANEL_RECONCILE_MAX_MESSAGES) {
      throw verificationPanelReconciliationError("channel history exceeds the safe scan limit");
    }

    const oldest = messages.reduce((oldestMessage, message) =>
      isOlderDiscordMessage(message, oldestMessage) ? message : oldestMessage,
    );
    if (oldest.id === before) {
      throw verificationPanelReconciliationError("channel history pagination did not advance");
    }
    before = oldest.id;
  }
}

export async function publishVerificationPanel(client: Client, guildId: string, input: VerificationConfig): Promise<VerificationConfig> {
  const config = normalizeVerificationConfig(input);
  if (!config.enabled) return config;
  if (!config.channelId || !config.roleId) throw new Error("Configurează canalul și rolul pentru verificare.");

  return withVerificationPanelLock(`${guildId}:${config.channelId}`, async () => {
    const botUserId = client.user?.id;
    if (!botUserId) {
      throw verificationPanelReconciliationError("the bot identity is unavailable");
    }
    const guild = await client.guilds.fetch({ guild: guildId, force: true });
    const channel = await guild.channels.fetch(config.channelId);
    if (!channel?.isTextBased() || !("send" in channel) || !("messages" in channel)) {
      throw new Error("Canalul de verificare nu este un canal text cu istoric de mesaje accesibil.");
    }

    const payload = verificationPanel(config, getVerificationOAuthUrl(guildId));
    let existingPanel: Message | null = null;
    if (config.panelMessageId) {
      try {
        const savedMessage = await channel.messages.fetch(config.panelMessageId);
        if (isVerificationPanelMessage(savedMessage, botUserId)) existingPanel = savedMessage;
      } catch (error) {
        if (discordErrorCode(error) !== 10008) {
          throw verificationPanelReconciliationError("the saved panel message could not be checked");
        }
      }
    }
    if (!existingPanel) {
      existingPanel = await findExistingVerificationPanel(channel, botUserId);
    }

    let messageId: string;
    if (existingPanel) {
      try {
        await existingPanel.edit(payload);
      } catch {
        throw verificationPanelReconciliationError("the existing bot-authored panel could not be edited");
      }
      messageId = existingPanel.id;
    } else {
      const message = await channel.send(payload);
      messageId = message.id;
    }

    const saved = { ...config, panelMessageId: messageId };
    try {
      await saveVerificationConfig(guildId, saved);
    } catch (error) {
      throw new VerificationPanelPersistenceError(saved, { cause: error });
    }
    return saved;
  });
}

export async function verifyMember(client: Client, guildId: string, userId: string): Promise<"verified" | "already_verified"> {
  const config = normalizeVerificationConfig(await loadVerificationConfig(guildId));
  if (!config.enabled || !config.roleId) throw new Error("Verificarea nu este configurată pentru acest server.");

  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const member = await guild.members.fetch(userId);
  const role = await guild.roles.fetch(config.roleId);
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  if (!role) throw new Error("Rolul de verificare nu mai există.");
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error("Botul nu are permisiunea Manage Roles.");
  if (role.managed || role.position >= botMember.roles.highest.position) {
    throw new Error("Rolul de verificare trebuie să fie sub rolul botului și să nu fie managed.");
  }
  if (member.roles.cache.has(role.id)) return "already_verified";
  await member.roles.add(role, "Verificare confirmată prin site");
  return "verified";
}

const COOKIE_NAME = "verification_identity";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;
const VERIFICATION_LINK_TTL_MS = 10 * 60 * 1_000;
const VERIFICATION_LINKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS discord_verification_links (
    token_hash text PRIMARY KEY,
    guild_id text NOT NULL,
    user_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS discord_verification_links_user_idx
    ON discord_verification_links (guild_id, user_id, expires_at);
`;

let verificationLinksSchemaReady: Promise<void> | null = null;

async function ensureVerificationLinksTable(): Promise<void> {
  verificationLinksSchemaReady ??= pool.query(VERIFICATION_LINKS_TABLE_SQL).then(() => undefined).catch((error) => {
    verificationLinksSchemaReady = null;
    throw error;
  });
  await verificationLinksSchemaReady;
}

export async function createVerificationLinkToken(guildId: string, userId: string): Promise<string> {
  await ensureVerificationLinksTable();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_LINK_TTL_MS);
  await pool.query(
    `UPDATE discord_verification_links
        SET used_at = now()
      WHERE guild_id = $1 AND user_id = $2 AND used_at IS NULL`,
    [guildId, userId],
  );
  await pool.query(
    `INSERT INTO discord_verification_links (token_hash, guild_id, user_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, guildId, userId, expiresAt],
  );
  await pool.query(
    `DELETE FROM discord_verification_links
      WHERE expires_at < now() - interval '30 days'`,
  );
  return token;
}

export async function consumeVerificationLinkToken(
  token: string,
): Promise<{ guildId: string; userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  await ensureVerificationLinksTable();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query<{ guild_id: string; user_id: string }>(
    `UPDATE discord_verification_links
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING guild_id, user_id`,
    [tokenHash],
  );
  const row = result.rows[0];
  return row ? { guildId: row.guild_id, userId: row.user_id } : null;
}

function signingSecret(): string {
  return process.env.SESSION_SECRET?.trim() || "development-verification-secret";
}

export function createVerificationIdentityToken(guildId: string, userId: string): string {
  const payload = Buffer.from(JSON.stringify({ guildId, userId, exp: Date.now() + COOKIE_TTL_SECONDS * 1_000 }), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function parseVerificationIdentityToken(token: string | undefined): { guildId: string; userId: string } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { guildId?: unknown; userId?: unknown; exp?: unknown };
    return typeof value.guildId === "string" && typeof value.userId === "string" && typeof value.exp === "number" && value.exp > Date.now()
      ? { guildId: value.guildId, userId: value.userId }
      : null;
  } catch {
    return null;
  }
}

export function verificationCookieName(): string {
  return COOKIE_NAME;
}

export function verificationTicketResponse(url: string) {
  const button = new ButtonBuilder()
    .setLabel("Deschide verificarea")
    .setStyle(ButtonStyle.Link)
    .setURL(url);
  return {
    content: "Continuă verificarea pe site folosind butonul de mai jos:",
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

export async function handleVerificationButton(interaction: ButtonInteraction, websiteUrl: string): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("Deschide această verificare dintr-un server Discord.");
    return;
  }

  try {
    const config = normalizeVerificationConfig(await loadVerificationConfig(guildId));
    if (!config.enabled || !config.roleId) {
      await interaction.editReply("Verificarea nu este configurată momentan pe acest server.");
      return;
    }
    const guild = interaction.guild ?? await interaction.client.guilds.fetch({ guild: guildId, force: true });
    const member = await guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(config.roleId)) {
      await interaction.editReply(config.alreadyVerifiedMessage);
      return;
    }

    const ticket = await createVerificationLinkToken(guildId, interaction.user.id);
    const url = `${websiteUrl}#ticket=${encodeURIComponent(ticket)}`;
    await interaction.editReply(verificationTicketResponse(url));
  } catch (error) {
    await interaction.editReply("Linkul de verificare nu a putut fi pregătit. Încearcă din nou în câteva momente.");
    throw error;
  }
}