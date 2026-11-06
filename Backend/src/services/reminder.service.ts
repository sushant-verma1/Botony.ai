import { prisma } from "../config/db.js";
import logger from "./logger.js";
import { publishNotification, type RealtimeNotification } from "./notification-realtime.service.js";
import { sendPushNotification } from "./web-push.service.js";
import {
  MedicationError,
  buildUpcomingReminderJobs,
} from "./medication.service.js";

const REMINDER_HORIZON_DAYS = 7;
const REMINDER_LEASE_MS = 5 * 60_000;
const MISSED_DOSE_GRACE_MS = 6 * 60 * 60_000;

function storageDateToCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function materializeMedicationReminderJobs(now = new Date()) {
  const schedules = await prisma.medicationSchedule.findMany({
    where: {
      status: "ACTIVE",
      medication: { status: "ACTIVE" },
    },
    select: {
      id: true,
      timezone: true,
      times: true,
      startsOn: true,
      endsOn: true,
      medicationId: true,
      userId: true,
    },
  });

  let created = 0;
  let skippedSchedules = 0;
  for (const schedule of schedules) {
    try {
      const jobs = buildUpcomingReminderJobs(
        {
          scheduleId: schedule.id,
          medicationId: schedule.medicationId,
          userId: schedule.userId,
          timezone: schedule.timezone,
          times: schedule.times,
          startsOn: storageDateToCalendarDate(schedule.startsOn),
          endsOn: schedule.endsOn
            ? storageDateToCalendarDate(schedule.endsOn)
            : undefined,
        },
        now,
        REMINDER_HORIZON_DAYS,
      );
      if (jobs.length === 0) continue;
      const result = await prisma.reminderJob.createMany({
        data: jobs,
        skipDuplicates: true,
      });
      created += result.count;
    } catch (error) {
      skippedSchedules += 1;
      // An invalid timezone or a daylight-saving gap in one schedule must not
      // prevent every other patient's reminder horizon from being refreshed.
      logger.error("Could not materialize medication reminder jobs", {
        scheduleId: schedule.id,
        userId: schedule.userId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return { schedules: schedules.length, created, skippedSchedules };
}

export async function listDueReminderJobs(userId: string, now = new Date()) {
  return prisma.reminderJob.findMany({
    where: {
      userId,
      status: "PENDING",
      scheduledFor: { lte: now },
    },
    select: {
      id: true,
      scheduledFor: true,
      medication: {
        select: { id: true, name: true, strength: true, form: true },
      },
      schedule: { select: { id: true, timezone: true, times: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });
}

/** Marks an unrecorded scheduled dose as missed only after a generous grace
 * period. The patient may still correct it later by logging a dose. */
export async function reconcileMissedDoseEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - MISSED_DOSE_GRACE_MS);
  const result = await prisma.doseEvent.updateMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: cutoff } },
    data: { status: "MISSED" },
  });
  return { markedMissed: result.count };
}

/** Recovers a database lease left by a crashed worker without treating Redis
 * as the source of truth. A later queue reconciliation re-enqueues it. */
export async function recoverStaleReminderJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - REMINDER_LEASE_MS);
  const result = await prisma.reminderJob.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleBefore } },
    data: { status: "PENDING", lockedAt: null },
  });
  return { recovered: result.count };
}

export async function listDoseHistory(userId: string) {
  return prisma.doseEvent.findMany({
    where: { userId },
    include: { medication: { select: { id: true, name: true, strength: true } } },
    orderBy: { scheduledFor: "desc" },
    take: 100,
  });
}

/**
 * Turns due durable jobs into private in-app notifications. Claiming first
 * prevents two API instances from creating duplicate reminders; the
 * reminderJobId + userId uniqueness constraint remains the database backstop.
 */
export async function dispatchDueInAppReminders(now = new Date()) {
  const staleBefore = new Date(now.getTime() - REMINDER_LEASE_MS);
  const candidates = await prisma.reminderJob.findMany({
    where: {
      scheduledFor: { lte: now },
      OR: [
        { status: "PENDING" },
        { status: "PROCESSING", lockedAt: { lt: staleBefore } },
      ],
    },
    select: {
      id: true,
      userId: true,
      medicationId: true,
      scheduleId: true,
      scheduledFor: true,
      medication: { select: { name: true, strength: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });

  let dispatched = 0;
  for (const job of candidates) {
    const claimed = await prisma.reminderJob.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: "PENDING" },
          { status: "PROCESSING", lockedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: "PROCESSING",
        lockedAt: now,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const medicine = job.medication.strength
          ? `${job.medication.name} (${job.medication.strength})`
          : job.medication.name;
        await tx.appNotification.upsert({
          where: { reminderJobId_userId: { reminderJobId: job.id, userId: job.userId } },
          update: {},
          create: {
            userId: job.userId,
            reminderJobId: job.id,
            type: "MEDICATION_REMINDER",
            title: "Medication reminder",
            body: `It is time to take ${medicine}.`,
          },
        });
        // A caregiver receives an in-app copy only when the patient enabled
        // it for this active relationship and explicitly granted medication
        // visibility. It is informational: only the patient can log a dose.
        const caregivers = await tx.careAccess.findMany({
          where: {
            recipientId: job.userId,
            status: "ACTIVE",
            medicationReminderNotifications: true,
            permissions: { has: "VIEW_MEDICATIONS" },
          },
          select: { caregiverId: true },
        });
        if (caregivers.length > 0) {
          await tx.appNotification.createMany({
            data: caregivers.map((caregiver) => ({
              userId: caregiver.caregiverId,
              reminderJobId: job.id,
              type: "CAREGIVER_MEDICATION_REMINDER",
              title: "Care-circle medication reminder",
              body: `A medication reminder is due for someone in your care circle: ${medicine}.`,
            })),
            skipDuplicates: true,
          });
        }
        await tx.doseEvent.upsert({
          where: {
            scheduleId_scheduledFor: {
              scheduleId: job.scheduleId,
              scheduledFor: job.scheduledFor,
            },
          },
          update: {},
          create: {
            userId: job.userId,
            medicationId: job.medicationId,
            scheduleId: job.scheduleId,
            scheduledFor: job.scheduledFor,
            status: "SCHEDULED",
          },
        });
        await tx.reminderJob.update({
          where: { id: job.id },
          data: { status: "DISPATCHED", dispatchedAt: now, lockedAt: null },
        });
      });
      dispatched += 1;
    } catch (error) {
      logger.error("Could not dispatch in-app medication reminder", {
        reminderJobId: job.id,
        userId: job.userId,
        message: error instanceof Error ? error.message : "unknown",
      });
      // A failed database write is safe to retry. The next worker pass will
      // reclaim it after the short lease rather than losing the reminder.
    }
  }

  return { candidates: candidates.length, dispatched };
}

/**
 * BullMQ invokes this for one durable ReminderJob. The database is checked at
 * execution time, so a delayed Redis job left behind by an edit/delete is a
 * harmless no-op. The unique notification index remains the retry backstop.
 */
export async function dispatchReminderJob(reminderJobId: string, now = new Date()): Promise<"dispatched" | "stale"> {
  const job = await prisma.reminderJob.findUnique({
    where: { id: reminderJobId },
    select: {
      id: true, userId: true, medicationId: true, scheduleId: true, scheduledFor: true, status: true,
      medication: { select: { name: true, strength: true, status: true } },
      schedule: { select: { status: true } },
    },
  });
  if (!job || job.status !== "PENDING" || job.scheduledFor > now ||
    job.medication.status !== "ACTIVE" || job.schedule.status !== "ACTIVE") {
    return "stale";
  }
  const claimed = await prisma.reminderJob.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return "stale";

  try {
    await prisma.$transaction(async (tx) => {
      const medicine = job.medication.strength
        ? `${job.medication.name} (${job.medication.strength})`
        : job.medication.name;
      await tx.appNotification.upsert({
        where: { reminderJobId_userId: { reminderJobId: job.id, userId: job.userId } },
        update: {},
        create: {
          userId: job.userId, reminderJobId: job.id, type: "MEDICATION_REMINDER",
          title: "Medication reminder", body: `It is time to take ${medicine}.`,
        },
      });
      const caregivers = await tx.careAccess.findMany({
        where: {
          recipientId: job.userId, status: "ACTIVE", medicationReminderNotifications: true,
          permissions: { has: "VIEW_MEDICATIONS" },
        },
        select: { caregiverId: true },
      });
      if (caregivers.length) await tx.appNotification.createMany({
        data: caregivers.map((caregiver) => ({
          userId: caregiver.caregiverId, reminderJobId: job.id,
          type: "CAREGIVER_MEDICATION_REMINDER" as const,
          title: "Care-circle medication reminder",
          body: `A medication reminder is due for someone in your care circle: ${medicine}.`,
        })),
        skipDuplicates: true,
      });
      await tx.doseEvent.upsert({
        where: { scheduleId_scheduledFor: { scheduleId: job.scheduleId, scheduledFor: job.scheduledFor } },
        update: {},
        create: {
          userId: job.userId, medicationId: job.medicationId, scheduleId: job.scheduleId,
          scheduledFor: job.scheduledFor, status: "SCHEDULED",
        },
      });
      await tx.reminderJob.update({
        where: { id: job.id }, data: { status: "DISPATCHED", dispatchedAt: now, lockedAt: null },
      });
    });
  } catch (error) {
    await prisma.reminderJob.updateMany({
      where: { id: job.id, status: "PROCESSING" },
      data: { status: "PENDING", lockedAt: null },
    });
    throw error;
  }

  const notifications = await prisma.appNotification.findMany({
    where: { reminderJobId: job.id },
    select: { id: true, type: true, title: true, body: true, createdAt: true, reminderJobId: true, userId: true },
  }) as RealtimeNotification[];
  await Promise.allSettled(notifications.flatMap((notification) => [
    publishNotification(notification),
    sendPushNotification(notification),
  ]));
  return "dispatched";
}

export async function listUnreadNotifications(userId: string) {
  return prisma.appNotification.findMany({
    where: { userId, readAt: null },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      createdAt: true,
      reminderJobId: true,
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await prisma.appNotification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true },
  });
  if (!notification) throw new MedicationError("Notification not found", 404);

  await prisma.appNotification.update({
    where: { id: notification.id },
    data: { readAt: new Date() },
  });
}

export async function logReminderDose(
  userId: string,
  reminderJobId: string,
  status: "TAKEN" | "SKIPPED",
  occurredAt: Date,
  note?: string,
) {
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
    throw new MedicationError("Dose time cannot be in the future", 400);
  }

  return prisma.$transaction(async (tx) => {
    const job = await tx.reminderJob.findFirst({
      where: {
        id: reminderJobId,
        userId,
        status: { in: ["PENDING", "DISPATCHED"] },
      },
      select: {
        id: true,
        scheduleId: true,
        medicationId: true,
        scheduledFor: true,
      },
    });
    if (!job) throw new MedicationError("Reminder not found", 404);

    const doseEvent = await tx.doseEvent.upsert({
      where: {
        scheduleId_scheduledFor: {
          scheduleId: job.scheduleId,
          scheduledFor: job.scheduledFor,
        },
      },
      update: { status, occurredAt, note: note?.trim() || null },
      create: {
        userId,
        medicationId: job.medicationId,
        scheduleId: job.scheduleId,
        scheduledFor: job.scheduledFor,
        status,
        occurredAt,
        note: note?.trim() || null,
      },
    });
    // The patient has acted on this reminder, so it must not be surfaced
    // again. CANCELLED is used because no external delivery occurred yet.
    await tx.reminderJob.update({
      where: { id: job.id },
      data: { status: "CANCELLED" },
    });
    await tx.appNotification.updateMany({
      where: { reminderJobId: job.id, readAt: null },
      data: { readAt: occurredAt },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: `DOSE_${status}`,
        resourceType: "DoseEvent",
        resourceId: doseEvent.id,
        metadata: { reminderJobId: job.id },
      },
    });
    return doseEvent;
  });
}
