/**
 * Poze și fișiere în jurnale. Un mesaj șters își pierde pozele după un timp,
 * așa că botul le ia o dată și le pune chiar în jurnal (ca atașament), ca staff-ul
 * să le poată vedea și mai târziu. Dacă descărcarea nu merge, jurnalul folosește linkul.
 */
import { AttachmentBuilder } from "discord.js";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const IMAGE_TYPES = /^image\/(?:png|jpe?g|gif|webp)$/i;

/** Only Discord's own CDN: the bot never fetches an address a member chose. */
export function isDiscordCdnUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** The image as a file to attach to the log, or null when it cannot be taken (offline, too big, not an image). */
export async function fetchLogImage(url: string, fileName = "poza"): Promise<AttachmentBuilder | null> {
  // Tests and offline runs never reach the network.
  if (process.env.NODE_ENV === "test" || !isDiscordCdnUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!IMAGE_TYPES.test(type)) return null;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > MAX_IMAGE_BYTES) return null;
    const extension = type.includes("png") ? "png" : type.includes("gif") ? "gif" : type.includes("webp") ? "webp" : "jpg";
    const safeName = fileName.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "poza";
    return new AttachmentBuilder(data, { name: `${safeName}.${extension}` });
  } catch {
    return null;
  }
}

export type AttachmentInfo = { name: string; url?: string; size?: number | null; contentType?: string | null };

const KINDS: Array<[RegExp, string, string]> = [
  [/^image\//i, "🖼️", "imagine"],
  [/^video\//i, "🎞️", "video"],
  [/^audio\//i, "🎵", "audio"],
  [/^text\/|pdf|word|excel|sheet|document/i, "📄", "document"],
  [/zip|rar|7z|tar|gzip/i, "🗜️", "arhivă"],
];

export function formatBytes(size: number | null | undefined): string {
  if (!size || size < 0) return "";
  if (size < 1_024) return `${size} B`;
  if (size < 1_024 * 1_024) return `${(size / 1_024).toFixed(0)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

/** "🖼️ poza.png · imagine · 240 KB", linked when the address is Discord's. */
export function describeAttachment(info: AttachmentInfo): string {
  const kind = KINDS.find(([pattern]) => pattern.test(info.contentType ?? "") || pattern.test(info.name));
  const name = info.name.replace(/[\[\]()`*_~|>]/g, "").slice(0, 80) || "fișier";
  const label = info.url && isDiscordCdnUrl(info.url) ? `[${name}](${info.url})` : `\`${name}\``;
  return [`${kind?.[1] ?? "📎"} ${label}`, kind?.[2] ?? "fișier", formatBytes(info.size)].filter(Boolean).join(" · ");
}
