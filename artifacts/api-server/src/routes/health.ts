import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isBotOnline, getBotReadyAt, getShardStatus } from "../bot/index";

const router: IRouter = Router();

const startTime = Date.now();

router.get("/healthz", (_req, res) => {
  const botOnline = isBotOnline();
  const botReadyAt = getBotReadyAt();
  const botUptime = botReadyAt && botOnline
    ? Math.floor((Date.now() - botReadyAt.getTime()) / 1000)
    : 0;
  const data = HealthCheckResponse.parse({
    status: "ok",
    botOnline,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    botReadyAt: botReadyAt ? botReadyAt.toISOString() : null,
    botUptime,
    shardStatus: getShardStatus(),
  });
  res.status(200).json(data);
});

export default router;
