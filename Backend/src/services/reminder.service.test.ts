import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/db.js", () => ({
  prisma: {
    reminderJob: { findMany: vi.fn() },
    doseEvent: { updateMany: vi.fn() },
    appNotification: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("./logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "../config/db.js";
import {
  dispatchDueInAppReminders,
  logReminderDose,
  listDueReminderJobs,
  reconcileMissedDoseEvents,
  listUnreadNotifications,
} from "./reminder.service.js";

describe("reminder service", () => {
  beforeEach(() => {
    vi.mocked(prisma.reminderJob.findMany).mockReset();
    vi.mocked(prisma.appNotification.findMany).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.doseEvent.updateMany).mockReset();
  });

  it("loads only the caller's pending reminders that are due", async () => {
    vi.mocked(prisma.reminderJob.findMany).mockResolvedValue([] as never);
    const now = new Date("2026-11-02T10:00:00.000Z");

    await listDueReminderJobs("user-1", now);

    expect(prisma.reminderJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          status: "PENDING",
          scheduledFor: { lte: now },
        },
      }),
    );
  });

  it("rejects future dose logging before any database action", async () => {
    await expect(
      logReminderDose(
        "user-1",
        "job-1",
        "TAKEN",
        new Date(Date.now() + 10 * 60_000),
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("loads only unread notifications belonging to the caller", async () => {
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue([] as never);

    await listUnreadNotifications("user-1");

    expect(prisma.appNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", readAt: null } }),
    );
  });

  it("does nothing when no reminder jobs are due", async () => {
    vi.mocked(prisma.reminderJob.findMany).mockResolvedValue([] as never);

    await expect(dispatchDueInAppReminders(new Date("2026-11-02T10:00:00.000Z"))).resolves.toEqual({
      candidates: 0,
      dispatched: 0,
    });
  });

  it("marks only long-unrecorded scheduled doses as missed", async () => {
    vi.mocked(prisma.doseEvent.updateMany).mockResolvedValue({ count: 2 } as never);
    const now = new Date("2026-11-02T12:00:00.000Z");

    await expect(reconcileMissedDoseEvents(now)).resolves.toEqual({ markedMissed: 2 });
    expect(prisma.doseEvent.updateMany).toHaveBeenCalledWith({
      where: { status: "SCHEDULED", scheduledFor: { lte: new Date("2026-11-02T06:00:00.000Z") } },
      data: { status: "MISSED" },
    });
  });
});
