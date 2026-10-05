import { spawn } from "node:child_process";
import path from "node:path";
import type { ActivityBarStyle } from "./activity-ranks-core";
import { ObjectStorageService } from "../lib/objectStorage";
import { activityBannerStoragePath, isSupportedActivityBannerSource } from "./activity-rank-banner-source";

const MAX_BANNER_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const BANNER_TIMEOUT_MS = 8_000;
const RENDER_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;
const storage = new ObjectStorageService();

export async function fetchActivityRankBanner(url: string): Promise<Buffer> {
  if (!isSupportedActivityBannerSource(url)) {
    throw new Error("Activity rank banners must use app uploads or a trusted HTTPS image host");
  }

  const objectPath = activityBannerStoragePath(url);
  // Uploaded paths never go through the app's hostname or user-controlled DNS.
  const response = objectPath
    ? await storage.downloadObject(await storage.getObjectEntityFile(objectPath))
    : await fetch(new URL(url), {
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
  sourceImage: Buffer | null,
  percentage: number,
  color: string,
  barStyle: ActivityBarStyle,
  member?: { displayName: string; level: number; avatar: Buffer | null },
): Promise<Buffer> {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid activity rank color");
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    throw new Error("Activity rank image renderer is busy; try the command again shortly");
  }
  const progress = Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0;
  const input = Buffer.from(JSON.stringify({
    banner: sourceImage?.toString("base64") ?? null,
    percentage: progress,
    style: barStyle,
    member: member ? {
      name: member.displayName.replace(/[\r\n\t]/g, " ").slice(0, 200),
      level: member.level,
      avatar: member.avatar?.toString("base64") ?? null,
    } : null,
  }));
  activeRenders += 1;
  return runRenderer(input).finally(() => {
    activeRenders -= 1;
  });
}

function runRenderer(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const process = spawn("python3", [
      path.join(import.meta.dirname, "activity-bars", "render.py"),
    ], { stdio: ["pipe", "pipe", "pipe"] });
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
    process.stdin.end(input);
  });
}
