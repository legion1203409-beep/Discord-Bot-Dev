/**
 * Cum arată un server în lista „Alege serverul”: pictograma, inițialele de
 * rezervă, culoarea de rezervă și ordinea listei. Funcții pure, fără React.
 */
import type { ModerationGuild } from "../../../hooks/use-moderation-api";

/** Adresa pictogramei: un URL întreg rămâne cum e, un cod de la Discord devine adresa din CDN. */
export function guildIconUrl(guild: Pick<ModerationGuild, "id" | "icon">): string | null {
  if (!guild.icon) return null;
  if (/^https?:\/\//i.test(guild.icon)) return guild.icon;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

/**
 * Inițialele pentru serverele fără pictogramă: prima literă (sau cifră) din
 * primele două cuvinte. Fără litere deloc (de exemplu un nume doar din
 * emoji), se ia primul caracter, iar la un nume gol, „?”.
 */
export function guildInitials(name: string): string {
  const letters: string[] = [];
  for (const word of name.split(/\s+/)) {
    const first = word.match(/[\p{L}\p{N}]/u);
    if (first) letters.push(first[0].toUpperCase());
    if (letters.length === 2) break;
  }
  const initials = Array.from(letters.join("")).slice(0, 2).join("");
  if (initials) return initials;
  return Array.from(name.trim())[0] ?? "?";
}

export type AvatarTone = "g" | "r" | "n";

const TONES: readonly AvatarTone[] = ["g", "r", "n"];

/** Aurie, roșu sau gri, mereu aceeași pentru același server (după ID, nu după poziția în listă). */
export function guildTone(id: string): AvatarTone {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function isOfficialGuild(guild: Pick<ModerationGuild, "id">, officialGuildId: string | null | undefined): boolean {
  return Boolean(officialGuildId) && guild.id === officialGuildId;
}

/** Serverul oficial urcă primul; restul rămân în ordinea primită. */
export function orderGuilds(guilds: ModerationGuild[], officialGuildId: string | null | undefined): ModerationGuild[] {
  if (!officialGuildId) return guilds;
  const official = guilds.filter((guild) => guild.id === officialGuildId);
  if (official.length === 0) return guilds;
  return [...official, ...guilds.filter((guild) => guild.id !== officialGuildId)];
}
