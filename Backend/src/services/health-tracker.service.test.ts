import { describe, expect, it, vi } from "vitest";

vi.mock("../config/db.js", () => ({ prisma: {} }));

import {
  HealthTrackerError,
  createHealthAppointment,
  createHealthMeasurement,
} from "./health-tracker.service.js";

describe("health tracker input safety", () => {
  it("requires both blood-pressure values", async () => {
    await expect(
      createHealthMeasurement("user-1", {
        type: "BLOOD_PRESSURE",
        value: 120,
        unit: "mmHg",
        measuredAt: "2026-01-01T10:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(HealthTrackerError);
  });

  it("does not attach a second value to a single-value measurement", async () => {
    await expect(
      createHealthMeasurement("user-1", {
        type: "HEART_RATE",
        value: 70,
        secondaryValue: 20,
        unit: "bpm",
        measuredAt: "2026-01-01T10:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(HealthTrackerError);
  });

  it("requires custom measurements to identify what is being recorded", async () => {
    await expect(
      createHealthMeasurement("user-1", {
        type: "CUSTOM",
        value: 1,
        unit: "unit",
        measuredAt: "2026-01-01T10:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(HealthTrackerError);
  });

  it("rejects appointments whose end precedes their start", async () => {
    await expect(
      createHealthAppointment("user-1", {
        title: "Follow-up",
        startsAt: "2026-04-10T11:00:00.000Z",
        endsAt: "2026-04-10T10:00:00.000Z",
        timezone: "Asia/Kolkata",
      }),
    ).rejects.toBeInstanceOf(HealthTrackerError);
  });
});
