import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { redisUrl } from "../config/config.js";
import { prisma } from "../config/db.js";
import logger from "./logger.js";

export const REMINDER_QUEUE_NAME = "medication-reminders";
export type ReminderQueueJob = { reminderJobId: string };

let connection: Redis | null = null;
let queue: Queue<ReminderQueueJob> | null = null;

function getConnection(): Redis {
  connection ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  return connection;
}

export function getReminderQueue(): Queue<ReminderQueueJob> {
  queue ??= new Queue<ReminderQueueJob>(REMINDER_QUEUE_NAME, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });
  return queue;
}

/** Readiness probe only: it does not create, remove, or inspect reminder jobs. */
export async function checkReminderRedis(): Promise<void> {
  await getConnection().ping();
}

function queueJobId(reminderJobId: string): string {
  return `reminder-${reminderJobId}`;
}

/** Replaces a delayed job so edits always use the database's current due time. */
export async function enqueueReminderJob(reminderJobId: string, scheduledFor: Date): Promise<void> {
  const reminderQueue = getReminderQueue();
  const jobId = queueJobId(reminderJobId);
  const existing = await reminderQueue.getJob(jobId);
  if (existing) await existing.remove();
  await reminderQueue.add("dispatch-reminder", { reminderJobId }, {
    jobId,
    delay: Math.max(0, scheduledFor.getTime() - Date.now()),
  });
}

export async function removeReminderJob(reminderJobId: string): Promise<void> {
  const job = await getReminderQueue().getJob(queueJobId(reminderJobId));
  if (job) await job.remove();
}

/** Postgres is authoritative, so the worker can safely rebuild Redis jobs after restarts. */
export async function reconcileReminderQueue(): Promise<{ queued: number }> {
  const jobs = await prisma.reminderJob.findMany({
    where: { status: "PENDING" },
    select: { id: true, scheduledFor: true },
  });
  for (const job of jobs) await enqueueReminderJob(job.id, job.scheduledFor);
  return { queued: jobs.length };
}

export async function syncReminderQueueForSchedule(scheduleId: string): Promise<void> {
  try {
    const jobs = await prisma.reminderJob.findMany({
      where: { scheduleId, status: "PENDING" },
      select: { id: true, scheduledFor: true },
    });
    await Promise.all(jobs.map((job) => enqueueReminderJob(job.id, job.scheduledFor)));
  } catch (error) {
    // The committed database state will be rehydrated at worker start. A
    // transient Redis outage must not roll back a patient's schedule change.
    logger.error("Could not synchronize reminder jobs to Redis", {
      scheduleId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function removeReminderQueueJobs(reminderJobIds: string[]): Promise<void> {
  try {
    await Promise.all(reminderJobIds.map(removeReminderJob));
  } catch (error) {
    logger.error("Could not remove stale reminder jobs from Redis", {
      count: reminderJobIds.length,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function closeReminderQueue(): Promise<void> {
  await queue?.close();
  await connection?.quit();
  queue = null;
  connection = null;
}
