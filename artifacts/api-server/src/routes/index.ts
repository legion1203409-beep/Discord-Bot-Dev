import { Router, type IRouter } from "express";
import express from "express";
import path from "node:path";
import healthRouter from "./health";

const router: IRouter = Router();

const assetsDir = path.join(import.meta.dirname, "..", "assets");
router.use("/assets", express.static(assetsDir, { maxAge: "7d" }));

router.use(healthRouter);

export default router;
