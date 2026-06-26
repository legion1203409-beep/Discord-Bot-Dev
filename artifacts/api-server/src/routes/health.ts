import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isBotOnline } from "../bot/index";

const router: IRouter = Router();

const startTime = Date.now();

router.get("/healthz", (_req, res) => {
  const botOnline = isBotOnline();
  const data = HealthCheckResponse.parse({
    status: "ok",
    botOnline,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
  res.status(botOnline ? 200 : 503).json(data);
});

export default router;
