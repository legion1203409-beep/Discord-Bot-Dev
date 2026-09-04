import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { getBotClient, GUILD_ID, isBotOnline } from "../bot/index";
import { fetchDiscordGuildStats, fetchDiscordGuildStatsViaRest } from "./discord-stats";

const router: IRouter = Router();

router.get("/discord/stats", async (req, res) => {
  const client = getBotClient();

  // Fetch most recently registered player from DB (reliable, no privileged intents needed)
  let lastJoined: string | null = null;
  try {
    const [newest] = await db
      .select({ username: playersTable.username })
      .from(playersTable)
      .orderBy(desc(playersTable.createdAt))
      .limit(1);
    lastJoined = newest?.username ?? null;
  } catch {
    // DB unavailable — lastJoined stays null
  }

  if (!client || !isBotOnline()) {
    // Development intentionally does not open a Discord Gateway session, so
    // use the REST count endpoint for the landing-page preview instead.
    try {
      const { onlineCount, totalMembers } = await fetchDiscordGuildStatsViaRest(
        process.env.DISCORD_TOKEN,
        GUILD_ID,
      );
      res.status(200).json({
        live: true,
        onlineCount,
        totalMembers,
        lastJoined,
      });
      return;
    } catch (err) {
      req.log.debug({ err }, "Discord gateway offline and REST stats unavailable");
    }

    res.status(200).json({
      live: false,
      onlineCount: null,
      totalMembers: null,
      lastJoined,
    });
    return;
  }

  try {
    const { onlineCount, totalMembers } = await fetchDiscordGuildStats(client, GUILD_ID);

    res.status(200).json({
      live: true,
      onlineCount,
      totalMembers,
      lastJoined,
    });
  } catch (err) {
    req.log.warn({ err }, "Failed to fetch Discord guild stats");
    res.status(200).json({
      live: false,
      onlineCount: null,
      totalMembers: null,
      lastJoined,
    });
  }
});

export default router;
