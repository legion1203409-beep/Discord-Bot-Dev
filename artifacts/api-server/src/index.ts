import app from "./app";
import { logger } from "./lib/logger";
import { startBot } from "./bot/index";
import { sendAlert, DISCONNECT_ALERT_THRESHOLD_MS } from "./bot/alert";

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — process continues");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — process continues");
});

const BOT_RETRY_BASE_MS = 2_000;
const BOT_RETRY_MAX_MS = 5 * 60_000;
// If the bot ran stably for this long before dying, reset the back-off counter
// so a transient runtime disconnect doesn't inherit a multi-minute delay.
const BOT_STABLE_THRESHOLD_MS = 60_000;

async function startBotWithRetry() {
  let attempt = 0;
  let supervisorAlertTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleSupervisorAlert(currentAttempt: number) {
    if (supervisorAlertTimer) return; // already scheduled
    const thresholdMin = Math.round(DISCONNECT_ALERT_THRESHOLD_MS / 60_000);
    supervisorAlertTimer = setTimeout(() => {
      supervisorAlertTimer = null;
      void sendAlert(
        `🚨 **Bot has been failing to reconnect for over ${thresholdMin} minute${thresholdMin === 1 ? "" : "s"}** (${currentAttempt} restart attempt${currentAttempt === 1 ? "" : "s"}).\nCheck server logs — the bot supervisor is still retrying with back-off.`,
      );
    }, DISCONNECT_ALERT_THRESHOLD_MS);
  }

  function cancelSupervisorAlert() {
    if (supervisorAlertTimer) {
      clearTimeout(supervisorAlertTimer);
      supervisorAlertTimer = null;
    }
  }

  while (true) {
    const connectTime = Date.now();
    try {
      await startBot(() => {
        // Bot is ready after a restart — cancel the supervisor alert so it
        // doesn't fire if the bot recovered within the threshold.
        cancelSupervisorAlert();
      });
      // startBot() resolved without error = DISCORD_TOKEN not set; stop looping.
      return;
    } catch (err) {
      const uptimeMs = Date.now() - connectTime;
      if (uptimeMs >= BOT_STABLE_THRESHOLD_MS) {
        // Bot ran successfully long enough — treat this as a fresh failure.
        attempt = 0;
        cancelSupervisorAlert();
      }

      attempt++;
      const delay = Math.min(BOT_RETRY_BASE_MS * Math.pow(2, attempt - 1), BOT_RETRY_MAX_MS);
      logger.error({ err, attempt, delayMs: delay, uptimeMs }, "Bot terminated — restarting with back-off");

      // Schedule the alert timer on the first failure of this outage window.
      // It fires after the threshold regardless of how many retries happen in between.
      scheduleSupervisorAlert(attempt);

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}

if (process.env.NODE_ENV === "production") {
  startBotWithRetry();
} else {
  logger.info("Bot disabled in development mode — set NODE_ENV=production to enable");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
