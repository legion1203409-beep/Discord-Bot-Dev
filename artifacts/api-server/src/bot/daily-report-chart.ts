import { spawn } from "node:child_process";
import path from "node:path";
import { logger } from "../lib/logger";

/** The card's file name; the embed points at it with attachment://. */
export const DAILY_CHART_FILE = "raport-zilnic.png";

const RENDER_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_WAITING = 4;

export type DailyChartInput = {
  guild: string;
  date: string;
  color: string;
  metrics: Array<{ label: string; value: number; delta: number | null; invert?: boolean }>;
  activityTitle: string;
  activity: Array<{ label: string; value: number | null; current: boolean }>;
  average: number | null;
  summary: string;
};

/**
 * Text as the card can draw it: the font has no emoji, so emoji, Discord's
 * custom emoji and markdown marks go, and what is left is trimmed.
 */
export function chartText(value: string, max = 120): string {
  return value
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[︎️‍⃣]/g, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// One card at a time; the report is once a day per server, so a short queue is enough.
let active = false;
const waiting: Array<() => void> = [];

async function acquire(): Promise<boolean> {
  if (!active) {
    active = true;
    return true;
  }
  if (waiting.length >= MAX_WAITING) return false;
  await new Promise<void>((resolve) => waiting.push(resolve));
  return true;
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else active = false;
}

/** The card as a PNG, or null when it could not be drawn; the report then goes out without it. */
export async function renderDailyReportChart(input: DailyChartInput): Promise<Buffer | null> {
  if (!(await acquire())) return null;
  try {
    return await runRenderer(Buffer.from(JSON.stringify(input)));
  } catch (error) {
    logger.warn({ error }, "Daily report card could not be drawn; the report goes out without it");
    return null;
  } finally {
    release();
  }
}

function runRenderer(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [
      path.join(import.meta.dirname, "daily-report", "render.py"),
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let errorBytes = 0;
    let settled = false;
    let failure: Error | null = null;

    const fail = (error: Error) => {
      if (settled || failure) return;
      failure = error;
      clearTimeout(timeout);
      output.length = 0;
      child.kill("SIGKILL");
      // The slot is freed when close confirms the process is gone.
    };
    const timeout = setTimeout(() => fail(new Error("Daily report card timed out")), RENDER_TIMEOUT_MS);

    child.on("error", fail);
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled || failure) return;
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        fail(new Error("Daily report card exceeded the output limit"));
        return;
      }
      output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errorBytes >= 4_096) return;
      const part = chunk.subarray(0, 4_096 - errorBytes);
      errors.push(part);
      errorBytes += part.length;
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0 || outputBytes === 0) {
        reject(new Error(`Could not draw the daily report card: ${Buffer.concat(errors).toString("utf8")}`));
        return;
      }
      resolve(Buffer.concat(output, outputBytes));
    });
    child.stdin.on("error", (error) => {
      if (!settled) fail(error);
    });
    child.stdin.end(input);
  });
}
