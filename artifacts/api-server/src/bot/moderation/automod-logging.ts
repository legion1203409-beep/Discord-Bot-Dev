const MAX_DELETED_MESSAGE_CHARS = 520;
const MAX_LOG_DESCRIPTION_CHARS = 900;
const MAX_DETAILED_LOG_CHARS = 3_500;

function truncateUtf16(value: string, maxLength: number): { text: string; truncated: boolean } {
  let text = "";
  for (const character of value) {
    if (text.length + character.length > maxLength) break;
    text += character;
  }
  return { text, truncated: text.length < value.length };
}

export function buildAutomaticModerationLogDescription(
  title: string,
  detail: string,
  userId: string,
  channelId: string,
  options: {
    deletedContent?: string;
    deletionFailed?: boolean;
    detailed?: boolean;
    source?: string;
    category?: string;
    messageContent?: string;
    attachments?: Array<{ name: string; url: string }>;
    extractedText?: string;
    actionSummary?: string;
  } = {},
): string {
  if (options.detailed) {
    const safe = (value: string, limit: number) => truncateUtf16(
      value.replace(/\r\n?/g, "\n").replace(/\u0000/g, "")
        .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "�")
        .replace(/`/g, "ˋ").replace(/@/g, "@\u200b").trim(),
      limit,
    );
    const lines = [
      `**Sursă:** ${options.source ?? title}`,
      `**Detectare:** ${safe(detail, 350).text}`,
      ...(options.category ? [`**Categorie AI:** ${safe(options.category, 100).text}`] : []),
      `**Utilizator:** <@${userId}>`,
      `**Canal:** <#${channelId}>`,
      `**Acțiune:** ${options.actionSummary ?? (options.deletionFailed ? "Mesajul nu a putut fi șters" : options.deletedContent !== undefined ? "Mesaj șters" : "Detecție înregistrată")}`,
    ];
    const content = options.messageContent ?? options.deletedContent;
    if (content !== undefined) {
      const excerpt = safe(content, 1_400);
      lines.push(`**Mesaj detectat:**\n${excerpt.text || "_(fără text)_"}${excerpt.truncated ? "\n_(text trunchiat)_ " : ""}`);
    }
    const attachments = (options.attachments ?? []).slice(0, 5)
      .filter((attachment) => /^https?:\/\//i.test(attachment.url))
      .map((attachment, index) => `${index + 1}. [${safe(attachment.name || "Atașament", 100).text}](${attachment.url})`);
    if (attachments.length) lines.push(`**Atașamente:**\n${attachments.join("\n")}`);
    if (options.extractedText) {
      const excerpt = safe(options.extractedText, 700);
      lines.push(`**Text detectat în imagine:**\n${excerpt.text}${excerpt.truncated ? "\n_(text trunchiat)_" : ""}`);
    }
    const output = lines.join("\n");
    return output.length <= MAX_DETAILED_LOG_CHARS
      ? output
      : `${truncateUtf16(output, MAX_DETAILED_LOG_CHARS - 20).text}\n_(log trunchiat)_`;
  }

  const identity = ` • Utilizator: <@${userId}> • Canal: <#${channelId}>`;
  const includeDeletionInfo = options.deletedContent !== undefined || options.deletionFailed;
  if (!includeDeletionInfo) return `${detail}${identity}`;

  const shortenedDetail = truncateUtf16(detail, 240);
  const header = `${shortenedDetail.text}${shortenedDetail.truncated ? "…" : ""}${identity}`;
  if (options.deletionFailed) {
    return `${header}\n\n⚠️ Mesajul nu a putut fi șters de ${title}.`;
  }

  const safeContent = (options.deletedContent ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "�")
    .replace(/`/g, "ˋ")
    .replace(/@/g, "@\u200b")
    .trim();
  const contentBudget = Math.max(
    0,
    Math.min(MAX_DELETED_MESSAGE_CHARS, MAX_LOG_DESCRIPTION_CHARS - header.length - 80),
  );
  const excerpt = truncateUtf16(safeContent, contentBudget);
  const message = excerpt.text || "(fără conținut textual)";
  const truncationNote = excerpt.truncated ? "\n… (trunchiat)" : "";

  return `${header}\n\n**Mesaj șters de ${title}:**\n\`\`\`\n${message}${truncationNote}\n\`\`\``;
}