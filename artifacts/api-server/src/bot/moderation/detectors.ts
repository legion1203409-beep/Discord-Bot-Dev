export type DetectorKind =
  | "word"
  | "ai"
  | "link"
  | "caps"
  | "emoji"
  | "repeat"
  | "length"
  | "characters"
  | "symbols"
  | "mentions"
  | "messageSpam"
  | "editSpam"
  | "deleteSpam"
  | "joinRaid"
  | "newAccount"
  | "scam";

export type Detection = {
  kind: DetectorKind;
  detail: string;
  count?: number;
};

export type ContentThresholds = {
  capsPercent?: number;
  emoji?: number;
  repeat?: number;
  maxLength?: number;
  maxCharacterRun?: number;
  maxSymbolRun?: number;
  mentions?: number;
};

export type RateThresholds = {
  limit: number;
  windowMs: number;
};

export function normalizeModerationText(value: string): string {
  return value
    .toLocaleLowerCase("ro-RO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsBlockedWord(content: string, words: readonly string[]): string | null {
  const normalized = normalizeModerationText(content);
  for (const raw of words) {
    const word = normalizeModerationText(raw);
    if (!word || word.length > 100) continue;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(word)}(?=$|[^\\p{L}\\p{N}])`, "u");
    if (pattern.test(normalized)) return raw.trim();
  }
  return null;
}

function normalizeScamText(value: string): string {
  return normalizeModerationText(value).replace(/[\u200B-\u200F\u2060\uFEFF]/g, "");
}

export function detectScamContent(content: string, configuredPhrases: readonly string[] = []): Detection | null {
  const normalized = normalizeScamText(content);
  if (!normalized) return null;

  const configuredPhrase = containsBlockedWord(normalized, configuredPhrases);
  if (configuredPhrase) {
    return { kind: "scam", detail: `Expresie anti-scam configurată: ${configuredPhrase}` };
  }

  const winningClaim = /\b(?:(?:you|i|we)(?:'ve)?\s+(?:(?:have|has)\s+)?(?:just\s+)?won|just\s+won|won|winner|winning|(?:ai|am|a|ati)\s+(?:tocmai\s+)?castig(?:at|ata|ate|ati|ator|atoare)?|castigator(?:i|e)?|castiguri)\b/u;
  const moneyAmount = /(?:[$€£]\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:de\s*)?(?:usd|dollars?|dola(?:r|ri)|eur|euros?|ron|lei|btc|bitcoin|eth|ethereum|usdt|sol)\b|\b(?:usd|dollars?|dola(?:r|ri)|eur|euros?|ron|lei|btc|bitcoin|eth|ethereum|usdt|sol)\s*\d[\d.,]*\b)/u;
  if (winningClaim.test(normalized) && moneyAmount.test(normalized)) {
    return { kind: "scam", detail: "Afirmație despre câștig în bani sau criptomonede" };
  }

  const highRiskOffer = /\b(?:claim(?: your)? (?:free )?(?:prize|reward|bonus)|free (?:money|crypto|bitcoin|btc|ethereum|eth|usd|usdt)|(?:verify|connect) (?:your )?wallet|wallet (?:verification|verify)|(?:crypto|bitcoin|btc|ethereum|eth|usdt) (?:airdrop|giveaway)|double your (?:money|crypto|bitcoin|btc)|you(?:'ve)? been selected (?:for|to win))\b/u;
  if (highRiskOffer.test(normalized)) {
    return { kind: "scam", detail: "Promisiune suspectă de recompensă sau verificare de portofel" };
  }

  return null;
}

/** A stricter combination for noisy OCR from image-only crypto giveaway ads. */
export function detectScamImageText(content: string, configuredPhrases: readonly string[] = []): Detection | null {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const directFinding = detectScamContent(`${lines[i]} ${lines[i + 1] ?? ""}`, configuredPhrases);
    if (directFinding) return directFinding;
  }
  const normalized = normalizeScamText(content);
  const promotional = /\b(?:bonus(?:es)?|promo(?:tional)?|giveaway|reward)\b/u.test(normalized);
  const claimedPayout = lines.some((line) => /\bwithdraw(?:al|ial)?\b.{0,80}\bsuccess(?:ful(?:ly)?)?\b/u.test(normalizeScamText(line)));
  const valueOrImpersonation = /(?:[$€£]\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:usd|eur|usdt|btc|eth)\b|\bmr\s*beast\b)/u.test(normalized);
  const callToAction = /\b(?:activate|claim|redeem|use\s+(?:the\s+)?code|enter\s+(?:the\s+)?code)\b/u.test(normalized);
  if (promotional && claimedPayout && valueOrImpersonation && callToAction) {
    return { kind: "scam", detail: "Imagine cu promoție și dovadă suspectă de retragere" };
  }
  return null;
}

export type ForbiddenLinkCategories = Partial<Record<"discordInvite" | "social" | "video" | "shortener" | "all", boolean>>;

const socialHosts = ["facebook.com", "fb.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "threads.net", "reddit.com", "bsky.app"];
const videoHosts = ["youtube.com", "youtu.be", "twitch.tv", "kick.com"];
const shortenerHosts = ["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "is.gd", "shorturl.at"];
const matchesHost = (hostname: string, domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);

export function findBlockedLink(content: string, blockedLinks: readonly string[], categories: ForbiddenLinkCategories = {}): string | null {
  const urls: string[] = content.match(/(?:https?:\/\/|www\.)[^\s<>()]+/gi) ?? [];
  // Discord invites are often pasted without a scheme or www.
  if (categories.discordInvite || categories.all) {
    const bareInvites = content.matchAll(/(?:^|[\s<(])((?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[^\s<>()]+)/gi);
    for (const match of bareInvites) urls.push(match[1]);
  }
  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) continue;
    const hostname = parsed.hostname.toLowerCase();
    for (const configured of blockedLinks) {
      const normalized = configured.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!normalized) continue;
      if (matchesHost(hostname, normalized)) return configured.trim();
    }
    if (categories.all) return "Categoria: toate linkurile";
    if (categories.discordInvite && (
      (matchesHost(hostname, "discord.gg") && /^\/[^/]+/.test(parsed.pathname))
      || (["discord.com", "discordapp.com"].some((host) => matchesHost(hostname, host)) && /^\/invite\/[^/]+/i.test(parsed.pathname))
    )) return "Categoria: invitații Discord";
    if (categories.social && socialHosts.some((host) => matchesHost(hostname, host))) return "Categoria: rețele sociale";
    if (categories.video && videoHosts.some((host) => matchesHost(hostname, host))) return "Categoria: video și streaming";
    if (categories.shortener && shortenerHosts.some((host) => matchesHost(hostname, host))) return "Categoria: linkuri scurtate";
  }
  return null;
}

export function countEmoji(content: string): number {
  const unicodeEmoji = content.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
  const customEmoji = content.match(/<a?:[A-Za-z0-9_~]+:\d+>/g)?.length ?? 0;
  return unicodeEmoji + customEmoji;
}

export function capsPercent(content: string): number {
  const letters: string[] = content.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const upper = letters.filter((char) => char === char.toLocaleUpperCase("ro-RO")).length;
  return Math.round((upper / letters.length) * 100);
}

export function longestRepeatedRun(content: string): number {
  let longest = 0;
  let current = 0;
  let previous = "";
  for (const char of Array.from(normalizeModerationText(content))) {
    if (char === previous) current += 1;
    else {
      previous = char;
      current = 1;
    }
    longest = Math.max(longest, current);
  }
  return longest;
}

export function longestSymbolRun(content: string): number {
  let longest = 0;
  let current = 0;
  for (const char of Array.from(content)) {
    if (/[\p{P}\p{S}]/u.test(char)) current += 1;
    else current = 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function countMentions(content: string): number {
  return (content.match(/<@!?\d+>|<@&\d+>|@everyone|@here/g) ?? []).length;
}

export function detectContent(
  content: string,
  options: {
    blockedWords?: readonly string[];
    blockedLinks?: readonly string[];
    blockedLinkCategories?: ForbiddenLinkCategories;
    thresholds?: ContentThresholds;
  },
): Detection[] {
  const results: Detection[] = [];
  const thresholds = options.thresholds ?? {};
  const word = containsBlockedWord(content, options.blockedWords ?? []);
  if (word) results.push({ kind: "word", detail: `Cuvânt filtrat: ${word}` });
  const link = findBlockedLink(content, options.blockedLinks ?? [], options.blockedLinkCategories);
  if (link) results.push({ kind: "link", detail: `Link blocat: ${link}` });

  const emoji = countEmoji(content);
  if (thresholds.emoji !== undefined && emoji > thresholds.emoji) results.push({ kind: "emoji", detail: "Prea multe emoji", count: emoji });
  const caps = capsPercent(content);
  if (thresholds.capsPercent !== undefined && caps >= thresholds.capsPercent) results.push({ kind: "caps", detail: "Prea multe majuscule", count: caps });
  const repeated = longestRepeatedRun(content);
  if (thresholds.repeat !== undefined && repeated >= thresholds.repeat) results.push({ kind: "repeat", detail: "Caractere repetate", count: repeated });
  if (thresholds.maxLength !== undefined && content.length > thresholds.maxLength) results.push({ kind: "length", detail: "Mesaj prea lung", count: content.length });
  if (thresholds.maxCharacterRun !== undefined && repeated >= thresholds.maxCharacterRun) results.push({ kind: "characters", detail: "Flood de caractere", count: repeated });
  const symbols = longestSymbolRun(content);
  if (thresholds.maxSymbolRun !== undefined && symbols >= thresholds.maxSymbolRun) results.push({ kind: "symbols", detail: "Flood de simboluri", count: symbols });
  const mentions = countMentions(content);
  if (thresholds.mentions !== undefined && mentions > thresholds.mentions) results.push({ kind: "mentions", detail: "Prea multe mențiuni", count: mentions });
  return results;
}

/** A bounded, guild-isolated fixed-window counter for message/event burst rules. */
export class SlidingRateLimiter {
  private readonly samples = new Map<string, number[]>();

  hit(key: string, thresholds: RateThresholds, now = Date.now()): { count: number; exceeded: boolean } {
    const cutoff = now - Math.max(1, thresholds.windowMs);
    const kept = (this.samples.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    kept.push(now);
    this.samples.set(key, kept);
    return { count: kept.length, exceeded: kept.length > Math.max(0, thresholds.limit) };
  }

  clear(key: string): void {
    this.samples.delete(key);
  }
}

/** Counts distinct messages, not repeated processing of the same message after an edit. */
export class SlidingUniqueMessageRateLimiter {
  private readonly samples = new Map<string, Array<{ id: string; at: number }>>();

  hit(key: string, messageId: string, threshold: number, windowMs: number, now = Date.now()): { count: number; reached: boolean } {
    const kept = (this.samples.get(key) ?? []).filter((sample) => sample.at > now - Math.max(1, windowMs));
    if (!kept.some((sample) => sample.id === messageId)) kept.push({ id: messageId, at: now });
    if (kept.length > 1_024) kept.splice(0, kept.length - 1_024);
    this.samples.delete(key);
    this.samples.set(key, kept);
    if (this.samples.size > 2_048) this.samples.delete(this.samples.keys().next().value!);
    return { count: kept.length, reached: kept.length >= Math.max(1, threshold) };
  }
}