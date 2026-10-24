export type TranslationEligibilityInput = {
  guildId: string | null;
  channelId: string;
  configuredChannelId: string | null;
  content: string;
  authorIsBot: boolean;
  isWebhook: boolean;
  hasMessageContentIntent: boolean;
};

export function shouldTranslateMessage(input: TranslationEligibilityInput): boolean {
  return Boolean(
    input.guildId &&
      input.hasMessageContentIntent &&
      input.configuredChannelId &&
      input.channelId === input.configuredChannelId &&
      input.content.trim() &&
      !input.authorIsBot &&
      !input.isWebhook,
  );
}

export function splitTranslationText(text: string, maxLength = 1_850): string[] {
  const remainingText = text.trim();
  if (!remainingText) return [];
  if (remainingText.length <= maxLength) return [remainingText];

  const chunks: string[] = [];
  let remaining = remainingText;
  while (remaining.length > maxLength) {
    let boundary = remaining.lastIndexOf("\n", maxLength);
    if (boundary < Math.floor(maxLength / 2)) boundary = remaining.lastIndexOf(" ", maxLength);
    if (boundary < Math.floor(maxLength / 2)) boundary = maxLength;
    chunks.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
