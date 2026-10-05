import { spawn } from "node:child_process";

const MAX_BANNER_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const BANNER_TIMEOUT_MS = 8_000;
const RENDER_TIMEOUT_MS = 12_000;

export async function fetchActivityRankBanner(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.includes(".") ||
    parsed.username ||
    parsed.password ||
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".localhost") ||
    parsed.hostname.endsWith(".local")
  ) {
    throw new Error("Activity rank banner URL is not a public HTTPS image URL");
  }

  const response = await fetch(parsed, {
    headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
    redirect: "error",
    signal: AbortSignal.timeout(BANNER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Activity rank banner returned HTTP ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!contentType || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType)) {
    throw new Error("Activity rank banner must be a PNG, JPEG, WebP, or GIF image");
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BANNER_BYTES) {
    throw new Error("Activity rank banner exceeds the 10 MB size limit");
  }

  if (!response.body) throw new Error("Activity rank banner response has no image data");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BANNER_BYTES) {
      await reader.cancel();
      throw new Error("Activity rank banner exceeds the 10 MB size limit");
    }
    chunks.push(value);
  }
  if (totalBytes === 0) throw new Error("Activity rank banner is empty");
  return Buffer.concat(chunks, totalBytes);
}

export function renderActivityRankBanner(
  sourceImage: Buffer,
  percentage: number,
  color: string,
): Promise<Buffer> {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid activity rank color");
  const progress = Math.max(0, Math.min(100, Math.floor(percentage)));
  const barLeft = 76;
  const barRight = 1124;
  const fillRight = Math.round(barLeft + (barRight - barLeft) * progress / 100);
  const args = [
    "-limit", "memory", "128MiB",
    "-limit", "map", "256MiB",
    "-limit", "disk", "256MiB",
    "-limit", "area", "25MP",
    "-limit", "thread", "2",
    "-",
    "-[0]",
    "-auto-orient",
    "-resize", "1200x450^",
    "-gravity", "center",
    "-extent", "1200x450",
    "-fill", "rgba(8, 12, 20, 0.82)",
    "-stroke", "rgba(255, 255, 255, 0.52)",
    "-strokewidth", "2",
    "-draw", "roundrectangle 48,365 1152,421 18,18",
    "+stroke",
    "-fill", "rgba(255, 255, 255, 0.34)",
    "-draw", `roundrectangle ${barLeft},385 ${barRight},401 8,8`,
  ];
  if (fillRight > barLeft) {
    args.push("-fill", color, "-draw", `roundrectangle ${barLeft},385 ${fillRight},401 8,8`);
  }
  args.push("-strip", "-define", "png:compression-level=7", "png:-");
  return runImageMagick(sourceImage, args);
}

function runImageMagick(sourceImage: Buffer, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const process = spawn("magick", args, { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let errorBytes = 0;
    let settled = false;

    const finishWithError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      process.kill("SIGKILL");
      reject(error);
    };

    const timeout = setTimeout(
      () => finishWithError(new Error("Activity rank banner image rendering timed out")),
      RENDER_TIMEOUT_MS,
    );

    process.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    process.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        finishWithError(new Error("Rendered activity rank banner exceeded the output limit"));
        return;
      }
      output.push(chunk);
    });
    process.stderr.on("data", (chunk: Buffer) => {
      if (errorBytes >= 8_192) return;
      const remaining = 8_192 - errorBytes;
      errors.push(chunk.subarray(0, remaining));
      errorBytes += Math.min(chunk.length, remaining);
    });
    process.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Could not render activity rank banner: ${Buffer.concat(errors).toString("utf8")}`));
        return;
      }
      resolve(Buffer.concat(output, outputBytes));
    });
    process.stdin.on("error", (error) => {
      if (!settled) finishWithError(error);
    });
    process.stdin.end(sourceImage);
  });
}
