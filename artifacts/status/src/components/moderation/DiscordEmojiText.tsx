type DiscordEmojiImage = {
  id: string;
  url: string;
};

const CUSTOM_EMOJI = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;

export function DiscordEmojiText({ children, emojis = [] }: { children: string; emojis?: DiscordEmojiImage[] }) {
  const byId = new Map(emojis.map((emoji) => [emoji.id, emoji]));
  const parts: Array<string | { id: string; name: string }> = [];
  let last = 0;
  for (const match of children.matchAll(CUSTOM_EMOJI)) {
    parts.push(children.slice(last, match.index));
    parts.push({ id: match[3], name: match[2] });
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(children.slice(last));
  return <>{parts.map((part, index) => typeof part === "string" ? part : (
    <img
      key={`${part.id}-${index}`}
      src={byId.get(part.id)?.url || `https://cdn.discordapp.com/emojis/${part.id}.png?size=32&quality=lossless`}
      alt={`:${part.name}:`}
      className="mx-0.5 inline-block h-[1.25em] w-[1.25em] object-contain align-text-bottom"
    />
  ))}</>;
}