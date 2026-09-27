import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type PresenceData,
} from "discord.js";

export function buildServerPresence(): PresenceData {
  return {
    status: "online",
    activities: [],
  };
}

export function normalizeDiscordInviteUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    const isDiscordInviteHost = hostname === "discord.gg" || hostname === "www.discord.gg";
    const isDiscordInvitePath =
      (hostname === "discord.com" || hostname === "www.discord.com") &&
      /^\/invite\/[^/]+\/?$/.test(url.pathname);

    if (
      url.protocol !== "https:" ||
      (!isDiscordInviteHost && !isDiscordInvitePath) ||
      (isDiscordInviteHost && url.pathname.split("/").filter(Boolean).length !== 1)
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function buildServerInfoComponents(
  inviteUrl: string | null | undefined,
): ActionRowBuilder<ButtonBuilder>[] {
  const safeInviteUrl = normalizeDiscordInviteUrl(inviteUrl);
  if (!safeInviteUrl) return [];

  const button = new ButtonBuilder()
    .setLabel("Intră pe server")
    .setStyle(ButtonStyle.Link)
    .setURL(safeInviteUrl);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(button)];
}

export interface ServerInfoEmbedOptions {
  serverName: string;
  serverIconUrl: string | null;
  inviteUrl: string | null;
  sessionStartedAt: Date | null;
}

export function buildServerInfoEmbed({
  serverName,
  serverIconUrl,
  inviteUrl,
  sessionStartedAt,
}: ServerInfoEmbedOptions): EmbedBuilder {
  const safeInviteUrl = normalizeDiscordInviteUrl(inviteUrl);
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`🏰 ${serverName}`)
    .setDescription(
      safeInviteUrl
        ? "Apasă butonul de mai jos pentru a intra pe server."
        : "Linkul de invitație nu este configurat sau nu este valid.",
    );

  if (serverIconUrl) embed.setThumbnail(serverIconUrl);

  const startedAtMs = sessionStartedAt?.getTime();
  const hasValidStart = typeof startedAtMs === "number" && Number.isFinite(startedAtMs);
  embed.addFields({
    name: "⏱️ Botul este online de",
    value: hasValidStart
      ? `<t:${Math.floor(startedAtMs / 1000)}:R>`
      : "Momentul conectării nu este disponibil.",
    inline: false,
  });

  return embed;
}