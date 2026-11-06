/**
 * Anti-scam, partea a doua: ce nu se vede din cuvinte.
 *  1. Linkuri false: domenii care imită Discord, Steam, Roblox sau Epic
 *     („dlscord-nitro.com”, „steamcommunlty.ru”, „discord.com.verifica.xyz”).
 *  2. Fișiere periculoase atașate (.exe, .scr, .bat, „poza.png.exe”).
 *  3. Același mesaj cu link pus în mai multe canale într-un timp scurt, semn
 *     tipic de cont spart sau de bot de spam.
 * Fiecare se pornește separat, sub Anti-Scam (autoMod.scamFilter).
 */
import type { Detection } from "./detectors";

/** Real domains of the brands scammers copy. A host equal to one, or a subdomain of one, is never flagged. */
const BRANDS: Record<string, readonly string[]> = {
  discord: ["discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.gift", "discord.new", "discord.media", "discordstatus.com", "discord.co", "dis.gd", "discord.design", "discordcdn.com"],
  steam: ["steampowered.com", "steamcommunity.com", "steamstatic.com", "steamgames.com", "steam.com"],
  roblox: ["roblox.com", "rbxcdn.com", "roblox.com.br"],
  epic: ["epicgames.com"],
};

/** Well-known sites that merely contain a brand name. */
const KNOWN_SAFE = ["discord.js.org", "discordjs.dev", "discordjs.guide", "discordbotlist.com", "discord.id", "discordlist.gg", "disboard.org", "top.gg", "discordservers.com", "discord.me", "discordstatus.com", "steamdb.info", "steamgifts.com"];

const BAIT_WORDS = ["nitro", "gift", "free", "claim", "airdrop", "giveaway", "promo", "drop", "event", "trade", "verify", "verif", "login", "auth", "support", "bonus", "reward", "prize", "premium", "boost", "case", "skin", "robux", "vbucks", "wallet"];
const TWO_PART_SUFFIXES = new Set(["co.uk", "com.br", "com.au", "co.jp", "com.ro", "org.uk", "co.in"]);

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/** Letters a scammer swaps for look-alikes (l for i, 0 for o). */
function deLeet(value: string): string {
  return value.replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/rn/g, "m");
}

/** "www.sub.example.co.uk" → { name: "example", registrable: "example.co.uk" }. */
function splitHost(host: string): { name: string; registrable: string } | null {
  const labels = host.replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  const take = TWO_PART_SUFFIXES.has(lastTwo) && labels.length >= 3 ? 3 : 2;
  const registrableLabels = labels.slice(-take);
  return { name: registrableLabels[0]!, registrable: registrableLabels.join(".") };
}

export function extractUrls(content: string): URL[] {
  const found = content.match(/(?:https?:\/\/|www\.)[^\s<>()\]]+/gi) ?? [];
  // Bare "discord-nitro.xyz/claim" without a scheme is common in scam messages.
  const bare = content.match(/(?:^|[\s<(])((?:[a-z0-9-]+\.)+[a-z]{2,24}\/[^\s<>()]*)/gi)?.map((value) => value.trim().replace(/^[<(]/, "")) ?? [];
  const urls: URL[] = [];
  for (const raw of [...found, ...bare]) {
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (["http:", "https:"].includes(url.protocol)) urls.push(url);
    } catch { /* not a link */ }
  }
  return urls;
}

/** Why a link looks like a copy of a known brand, or null when it looks fine. */
export function phishingReason(url: URL, trustedHosts: readonly string[] = []): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (trustedHosts.some((trusted) => hostMatches(host, trusted.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")))) return null;
  if (KNOWN_SAFE.some((safe) => hostMatches(host, safe))) return null;
  for (const domains of Object.values(BRANDS)) if (domains.some((domain) => hostMatches(host, domain))) return null;

  const split = splitHost(host);
  if (!split) return null;
  const readable = deLeet(split.name.replace(/-/g, ""));

  for (const [brand, domains] of Object.entries(BRANDS)) {
    // "discord.com.verifica.xyz": a real domain placed in front of another one.
    const embedded = domains.find((domain) => host.includes(domain));
    if (embedded) return `Domeniu fals care pune „${embedded}” în fața altui domeniu (${split.registrable})`;
    // Same name, other ending: "discord.xyz", "steampowered.ru".
    const officialNames = domains.map((domain) => splitHost(domain)?.name).filter(Boolean) as string[];
    if (officialNames.includes(split.name)) return `Imită ${brand}: același nume pe alt domeniu (${split.registrable})`;
    // A letter changed: "dlscord", "discorcl", "disc0rd", "steamcommunlty".
    const variants = [readable, readable.replace(/cl/g, "d"), readable.replace(/vv/g, "w")];
    for (const name of officialNames) {
      if (name.length >= 6 && !variants.includes(name) && variants.some((variant) => levenshtein(variant, name) <= (name.length >= 9 ? 2 : 1))) {
        return `Imită ${brand}: ${split.registrable} seamănă cu ${name}`;
      }
      if (name.length >= 6 && variants.includes(name)) return `Imită ${brand}: ${split.registrable} e scris cu litere schimbate`;
    }
    // Brand plus bait: "discord-nitro.com", "steam-gift.ru", "robloxfree.xyz".
    const brandInName = readable.includes(brand);
    const bait = BAIT_WORDS.find((word) => readable.includes(word));
    if (brandInName && bait) return `Imită ${brand}: „${brand}” + „${bait}” într-un domeniu străin (${split.registrable})`;
  }
  return null;
}

export function detectPhishingLink(content: string, trustedHosts: readonly string[] = []): Detection | null {
  for (const url of extractUrls(content)) {
    const reason = phishingReason(url, trustedHosts);
    if (reason) return { kind: "scam", detail: `Link fals: ${reason}` };
  }
  return null;
}

const DANGEROUS_EXTENSIONS = new Set(["exe", "scr", "bat", "cmd", "com", "msi", "pif", "vbs", "vbe", "js", "jse", "wsf", "ps1", "lnk", "jar", "hta", "reg", "dll", "apk"]);
const HARMLESS_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "doc", "docx", "mp4", "mp3", "zip", "rar", "mov", "xls", "xlsx"]);

/** The attached file names that can run code on a computer, with the reason. */
export function dangerousAttachmentReason(fileName: string): string | null {
  const parts = fileName.toLowerCase().trim().split(".");
  if (parts.length < 2) return null;
  const extension = parts.at(-1)!;
  if (!DANGEROUS_EXTENSIONS.has(extension)) return null;
  const before = parts.at(-2)!;
  return HARMLESS_EXTENSIONS.has(before)
    ? `fișier cu dublă extensie (${before}.${extension}), care se dă drept ${before}`
    : `fișier executabil (.${extension})`;
}

export function detectDangerousAttachment(fileNames: readonly string[]): Detection | null {
  for (const name of fileNames) {
    const reason = dangerousAttachmentReason(name);
    if (reason) return { kind: "scam", detail: `Atașament periculos: ${reason} — „${name.slice(0, 80)}”` };
  }
  return null;
}

export type FloodSettings = { channels: number; windowSeconds: number };
export type FloodHit = { channelId: string; messageId: string };

/**
 * Remembers recent messages with links (or @everyone) per member and says when
 * the same text shows up in several channels within the window. Memory only:
 * it forgets on restart, which is fine for a window of a minute.
 */
export class CrossChannelFloodTracker {
  private readonly recent = new Map<string, Array<{ at: number; channelId: string; messageId: string; fingerprint: string }>>();

  static fingerprint(content: string): string | null {
    const text = content.toLowerCase().replace(/\s+/g, " ").trim();
    if (text.length < 8) return null;
    return /(?:https?:\/\/|www\.|@everyone|@here|discord\.gg\/)/.test(text) ? text.slice(0, 400) : null;
  }

  /** Records a message; returns the earlier copies in other channels when this one completes a flood. */
  record(key: string, message: FloodHit & { content: string }, settings: FloodSettings, now = Date.now()): FloodHit[] | null {
    const fingerprint = CrossChannelFloodTracker.fingerprint(message.content);
    if (!fingerprint) return null;
    const windowMs = settings.windowSeconds * 1_000;
    const kept = (this.recent.get(key) ?? []).filter((item) => now - item.at <= windowMs);
    kept.push({ at: now, channelId: message.channelId, messageId: message.messageId, fingerprint });
    this.recent.set(key, kept);
    if (this.recent.size > 5_000) for (const [other, list] of this.recent) if (!list.some((item) => now - item.at <= windowMs)) this.recent.delete(other);
    const same = kept.filter((item) => item.fingerprint === fingerprint);
    const channels = new Set(same.map((item) => item.channelId));
    if (channels.size < settings.channels) return null;
    return same.filter((item) => item.messageId !== message.messageId).map(({ channelId, messageId }) => ({ channelId, messageId }));
  }
}

export function floodDetection(channelCount: number, windowSeconds: number): Detection {
  return { kind: "scam", detail: `Același mesaj cu link în ${channelCount} canale în ${windowSeconds} s (cont posibil spart sau bot)`, count: channelCount };
}
