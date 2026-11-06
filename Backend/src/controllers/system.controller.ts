import type { Request, Response } from "express";
import { prisma } from "../config/db.js";
import { checkReminderRedis } from "../services/reminder.queue.js";
import logger from "../services/logger.js";

/** Liveness never depends on external services, so an orchestrator can restart
 * only a genuinely stuck API process. */
export function liveController(_req: Request, res: Response) {
  return res.status(200).json({ status: "ok" });
}

/** Readiness verifies the two dependencies required for reminder delivery. */
export async function readyController(_req: Request, res: Response) {
  try {
    await Promise.all([
      prisma.$queryRawUnsafe("SELECT 1"),
      checkReminderRedis(),
    ]);
    return res.status(200).json({ status: "ready", database: "ok", redis: "ok" });
  } catch (error) {
    logger.error("Readiness check failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return res.status(503).json({ status: "unready" });
  }
}
