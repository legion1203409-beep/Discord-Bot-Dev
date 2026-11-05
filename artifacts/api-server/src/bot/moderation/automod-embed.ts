/**
 * Mesajul de jurnal pentru ce oprește AutoMod, Anti-Scam și moderarea AI:
 * cine, unde, ce s-a făcut și mesajul postat, cu poza lui când e una.
 * Înainte, tot textul stătea într-un singur câmp tăiat la 1.024 de caractere,
 * deci mesajul postat se pierdea tocmai când era lung.
 */
import { EmbedBuilder, type AttachmentBuilder, type Guild } from "discord.js";
import type { Detection } from "./detectors";
import { describeAttachment, fetchLogImage, isDiscordCdnUrl, type AttachmentInfo } from "./log-media";

const KIND_STYLE: Record<string, { emoji: string; title: string; color: number }> = {
  scam: { emoji: "🚨", title: "Scam oprit", color: 0xd94a2b },
  word: { emoji: "🤬", title: "Cuvânt interzis", color: 0xc38b3b },
  link: { emoji: "🔗", title: "Link interzis", color: 0xc38b3b },
  caps: { emoji: "🔠", title: "Prea multe majuscule", color: 0xc38b3b },
  emoji: { emoji: "😀", title: "Prea multe emoji-uri", color: 0xc38b3b },
  repeat: { emoji: "🔁", title: "Mesaj repetat", color: 0xc38b3b },
  ai: { emoji: "🤖", title: "Semnalare AI", color: 0x8f5bff },
};

export type AutomodEmbedInput = {
  guild: Guild;
  kind: Detection["kind"] | "ai";
  /** Why it was flagged. */
  detail: string;
  userId: string;
  channelId: string;
  actionSummary: string;
  deletionFailed?: boolean;
  messageContent: string;
  attachments: AttachmentInfo[];
  extractedText?: string;
  source: string;
  /** For the AI log: the category and confidence. */
  category?: string;
};

/** A quote block that cannot ping anyone or break out of the embed. */
export function quoteBlock(value: string, max = 1_000): string {
  const cleaned = value.replace(/\r\n?/g, "\n").replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "�").replace(/@/g, "@​").trim();
  if (!cleaned) return "_(fără text)_";
  const lines = cleaned.split("\n").map((line) => `> ${line}`).join("\n");
  return lines.length <= max ? lines : `${lines.slice(0, max - 20).trimEnd()}\n_(text trunchiat)_`;
}

export async function buildAutomodEmbed(input: AutomodEmbedInput): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
  const style = KIND_STYLE[input.kind] ?? { emoji: "🛡️", title: "Mesaj oprit", color: 0xc38b3b };
  const member = input.guild.members.cache.get(input.userId);
  const embed = new EmbedBuilder()
    .setColor(style.color)
    .setAuthor({ name: member?.displayName ?? member?.user.username ?? "Membru", ...(member ? { iconURL: member.displayAvatarURL() } : {}) })
    .setTitle(`${style.emoji} ${style.title}`)
    .setDescription(input.detail.slice(0, 400))
    .addFields(
      { name: "Membru", value: `<@${input.userId}>\n\`${input.userId}\``, inline: true },
      { name: "Canal", value: `<#${input.channelId}>`, inline: true },
      { name: input.deletionFailed ? "⚠️ Acțiune" : "Acțiune", value: (input.deletionFailed ? "Mesajul nu a putut fi șters. " : "") + input.actionSummary.slice(0, 200), inline: true },
      { name: "💬 Mesajul postat", value: quoteBlock(input.messageContent) },
    )
    .setFooter({ text: `${input.source}${input.category ? ` · ${input.category}` : ""} · ${input.guild.name}` })
    .setTimestamp();
  if (member) embed.setThumbnail(member.displayAvatarURL());

  const shown = input.attachments.slice(0, 5);
  if (shown.length) {
    embed.addFields({ name: `📎 Atașamente (${input.attachments.length})`, value: shown.map((item, index) => `${index + 1}. ${describeAttachment(item)}`).join("\n").slice(0, 1_024) });
  }
  if (input.extractedText?.trim()) {
    embed.addFields({ name: "🔎 Text găsit în imagine", value: quoteBlock(input.extractedText, 700) });
  }

  // The first picture goes in the log itself: kept as a file when it can be taken, otherwise shown from its link.
  const files: AttachmentBuilder[] = [];
  const picture = input.attachments.find((item) => isDiscordCdnUrl(item.url) && (/^image\//i.test(item.contentType ?? "") || /\.(?:png|jpe?g|gif|webp)$/i.test(item.name)));
  if (picture?.url) {
    const file = await fetchLogImage(picture.url, "mesaj");
    if (file) {
      files.push(file);
      embed.setImage(`attachment://${file.name}`);
    } else {
      embed.setImage(picture.url);
    }
  }
  return { embed, files };
}
