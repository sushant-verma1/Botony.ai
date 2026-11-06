import { describe, expect, it, vi } from "vitest";

vi.mock("../config/db.js", () => ({ prisma: {} }));

import {
  MedicationError,
  buildUpcomingReminderJobs,
  localScheduleTimeToUtc,
} from "./medication.service.js";

describe("medication schedule time calculation", () => {
  it("converts a local reminder time to UTC using the schedule timezone", () => {
    const utc = localScheduleTimeToUtc(
      { year: 2026, month: 11, day: 2 },
      "08:00",
      "Asia/Kolkata",
    );

    expect(utc.toISOString()).toBe("2026-11-02T02:30:00.000Z");
  });

  it("rejects a local time skipped by daylight saving time", () => {
    expect(() =>
      localScheduleTimeToUtc(
        { year: 2026, month: 3, day: 8 },
        "02:30",
        "America/New_York",
      ),
    ).toThrow(MedicationError);
  });

  it("rejects an ambiguous local time repeated by daylight saving time", () => {
    expect(() =>
      localScheduleTimeToUtc(
        { year: 2026, month: 11, day: 1 },
        "01:30",
        "America/New_York",
      ),
    ).toThrow("occurs twice");
  });

  it("materializes only future reminder jobs inside the configured horizon", () => {
    const jobs = buildUpcomingReminderJobs(
      {
        scheduleId: "schedule-1",
        medicationId: "medication-1",
        userId: "user-1",
        timezone: "Asia/Kolkata",
        times: ["08:00", "20:00"],
        startsOn: "2026-11-02",
      },
      new Date("2026-11-02T03:00:00.000Z"),
      2,
    );

    expect(jobs.map((job) => job.scheduledFor.toISOString())).toEqual([
      "2026-11-02T14:30:00.000Z",
      "2026-11-03T02:30:00.000Z",
      "2026-11-03T14:30:00.000Z",
    ]);
  });

  it("does not materialize jobs after the schedule end date", () => {
    const jobs = buildUpcomingReminderJobs(
      {
        scheduleId: "schedule-1",
        medicationId: "medication-1",
        userId: "user-1",
        timezone: "UTC",
        times: ["08:00"],
        startsOn: "2026-11-02",
        endsOn: "2026-11-02",
      },
      new Date("2026-11-01T00:00:00.000Z"),
      7,
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0].scheduledFor.toISOString()).toBe(
      "2026-11-02T08:00:00.000Z",
    );
  });
});
