import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { getBotClient, GUILD_ID, isBotOnline } from "../bot/index";

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
    res.status(200).json({
      live: false,
      onlineCount: null,
      totalMembers: null,
      lastJoined,
    });
    return;
  }

  try {
    const guild = await client.guilds.fetch({ guild: GUILD_ID, withCounts: true });

    res.status(200).json({
      live: true,
      onlineCount: guild.approximatePresenceCount ?? null,
      totalMembers: guild.approximateMemberCount ?? null,
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
