const MAX_DELETED_MESSAGE_CHARS = 520;
const MAX_LOG_DESCRIPTION_CHARS = 900;

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
  options: { deletedContent?: string; deletionFailed?: boolean } = {},
): string {
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