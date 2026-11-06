import { prisma } from "../config/db.js";
import { removeReminderQueueJobs, syncReminderQueueForSchedule } from "./reminder.queue.js";

const REMINDER_HORIZON_DAYS = 7;

export class MedicationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface MedicationInput {
  name: string;
  strength?: string;
  form?: string;
  instructions?: string;
}

export interface DailyScheduleInput {
  timezone: string;
  times: string[];
  startsOn: string;
  endsOn?: string;
}

export interface MedicationInventoryInput {
  quantityOnHand: number;
  refillAt?: number;
}

export interface UpdateMedicationScheduleInput {
  timezone?: string;
  times?: string[];
  startsOn?: string;
  endsOn?: string | null;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface ReminderSeed {
  scheduledFor: Date;
  scheduleId: string;
  medicationId: string;
  userId: string;
}

function parseCalendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new MedicationError("Invalid calendar date", 400);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new MedicationError("Invalid calendar date", 400);
  }
  return { year, month, day };
}

function calendarDateToStorageDate(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return (
    Date.UTC(a.year, a.month - 1, a.day) -
    Date.UTC(b.year, b.month - 1, b.day)
  );
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function calendarDateInTimezone(instant: Date, timezone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function timeParts(time: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new MedicationError("Invalid reminder time", 400);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new MedicationError("Invalid reminder time", 400);
  }
  return { hour, minute };
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new MedicationError("Invalid timezone", 400);
  }
}

function offsetAt(instant: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT(?:(?<sign>[+-])(?<hours>\d{1,2}):(?<minutes>\d{2}))?$/.exec(
    name ?? "",
  );
  if (!match) throw new MedicationError("Could not resolve timezone offset", 400);
  if (!match.groups?.sign) return 0;
  const minutes = Number(match.groups.hours) * 60 + Number(match.groups.minutes);
  return (match.groups.sign === "+" ? 1 : -1) * minutes * 60_000;
}

function matchesLocalTime(
  instant: Date,
  date: CalendarDate,
  hour: number,
  minute: number,
  timezone: string,
): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return (
    read("year") === date.year &&
    read("month") === date.month &&
    read("day") === date.day &&
    read("hour") === hour &&
    read("minute") === minute
  );
}

/** Converts an intended local wall-clock time to UTC without relying on the
 * API process's own timezone. Invalid daylight-saving times are rejected
 * rather than silently moved to another medication time. */
export function localScheduleTimeToUtc(
  date: CalendarDate,
  time: string,
  timezone: string,
): Date {
  const { hour, minute } = timeParts(time);
  const localEpoch = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  // A wall-clock time can map to zero instants (spring-forward gap), one
  // instant, or two instants (fall-back fold).  Never silently choose one of
  // the duplicated instants for a medication reminder.
  const offsets = new Set([
    offsetAt(new Date(localEpoch - 48 * 3_600_000), timezone),
    offsetAt(new Date(localEpoch), timezone),
    offsetAt(new Date(localEpoch + 48 * 3_600_000), timezone),
  ]);
  const candidates = [...offsets]
    .map((offset) => new Date(localEpoch - offset))
    .filter((instant) => matchesLocalTime(instant, date, hour, minute, timezone));
  if (candidates.length === 0) {
    throw new MedicationError(
      "This reminder time does not exist in the selected timezone",
      400,
    );
  }
  if (candidates.length > 1) {
    throw new MedicationError(
      "This reminder time occurs twice because of daylight saving time. Please choose a different time.",
      400,
    );
  }
  return candidates[0];
}

export function buildUpcomingReminderJobs(
  input: {
    scheduleId: string;
    medicationId: string;
    userId: string;
    timezone: string;
    times: string[];
    startsOn: string;
    endsOn?: string;
  },
  now = new Date(),
  horizonDays = REMINDER_HORIZON_DAYS,
): ReminderSeed[] {
  assertTimezone(input.timezone);
  const startsOn = parseCalendarDate(input.startsOn);
  const endsOn = input.endsOn ? parseCalendarDate(input.endsOn) : undefined;
  if (endsOn && compareCalendarDates(endsOn, startsOn) < 0) {
    throw new MedicationError("Schedule end date must not be before start date", 400);
  }

  const today = calendarDateInTimezone(now, input.timezone);
  const firstDay = compareCalendarDates(startsOn, today) > 0 ? startsOn : today;
  const jobs: ReminderSeed[] = [];

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const day = addCalendarDays(firstDay, offset);
    if (endsOn && compareCalendarDates(day, endsOn) > 0) break;
    for (const time of input.times) {
      const scheduledFor = localScheduleTimeToUtc(day, time, input.timezone);
      if (scheduledFor.getTime() > now.getTime()) {
        jobs.push({
          scheduledFor,
          scheduleId: input.scheduleId,
          medicationId: input.medicationId,
          userId: input.userId,
        });
      }
    }
  }
  return jobs;
}

export async function listMedications(userId: string) {
  return prisma.medication.findMany({
    where: { userId },
    include: {
      schedules: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function createMedication(userId: string, input: MedicationInput) {
  return prisma.$transaction(async (tx) => {
    const medication = await tx.medication.create({
      data: {
        userId,
        name: input.name.trim(),
        strength: input.strength?.trim() || null,
        form: input.form?.trim() || null,
        instructions: input.instructions?.trim() || null,
      },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEDICATION_CREATED",
        resourceType: "Medication",
        resourceId: medication.id,
      },
    });
    return medication;
  });
}

export async function archiveMedication(userId: string, medicationId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const medication = await tx.medication.findFirst({
      where: { id: medicationId, userId },
      select: { id: true },
    });
    if (!medication) throw new MedicationError("Medication not found", 404);

    await tx.medication.update({
      where: { id: medication.id },
      data: { status: "ARCHIVED" },
    });
    await tx.medicationSchedule.updateMany({
      where: { medicationId: medication.id, userId, status: "ACTIVE" },
      data: { status: "ARCHIVED" },
    });
    const pending = await tx.reminderJob.findMany({
      where: { medicationId: medication.id, userId, status: { in: ["PENDING", "PROCESSING"] } },
      select: { id: true },
    });
    await tx.reminderJob.updateMany({
      where: { id: { in: pending.map((job) => job.id) } },
      data: { status: "CANCELLED" },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEDICATION_ARCHIVED",
        resourceType: "Medication",
        resourceId: medication.id,
      },
    });
    return pending.map((job) => job.id);
  });
  await removeReminderQueueJobs(result);
}

/** Inventory is patient-entered and never decremented automatically: a
 * reminder is not evidence that a dose was taken. */
export async function updateMedicationInventory(
  userId: string,
  medicationId: string,
  input: MedicationInventoryInput,
) {
  if (!Number.isInteger(input.quantityOnHand) || input.quantityOnHand < 0) {
    throw new MedicationError("Quantity on hand must be a whole number of zero or more", 400);
  }
  if (input.refillAt !== undefined && (!Number.isInteger(input.refillAt) || input.refillAt < 0)) {
    throw new MedicationError("Refill alert threshold must be a whole number of zero or more", 400);
  }
  return prisma.$transaction(async (tx) => {
    const medication = await tx.medication.findFirst({
      where: { id: medicationId, userId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!medication) throw new MedicationError("Active medication not found", 404);
    const belowThreshold = input.refillAt !== undefined && input.quantityOnHand <= input.refillAt;
    const result = await tx.medication.update({
      where: { id: medication.id },
      data: {
        quantityOnHand: input.quantityOnHand,
        refillAt: input.refillAt ?? null,
        refillAlertedAt: belowThreshold ? undefined : null,
      },
    });
    if (belowThreshold && !result.refillAlertedAt) {
      await tx.appNotification.create({
        data: {
          userId,
          medicationId: medication.id,
          type: "REFILL_ALERT",
          title: "Medication supply reminder",
          body: `${medication.name} is at or below the refill level you recorded. Consider checking your supply or pharmacy plan.`,
        },
      });
      return tx.medication.update({
        where: { id: medication.id },
        data: { refillAlertedAt: new Date() },
      });
    }
    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEDICATION_INVENTORY_UPDATED",
        resourceType: "Medication",
        resourceId: medication.id,
        metadata: { quantityOnHand: input.quantityOnHand, refillAt: input.refillAt ?? null },
      },
    });
    return result;
  });
}

export async function createDailyMedicationSchedule(
  userId: string,
  medicationId: string,
  input: DailyScheduleInput,
  agentActionId?: string,
) {
  assertTimezone(input.timezone);
  if (new Set(input.times).size !== input.times.length) {
    throw new MedicationError("Reminder times must be unique", 400);
  }
  input.times.forEach(timeParts);

  const startsOn = parseCalendarDate(input.startsOn);
  const endsOn = input.endsOn ? parseCalendarDate(input.endsOn) : undefined;
  if (endsOn && compareCalendarDates(endsOn, startsOn) < 0) {
    throw new MedicationError("Schedule end date must not be before start date", 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    if (agentActionId) {
      const existing = await tx.medicationSchedule.findUnique({
        where: { agentActionId },
      });
      if (existing) return { schedule: existing, reminderJobCount: 0 };
    }

    const medication = await tx.medication.findFirst({
      where: { id: medicationId, userId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!medication) throw new MedicationError("Active medication not found", 404);

    const schedule = await tx.medicationSchedule.create({
      data: {
        userId,
        medicationId: medication.id,
        timezone: input.timezone,
        times: [...input.times].sort(),
        startsOn: calendarDateToStorageDate(startsOn),
        endsOn: endsOn ? calendarDateToStorageDate(endsOn) : null,
        agentActionId,
      },
    });
    const jobs = buildUpcomingReminderJobs({
      scheduleId: schedule.id,
      medicationId: medication.id,
      userId,
      timezone: schedule.timezone,
      times: schedule.times,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
    });
    if (jobs.length > 0) {
      await tx.reminderJob.createMany({ data: jobs, skipDuplicates: true });
    }
    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEDICATION_SCHEDULE_CREATED",
        resourceType: "MedicationSchedule",
        resourceId: schedule.id,
        metadata: { reminderJobCount: jobs.length },
      },
    });
    return { schedule, reminderJobCount: jobs.length };
  });
  await syncReminderQueueForSchedule(result.schedule.id);
  return result;
}

export async function listMedicineSchedules(userId: string) {
  return prisma.medicationSchedule.findMany({
    where: { userId, status: "ACTIVE" },
    include: { medication: { select: { id: true, name: true, strength: true, form: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Rebuilds the durable reminder queue after a confirmed schedule edit. */
export async function updateMedicineSchedule(
  userId: string,
  scheduleId: string,
  input: UpdateMedicationScheduleInput,
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.medicationSchedule.findFirst({
      where: { id: scheduleId, userId, status: "ACTIVE" },
    });
    if (!current) throw new MedicationError("Active medication schedule not found", 404);
    const timezone = input.timezone ?? current.timezone;
    const times = input.times ?? current.times;
    const startsOn = input.startsOn ?? current.startsOn.toISOString().slice(0, 10);
    const endsOn = input.endsOn === undefined
      ? (current.endsOn?.toISOString().slice(0, 10))
      : input.endsOn ?? undefined;
    assertTimezone(timezone);
    if (times.length === 0 || new Set(times).size !== times.length) {
      throw new MedicationError("Reminder times must be unique", 400);
    }
    times.forEach(timeParts);
    const parsedStart = parseCalendarDate(startsOn);
    const parsedEnd = endsOn ? parseCalendarDate(endsOn) : undefined;
    if (parsedEnd && compareCalendarDates(parsedEnd, parsedStart) < 0) {
      throw new MedicationError("Schedule end date must not be before start date", 400);
    }
    const schedule = await tx.medicationSchedule.update({
      where: { id: current.id },
      data: {
        timezone,
        times: [...times].sort(),
        startsOn: calendarDateToStorageDate(parsedStart),
        endsOn: parsedEnd ? calendarDateToStorageDate(parsedEnd) : null,
      },
    });
    const previousJobs = await tx.reminderJob.findMany({
      where: { scheduleId: schedule.id, status: { in: ["PENDING", "PROCESSING"] } },
      select: { id: true },
    });
    // Pending jobs have no delivery record yet. Delete them so the unique
    // (scheduleId, scheduledFor) key cannot suppress a replacement at the
    // same wall-clock time after an edit; the old BullMQ jobs become stale.
    await tx.reminderJob.deleteMany({
      where: { id: { in: previousJobs.map((job) => job.id) } },
    });
    const jobs = buildUpcomingReminderJobs({
      scheduleId: schedule.id,
      medicationId: schedule.medicationId,
      userId,
      timezone: schedule.timezone,
      times: schedule.times,
      startsOn,
      ...(endsOn ? { endsOn } : {}),
    });
    if (jobs.length) await tx.reminderJob.createMany({ data: jobs, skipDuplicates: true });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEDICATION_SCHEDULE_UPDATED",
        resourceType: "MedicationSchedule",
        resourceId: schedule.id,
        metadata: { reminderJobCount: jobs.length },
      },
    });
    return { schedule, reminderJobCount: jobs.length, cancelledReminderJobIds: previousJobs.map((job) => job.id) };
  });
  await removeReminderQueueJobs(result.cancelledReminderJobIds);
  await syncReminderQueueForSchedule(result.schedule.id);
  return result;
}

export async function deleteMedicineSchedule(userId: string, scheduleId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const schedule = await tx.medicationSchedule.findFirst({
      where: { id: scheduleId, userId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!schedule) throw new MedicationError("Active medication schedule not found", 404);
    await tx.medicationSchedule.update({ where: { id: schedule.id }, data: { status: "ARCHIVED" } });
    const pending = await tx.reminderJob.findMany({
      where: { scheduleId: schedule.id, status: { in: ["PENDING", "PROCESSING"] } },
      select: { id: true },
    });
    await tx.reminderJob.updateMany({
      where: { id: { in: pending.map((job) => job.id) } },
      data: { status: "CANCELLED" },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEDICATION_SCHEDULE_DELETED",
        resourceType: "MedicationSchedule",
        resourceId: schedule.id,
      },
    });
    return pending.map((job) => job.id);
  });
  await removeReminderQueueJobs(result);
}
