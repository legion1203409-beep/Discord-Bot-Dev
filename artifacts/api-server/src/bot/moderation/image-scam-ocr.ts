import { spawn } from "node:child_process";
import { logger } from "../../lib/logger";

const MAX_IMAGES = 2;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_IMAGE_EDGE = 10_000;
const MAX_OCR_OUTPUT_BYTES = 300_000;
const MAX_OCR_TEXT_LENGTH = 6_000;
const MAX_CONCURRENT_SCANS = 2;
const MAX_QUEUED_SCANS = 8;
const MAX_QUEUE_WAIT_MS = 35_000;
const DOWNLOAD_TIMEOUT_MS = 6_000;
const OCR_TIMEOUT_MS = 8_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const DISCORD_IMAGE_HOSTS = new Set(["cdn.discordapp.com", "cdn.discordapp.net", "media.discordapp.net"]);

let activeScans = 0;
const queuedScans: Array<{ resolve: (ready: boolean) => void; timer: NodeJS.Timeout | null }> = [];

export type ScamImageAttachment = {
  url: string;
  size: number;
  contentType: string | null;
  width?: number | null;
  height?: number | null;
};

export function isScannableImage(attachment: ScamImageAttachment): boolean {
  if (!Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > MAX_IMAGE_BYTES) return false;
  if (attachment.width != null && (!Number.isInteger(attachment.width) || attachment.width <= 0 || attachment.width > MAX_IMAGE_EDGE)) return false;
  if (attachment.height != null && (!Number.isInteger(attachment.height) || attachment.height <= 0 || attachment.height > MAX_IMAGE_EDGE)) return false;
  if (attachment.width && attachment.height && attachment.width * attachment.height > MAX_IMAGE_PIXELS) return false;
  let url: URL;
  try {
    url = new URL(attachment.url);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || !DISCORD_IMAGE_HOSTS.has(url.hostname) || url.username || url.password) return false;
  const type = attachment.contentType?.split(";")[0]?.toLowerCase();
  return type ? IMAGE_TYPES.has(type) : /\.(?:png|jpe?g|gif|webp)$/i.test(url.pathname);
}

/** Read image headers before allowing the native decoder to allocate pixel buffers. */
export function imageDimensionsWithinLimit(bytes: Buffer): boolean {
  let width = 0;
  let height = 0;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString("ascii", 12, 16) === "IHDR") {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (bytes.length >= 10 && (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a")) {
    width = bytes.readUInt16LE(6);
    height = bytes.readUInt16LE(8);
  } else if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      width = bytes.readUIntLE(24, 3) + 1;
      height = bytes.readUIntLE(27, 3) + 1;
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      width = 1 + (bytes[21]! | ((bytes[22]! & 0x3f) << 8));
      height = 1 + ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 0x0f) << 10));
    } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9 || marker == null || offset + 2 > bytes.length) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const segmentLength = bytes.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (segmentLength < 7) break;
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += segmentLength;
    }
  }
  return width > 0 && height > 0 && width <= MAX_IMAGE_EDGE && height <= MAX_IMAGE_EDGE
    && width * height <= MAX_IMAGE_PIXELS;
}

async function downloadDiscordImage(url: string): Promise<Buffer | null> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) return null;
  const reportedLength = Number(response.headers.get("content-length"));
  if (reportedLength > MAX_IMAGE_BYTES) {
    await response.body.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, length);
  return imageDimensionsWithinLimit(bytes) ? bytes : null;
}

/** Discard low-confidence noise, but keep imperfect words in otherwise readable screenshots. */
export function parseTesseractTsv(tsv: string): string {
  const lines: string[] = [];
  let currentLine = "";
  let currentWords: string[] = [];
  let wordCount = 0;
  let totalConfidence = 0;
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const columns = line.split("\t");
    if (columns[0] !== "5" || columns.length < 12) continue;
    const confidence = Number(columns[10]);
    const word = columns.slice(11).join(" ").trim();
    if (!word || word.length > 70 || !Number.isFinite(confidence) || confidence < 15) continue;
    const lineKey = columns.slice(1, 5).join(":");
    if (currentLine && lineKey !== currentLine) {
      lines.push(currentWords.join(" "));
      currentWords = [];
    }
    currentLine = lineKey;
    currentWords.push(word);
    wordCount++;
    totalConfidence += confidence;
  }
  if (currentWords.length) lines.push(currentWords.join(" "));
  if (wordCount < 4 || totalConfidence / wordCount < 50) return "";
  return lines.join("\n").slice(0, MAX_OCR_TEXT_LENGTH);
}

function runLocalOcr(image: Buffer): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("prlimit", [
      "--as=536870912", "--cpu=10", "--", "tesseract", "stdin", "stdout", "--psm", "11", "-l", "eng+ron", "tsv",
    ], {
      stdio: ["pipe", "pipe", "ignore"],
      env: { ...process.env, OMP_THREAD_LIMIT: "1" },
    });
    const chunks: Buffer[] = [];
    let length = 0;
    let failed = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      logger.warn("Local scam image OCR timed out");
    }, OCR_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_OCR_OUTPUT_BYTES) {
        failed = true;
        child.kill("SIGKILL");
        logger.warn("Local scam image OCR output exceeded limit");
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      failed = true;
      logger.warn({ code: error.code }, "Local scam image OCR could not start");
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failed || timedOut || code !== 0) {
        if (!failed && !timedOut) logger.warn({ exitCode: code }, "Local scam image OCR failed");
        resolve("");
        return;
      }
      resolve(parseTesseractTsv(Buffer.concat(chunks, length).toString("utf8")));
    });
    child.stdin.on("error", () => {
      failed = true;
      child.kill("SIGKILL");
    });
    child.stdin.end(image);
  });
}

function acquireScanSlot(): Promise<boolean> {
  if (activeScans < MAX_CONCURRENT_SCANS) {
    activeScans++;
    return Promise.resolve(true);
  }
  if (queuedScans.length >= MAX_QUEUED_SCANS) {
    logger.warn("Local scam image OCR queue is full; an image message could not be checked");
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const queued = { resolve, timer: null as NodeJS.Timeout | null };
    queued.timer = setTimeout(() => {
      const index = queuedScans.indexOf(queued);
      if (index < 0) return;
      queuedScans.splice(index, 1);
      logger.warn("Local scam image OCR queue wait timed out; an image message could not be checked");
      resolve(false);
    }, MAX_QUEUE_WAIT_MS);
    queuedScans.push(queued);
  });
}

function releaseScanSlot(): void {
  const next = queuedScans.shift();
  if (next) {
    if (next.timer) clearTimeout(next.timer);
    next.resolve(true); // Transfer this occupied slot instead of opening a third scan.
  } else {
    activeScans--;
  }
}

/** Only fetches real Discord image attachments; never sends their pixels to an external AI service. */
export async function readScamImageTexts(
  attachments: Iterable<ScamImageAttachment>,
  recognize: (image: Buffer) => Promise<string> = runLocalOcr,
): Promise<string[]> {
  const images = Array.from(attachments).filter(isScannableImage).slice(0, MAX_IMAGES);
  if (!images.length || !await acquireScanSlot()) return [];
  try {
    const texts: string[] = [];
    for (const image of images) {
      try {
        const bytes = await downloadDiscordImage(image.url);
        if (!bytes) continue;
        const text = await recognize(bytes);
        if (text) texts.push(text);
      } catch (error) {
        logger.warn({ cause: error instanceof Error ? error.name : "unknown" }, "Scam image OCR download or processing failed");
      }
    }
    return texts;
  } finally {
    releaseScanSlot();
  }
}