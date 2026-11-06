import "dotenv/config";
import assert from "node:assert/strict";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "../src/config/db.js";
import { redisUrl } from "../src/config/config.js";
import {
  REMINDER_NOTIFICATION_CHANNEL,
  type RealtimeNotification,
} from "../src/services/notification-realtime.service.js";
import {
  closeReminderQueue,
  enqueueReminderJob,
  REMINDER_QUEUE_NAME,
  type ReminderQueueJob,
} from "../src/services/reminder.queue.js";
import { dispatchReminderJob } from "../src/services/reminder.service.js";

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let userId: string | undefined;
const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });

function waitFor<T>(read: () => Promise<T | null>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const value = await read();
        if (value) return resolve(value);
        if (Date.now() >= deadline) return reject(new Error("Timed out waiting for reminder delivery"));
        setTimeout(() => void check(), 100);
      } catch (error) {
        reject(error);
      }
    };
    void check();
  });
}

async function main(): Promise<void> {
  await prisma.$connect();
  const realtimeEvent = new Promise<RealtimeNotification>((resolve) => {
    subscriber.on("message", (_channel, payload) => resolve(JSON.parse(payload) as RealtimeNotification));
  });
  await subscriber.subscribe(REMINDER_NOTIFICATION_CHANNEL);

  const worker = new Worker<ReminderQueueJob>(
    REMINDER_QUEUE_NAME,
    async (job) => dispatchReminderJob(job.data.reminderJobId),
    { connection: workerConnection },
  );

  try {
    const user = await prisma.user.create({
      data: { email: `reminder-e2e-${suffix}@example.invalid`, password: "", age: 30 },
    });
    userId = user.id;
    const medication = await prisma.medication.create({ data: { userId, name: "E2E calcium" } });
    const schedule = await prisma.medicationSchedule.create({
      data: {
        userId,
        medicationId: medication.id,
        timezone: "UTC",
        times: ["12:00"],
        startsOn: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const reminderJob = await prisma.reminderJob.create({
      data: {
        userId,
        medicationId: medication.id,
        scheduleId: schedule.id,
        scheduledFor: new Date(Date.now() - 1_000),
      },
    });

    await enqueueReminderJob(reminderJob.id, reminderJob.scheduledFor);
    const notification = await waitFor(() => prisma.appNotification.findFirst({
      where: { reminderJobId: reminderJob.id, userId },
      select: { id: true, reminderJobId: true },
    }));
    const event = await realtimeEvent;
    const dose = await prisma.doseEvent.findUnique({
      where: { scheduleId_scheduledFor: { scheduleId: schedule.id, scheduledFor: reminderJob.scheduledFor } },
      select: { status: true },
    });
    const storedJob = await prisma.reminderJob.findUnique({
      where: { id: reminderJob.id }, select: { status: true },
    });

    assert.equal(storedJob?.status, "DISPATCHED");
    assert.equal(dose?.status, "SCHEDULED");
    assert.equal(event.reminderJobId, reminderJob.id);
    assert.equal(event.id, notification.id);
    console.log("Reminder end-to-end verification passed");
  } finally {
    await worker.close();
    await subscriber.quit();
    await workerConnection.quit();
    await closeReminderQueue();
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Reminder end-to-end verification failed", error);
  process.exitCode = 1;
});
