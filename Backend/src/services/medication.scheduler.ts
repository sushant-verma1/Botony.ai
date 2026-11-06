import { medicationScheduleMaterializationIntervalMs } from "../config/config.js";
import logger from "./logger.js";
import {
  dispatchDueInAppReminders,
  materializeMedicationReminderJobs,
  reconcileMissedDoseEvents,
} from "./reminder.service.js";

let timer: NodeJS.Timeout | null = null;

async function runPass(): Promise<void> {
  try {
    const materialized = await materializeMedicationReminderJobs();
    const dispatched = await dispatchDueInAppReminders();
    const reconciled = await reconcileMissedDoseEvents();
    logger.info("Medication reminder scheduler completed", {
      ...materialized,
      ...dispatched,
      ...reconciled,
    });
  } catch (error) {
    logger.error("Medication reminder job materialization failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Keeps a rolling durable job horizon in Postgres and dispatches due jobs to
 * Botony's private in-app notification inbox.
 */
export function startMedicationScheduler(): NodeJS.Timeout | null {
  if (medicationScheduleMaterializationIntervalMs <= 0) {
    logger.info("Medication scheduler disabled (interval is 0)");
    return null;
  }
  if (timer) return timer;

  void runPass();
  timer = setInterval(() => void runPass(), medicationScheduleMaterializationIntervalMs);
  timer.unref();
  logger.info("Medication scheduler started", {
    intervalMs: medicationScheduleMaterializationIntervalMs,
  });
  return timer;
}

export function stopMedicationScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
