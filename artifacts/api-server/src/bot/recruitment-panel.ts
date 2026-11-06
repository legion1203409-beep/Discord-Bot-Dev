/**
 * Panoul de recrutare: un mesaj al botului, într-un canal ales pe site, cu un
 * buton „Generează invitația mea”. Butonul face exact ce face /invita: o
 * invitație personală, arătată doar celui care a apăsat.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type TextChannel,
} from "discord.js";
import { loadRecruitmentPanelSetting, saveRecruitmentPanelSetting, type InviteRecruitmentConfig } from "./db";

export const RECRUITMENT_PANEL_BUTTON_ID = "recrutare_invita";

export interface RecruitmentPanelConfig {
  channelId: string;
  title: string;
  description: string;
  buttonLabel: string;
  color: string;
  imageUrl: string;
  messageId: string;
}

export const DEFAULT_RECRUITMENT_PANEL: RecruitmentPanelConfig = {
  channelId: "",
  title: "🔗 Adu-ți prietenii în regat",
  description: "Apasă butonul de mai jos și botul îți face o **invitație personală**. Doar tu o vezi.\nTrimite-o prietenilor: pentru fiecare care intră și se verifică primești puncte de recrutare și, la praguri, roluri.",
  buttonLabel: "Generează invitația mea",
  color: "#e2b467",
  imageUrl: "",
  messageId: "",
};

export const RECRUITMENT_PANEL_LIMITS = { title: 256, description: 2_000, buttonLabel: 80 } as const;

const text = (value: unknown, fallback: string, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

export function normalizeRecruitmentPanel(value: unknown): RecruitmentPanelConfig {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = (raw: unknown) => (typeof raw === "string" && /^\d{5,25}$/.test(raw.trim()) ? raw.trim() : "");
  const image = typeof input.imageUrl === "string" && /^https:\/\/\S+$/i.test(input.imageUrl.trim()) ? input.imageUrl.trim() : "";
  return {
    channelId: id(input.channelId),
    title: text(input.title, DEFAULT_RECRUITMENT_PANEL.title, RECRUITMENT_PANEL_LIMITS.title),
    description: text(input.description, DEFAULT_RECRUITMENT_PANEL.description, RECRUITMENT_PANEL_LIMITS.description),
    buttonLabel: text(input.buttonLabel, DEFAULT_RECRUITMENT_PANEL.buttonLabel, RECRUITMENT_PANEL_LIMITS.buttonLabel),
    color: typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : DEFAULT_RECRUITMENT_PANEL.color,
    imageUrl: image,
    messageId: id(input.messageId),
  };
}

export async function loadRecruitmentPanel(guildId: string): Promise<RecruitmentPanelConfig> {
  return normalizeRecruitmentPanel(await loadRecruitmentPanelSetting(guildId));
}

export async function saveRecruitmentPanel(guildId: string, value: unknown): Promise<RecruitmentPanelConfig> {
  const config = normalizeRecruitmentPanel(value);
  await saveRecruitmentPanelSetting(guildId, config);
  return config;
}

/** The rules under the text, taken from the recruitment settings so they are always true. */
export function recruitmentRulesLine(recruitment: Pick<InviteRecruitmentConfig, "maxAgeDays" | "maxUses" | "dailyInviteLimit" | "rewardPoints">): string {
  return [
    `⏳ ține ${recruitment.maxAgeDays} ${recruitment.maxAgeDays === 1 ? "zi" : "zile"}`,
    `👥 până la ${recruitment.maxUses} ${recruitment.maxUses === 1 ? "membru" : "membri"}`,
    `🎟️ ${recruitment.dailyInviteLimit} pe zi`,
    `⭐ ${recruitment.rewardPoints} puncte pe fiecare verificat`,
  ].join(" · ");
}

export function buildRecruitmentPanel(config: RecruitmentPanelConfig, recruitment: InviteRecruitmentConfig) {
  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.color.slice(1), 16))
    .setTitle(config.title)
    .setDescription(config.description)
    .addFields({ name: "Cum merge invitația", value: recruitmentRulesLine(recruitment) });
  const milestones = recruitment.milestones.filter((milestone) => milestone.roleId);
  if (milestones.length) {
    embed.addFields({
      name: "🏅 Roluri de recrutor",
      value: milestones.map((milestone) => `**${milestone.requiredInvites}** ${milestone.requiredInvites === 1 ? "membru verificat" : "membri verificați"} → <@&${milestone.roleId}>`).join("\n"),
    });
  }
  if (config.imageUrl) embed.setImage(config.imageUrl);
  embed.setFooter({ text: "Invitația e doar a ta · vezi cine a adus cei mai mulți cu /topinvitatii" });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(RECRUITMENT_PANEL_BUTTON_ID).setStyle(ButtonStyle.Success).setEmoji("🔗").setLabel(config.buttonLabel.slice(0, 80)),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] as never[] } };
}

export type PublishRecruitmentResult = { ok: true; config: RecruitmentPanelConfig; edited: boolean } | { ok: false; error: string };

/** Edits the panel already in the channel, or posts a new one; remembers the message. */
export async function publishRecruitmentPanel(client: Client, guildId: string, recruitment: InviteRecruitmentConfig): Promise<PublishRecruitmentResult> {
  const config = await loadRecruitmentPanel(guildId);
  if (!recruitment.enabled) return { ok: false, error: "Pornește întâi programul de recrutare." };
  if (!config.channelId) return { ok: false, error: "Alege canalul în care apare panoul." };
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(config.channelId).catch(() => null) : null;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return { ok: false, error: "Canalul panoului nu mai există sau nu e un canal de text." };
  const me = guild!.members.me ?? await guild!.members.fetchMe().catch(() => null);
  const perms = me ? (channel as TextChannel).permissionsFor(me) : null;
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return { ok: false, error: "Botul nu poate scrie în canalul ales (îi trebuie View Channel, Send Messages și Embed Links)." };
  }
  const payload = buildRecruitmentPanel(config, recruitment);
  const text = channel as TextChannel;
  if (config.messageId) {
    const existing = await text.messages.fetch(config.messageId).catch(() => null);
    if (existing && existing.author.id === client.user?.id) {
      await existing.edit(payload);
      return { ok: true, config, edited: true };
    }
  }
  const sent = await text.send(payload);
  const saved = await saveRecruitmentPanel(guildId, { ...config, messageId: sent.id });
  return { ok: true, config: saved, edited: false };
}
