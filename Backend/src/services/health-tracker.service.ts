import { prisma } from "../config/db.js";

const MEASUREMENT_TYPES = [
  "BLOOD_PRESSURE",
  "BLOOD_GLUCOSE",
  "WEIGHT",
  "HEART_RATE",
  "TEMPERATURE",
  "CUSTOM",
] as const;

type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

export class HealthTrackerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface MeasurementInput {
  type: MeasurementType;
  label?: string;
  value: number;
  secondaryValue?: number;
  unit: string;
  measuredAt: string;
  note?: string;
}

export interface AppointmentInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  timezone: string;
  provider?: string;
  location?: string;
  note?: string;
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new HealthTrackerError("Invalid timezone", 400);
  }
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new HealthTrackerError(`${field} must be a number`, 400);
  }
}

/** These broad bounds reject accidental units/typos while accepting readings
 * that need clinician attention. They are not health advice or normal ranges. */
function assertMeasurementInput(input: MeasurementInput): void {
  assertFinite(input.value, "Value");
  if (input.value <= 0 || input.value > 100_000) {
    throw new HealthTrackerError("Value is outside the supported recording range", 400);
  }
  if (input.secondaryValue !== undefined) {
    assertFinite(input.secondaryValue, "Secondary value");
    if (input.secondaryValue <= 0 || input.secondaryValue > 100_000) {
      throw new HealthTrackerError("Secondary value is outside the supported recording range", 400);
    }
  }
  if (input.type === "BLOOD_PRESSURE" && input.secondaryValue === undefined) {
    throw new HealthTrackerError("Blood pressure needs systolic and diastolic values", 400);
  }
  if (input.type !== "BLOOD_PRESSURE" && input.secondaryValue !== undefined) {
    throw new HealthTrackerError("A secondary value is only supported for blood pressure", 400);
  }
  if (input.type === "CUSTOM" && !input.label?.trim()) {
    throw new HealthTrackerError("A custom measurement needs a label", 400);
  }
  if (!MEASUREMENT_TYPES.includes(input.type)) {
    throw new HealthTrackerError("Unsupported measurement type", 400);
  }
}

function parseDate(value: string, field: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new HealthTrackerError(`${field} must be a valid date and time`, 400);
  }
  return result;
}

export async function createHealthMeasurement(userId: string, input: MeasurementInput) {
  assertMeasurementInput(input);
  const measuredAt = parseDate(input.measuredAt, "Measured time");
  if (measuredAt > new Date()) {
    throw new HealthTrackerError("Measured time cannot be in the future", 400);
  }
  return prisma.$transaction(async (tx) => {
    const measurement = await tx.healthMeasurement.create({
      data: {
        userId,
        type: input.type,
        label: input.label?.trim() || null,
        value: input.value,
        secondaryValue: input.secondaryValue ?? null,
        unit: input.unit.trim(),
        measuredAt,
        note: input.note?.trim() || null,
      },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "HEALTH_MEASUREMENT_CREATED",
        resourceType: "HealthMeasurement",
        resourceId: measurement.id,
        metadata: { type: input.type },
      },
    });
    return measurement;
  });
}

export async function listHealthMeasurements(userId: string, limit = 100) {
  return prisma.healthMeasurement.findMany({
    where: { userId },
    orderBy: { measuredAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

export async function createHealthAppointment(userId: string, input: AppointmentInput) {
  assertTimezone(input.timezone);
  const startsAt = parseDate(input.startsAt, "Appointment start");
  const endsAt = input.endsAt ? parseDate(input.endsAt, "Appointment end") : undefined;
  if (endsAt && endsAt <= startsAt) {
    throw new HealthTrackerError("Appointment end must be after its start", 400);
  }
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.healthAppointment.create({
      data: {
        userId,
        title: input.title.trim(),
        startsAt,
        endsAt: endsAt ?? null,
        timezone: input.timezone.trim(),
        provider: input.provider?.trim() || null,
        location: input.location?.trim() || null,
        note: input.note?.trim() || null,
      },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "HEALTH_APPOINTMENT_CREATED",
        resourceType: "HealthAppointment",
        resourceId: appointment.id,
      },
    });
    return appointment;
  });
}

export async function listHealthAppointments(userId: string) {
  return prisma.healthAppointment.findMany({
    where: { userId },
    orderBy: { startsAt: "asc" },
    take: 100,
  });
}

/** A deterministic export-friendly snapshot. It repeats recorded facts but
 * never assigns a diagnosis, trend meaning, or treatment recommendation. */
export async function createClinicianSummary(userId: string) {
  const [measurements, appointments] = await Promise.all([
    listHealthMeasurements(userId, 30),
    listHealthAppointments(userId),
  ]);
  const measurementLines = measurements.map((measurement) => {
    const second = measurement.secondaryValue ? `/${measurement.secondaryValue}` : "";
    const label = measurement.label ? ` (${measurement.label})` : "";
    return `${measurement.measuredAt.toISOString()}: ${measurement.type}${label} — ${measurement.value}${second} ${measurement.unit}`;
  });
  const appointmentLines = appointments.slice(0, 15).map((appointment) =>
    `${appointment.startsAt.toISOString()}: ${appointment.title}${appointment.provider ? ` with ${appointment.provider}` : ""}`,
  );
  return {
    disclaimer: "This is a record summary, not a diagnosis or medical recommendation. Discuss readings and symptoms with a clinician.",
    measurements: measurementLines,
    appointments: appointmentLines,
  };
}
