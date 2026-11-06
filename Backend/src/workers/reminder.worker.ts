import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { redisUrl } from "../config/config.js";
import { prisma } from "../config/db.js";
import logger from "../services/logger.js";
import { reconcileReminderQueue, REMINDER_QUEUE_NAME } from "../services/reminder.queue.js";
import { dispatchReminderJob, materializeMedicationReminderJobs, reconcileMissedDoseEvents, recoverStaleReminderJobs } from "../services/reminder.service.js";

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(REMINDER_QUEUE_NAME, { connection });

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  const materialized = await materializeMedicationReminderJobs();
  const recovered = await recoverStaleReminderJobs();
  const queued = await reconcileReminderQueue();
  await queue.add("materialize-reminders", {}, { jobId: "materialize-reminders", repeat: { every: 60 * 60 * 1000 }, removeOnComplete: true });
  await queue.add("reconcile-missed-doses", {}, { jobId: "reconcile-missed-doses", repeat: { every: 60 * 60 * 1000 }, removeOnComplete: true });
  await queue.add("recover-reminders", {}, { jobId: "recover-reminders", repeat: { every: 5 * 60 * 1000 }, removeOnComplete: true });
  logger.info("Reminder worker recovered durable jobs", { ...materialized, ...recovered, ...queued });
}

const worker = new Worker(REMINDER_QUEUE_NAME, async (job) => {
  if (job.name === "dispatch-reminder") return dispatchReminderJob(job.data.reminderJobId);
  if (job.name === "materialize-reminders") {
    await materializeMedicationReminderJobs();
    return reconcileReminderQueue();
  }
  if (job.name === "reconcile-missed-doses") return reconcileMissedDoseEvents();
  if (job.name === "recover-reminders") {
    const recovered = await recoverStaleReminderJobs();
    if (recovered.recovered) await reconcileReminderQueue();
    return recovered;
  }
}, { connection, concurrency: 10 });

worker.on("failed", (job, error) => logger.error("Reminder worker job failed", { jobId: job?.id, name: job?.name, message: error.message }));

async function shutdown(): Promise<void> {
  await worker.close();
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
}
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
bootstrap().catch((error) => {
  logger.error("Reminder worker could not start", { message: error instanceof Error ? error.message : "unknown" });
  process.exit(1);
});
