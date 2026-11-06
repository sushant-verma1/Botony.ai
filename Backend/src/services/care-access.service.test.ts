import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({ prismaMock: {
  user: { findUnique: vi.fn() },
  careAccess: { findUnique: vi.fn(), findFirst: vi.fn() },
} }));

vi.mock("../config/db.js", () => ({ prisma: prismaMock }));

import {
  getCareRecipientOverview,
  inviteCaregiver,
  setCaregiverMedicationReminderNotifications,
} from "./care-access.service.js";

describe("care access consent boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not allow someone to invite themselves as a caregiver", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "patient-1" });

    await expect(
      inviteCaregiver("patient-1", "patient@example.com", ["VIEW_APPOINTMENTS"]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("does not disclose whether an email has an account", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      inviteCaregiver("patient-1", "unknown@example.com", ["VIEW_APPOINTMENTS"]),
    ).rejects.toMatchObject({ message: "This invitation could not be created", status: 400 });
  });

  it("blocks an overview unless an active consented relationship exists", async () => {
    prismaMock.careAccess.findFirst.mockResolvedValue(null);

    await expect(getCareRecipientOverview("caregiver-1", "patient-1")).rejects.toMatchObject({
      message: "Care access is not active",
      status: 403,
    });
  });

  it("requires medication sharing before a recipient can enable caregiver reminder delivery", async () => {
    prismaMock.careAccess.findFirst.mockResolvedValue({
      id: "access-1",
      permissions: ["VIEW_APPOINTMENTS"],
    });

    await expect(
      setCaregiverMedicationReminderNotifications("patient-1", "access-1", true),
    ).rejects.toMatchObject({ status: 400 });
  });
});
