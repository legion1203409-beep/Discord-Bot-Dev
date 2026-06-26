import { logger } from "../lib/logger";

export const DISCONNECT_ALERT_THRESHOLD_MS = (() => {
  const raw = process.env["DISCONNECT_ALERT_THRESHOLD_MS"];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60_000;
})();

export async function sendAlert(message: string): Promise<void> {
  const webhookUrl = process.env["DISCORD_ALERT_WEBHOOK_URL"];
  if (!webhookUrl) {
    logger.warn("DISCORD_ALERT_WEBHOOK_URL not configured — alert suppressed");
    return;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    if (res.ok) {
      logger.info({ message }, "Disconnect alert sent");
    } else {
      logger.error({ status: res.status, message }, "Disconnect alert request failed");
    }
  } catch (err) {
    logger.error({ err, message }, "Disconnect alert fetch threw");
  }
}
