import { prisma } from "../config/db.js";

const CARE_PERMISSIONS = [
  "VIEW_MEDICATIONS",
  "VIEW_MEDICATION_SCHEDULES",
  "VIEW_HEALTH_MEASUREMENTS",
  "VIEW_APPOINTMENTS",
  "VIEW_REPORT_SUMMARIES",
] as const;

type CarePermission = (typeof CARE_PERMISSIONS)[number];

export class CareAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function hasPermission(permissions: readonly string[], permission: CarePermission) {
  return permissions.includes(permission);
}

export async function inviteCaregiver(
  recipientId: string,
  caregiverEmail: string,
  permissions: CarePermission[],
) {
  const caregiver = await prisma.user.findUnique({
    where: { email: caregiverEmail.trim().toLowerCase() },
    select: { id: true },
  });
  // Do not reveal whether a particular email address has an account.
  if (!caregiver || caregiver.id === recipientId) {
    throw new CareAccessError("This invitation could not be created", 400);
  }
  const existing = await prisma.careAccess.findUnique({
    where: { recipientId_caregiverId: { recipientId, caregiverId: caregiver.id } },
    select: { id: true, status: true },
  });
  if (existing?.status === "ACTIVE" || existing?.status === "PENDING") {
    throw new CareAccessError("A care invitation already exists for this person", 409);
  }
  return prisma.$transaction(async (tx) => {
    const access = existing
      ? await tx.careAccess.update({
          where: { id: existing.id },
          data: { status: "PENDING", permissions, acceptedAt: null, revokedAt: null },
        })
      : await tx.careAccess.create({
          data: { recipientId, caregiverId: caregiver.id, permissions },
        });
    await tx.auditEvent.create({
      data: {
        userId: recipientId,
        action: "CARE_INVITATION_CREATED",
        resourceType: "CareAccess",
        resourceId: access.id,
        metadata: { permissions },
      },
    });
    return access;
  });
}

export async function listCareLinks(userId: string) {
  const [asRecipient, asCaregiver] = await Promise.all([
    prisma.careAccess.findMany({
      where: { recipientId: userId },
      include: { caregiver: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.careAccess.findMany({
      where: { caregiverId: userId },
      include: { recipient: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { asRecipient, asCaregiver };
}

export async function respondToCareInvitation(caregiverId: string, accessId: string, accept: boolean) {
  const access = await prisma.careAccess.findFirst({
    where: { id: accessId, caregiverId, status: "PENDING" },
    select: { id: true, recipientId: true },
  });
  if (!access) throw new CareAccessError("Care invitation not found", 404);
  return prisma.$transaction(async (tx) => {
    const result = await tx.careAccess.update({
      where: { id: access.id },
      data: accept
        ? { status: "ACTIVE", acceptedAt: new Date() }
        : { status: "REJECTED" },
    });
    await tx.auditEvent.create({
      data: {
        userId: caregiverId,
        action: accept ? "CARE_INVITATION_ACCEPTED" : "CARE_INVITATION_REJECTED",
        resourceType: "CareAccess",
        resourceId: access.id,
        metadata: { recipientId: access.recipientId },
      },
    });
    return result;
  });
}

export async function revokeCareAccess(userId: string, accessId: string) {
  const access = await prisma.careAccess.findFirst({
    where: { id: accessId, OR: [{ recipientId: userId }, { caregiverId: userId }] },
    select: { id: true, status: true },
  });
  if (!access) throw new CareAccessError("Care access not found", 404);
  if (access.status !== "ACTIVE" && access.status !== "PENDING") {
    throw new CareAccessError("Care access is already closed", 409);
  }
  return prisma.$transaction(async (tx) => {
    const result = await tx.careAccess.update({
      where: { id: access.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "CARE_ACCESS_REVOKED",
        resourceType: "CareAccess",
        resourceId: access.id,
      },
    });
    return result;
  });
}

/** Only the care recipient can opt a caregiver into reminder notifications.
 * Medication visibility is required because reminder text names the medicine. */
export async function setCaregiverMedicationReminderNotifications(
  recipientId: string,
  accessId: string,
  enabled: boolean,
) {
  const access = await prisma.careAccess.findFirst({
    where: { id: accessId, recipientId, status: "ACTIVE" },
    select: { id: true, permissions: true },
  });
  if (!access) throw new CareAccessError("Active care access not found", 404);
  if (enabled && !hasPermission(access.permissions, "VIEW_MEDICATIONS")) {
    throw new CareAccessError("Medication access is required for reminder notifications", 400);
  }
  return prisma.$transaction(async (tx) => {
    const result = await tx.careAccess.update({
      where: { id: access.id },
      data: { medicationReminderNotifications: enabled },
    });
    await tx.auditEvent.create({
      data: {
        userId: recipientId,
        action: enabled ? "CAREGIVER_MEDICATION_REMINDERS_ENABLED" : "CAREGIVER_MEDICATION_REMINDERS_DISABLED",
        resourceType: "CareAccess",
        resourceId: access.id,
      },
    });
    return result;
  });
}

export async function getCareRecipientOverview(caregiverId: string, recipientId: string) {
  const access = await prisma.careAccess.findFirst({
    where: { caregiverId, recipientId, status: "ACTIVE" },
    include: { recipient: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!access) throw new CareAccessError("Care access is not active", 403);

  const permissions = access.permissions;
  const [medications, measurements, appointments, reports] = await Promise.all([
    hasPermission(permissions, "VIEW_MEDICATIONS")
      ? prisma.medication.findMany({
          where: { userId: recipientId, status: "ACTIVE" },
          select: {
            id: true, name: true, strength: true, form: true,
            ...(hasPermission(permissions, "VIEW_MEDICATION_SCHEDULES")
              ? { schedules: { where: { status: "ACTIVE" }, select: { times: true, timezone: true, startsOn: true, endsOn: true } } }
              : {}),
          },
        })
      : Promise.resolve(undefined),
    hasPermission(permissions, "VIEW_HEALTH_MEASUREMENTS")
      ? prisma.healthMeasurement.findMany({
          where: { userId: recipientId }, orderBy: { measuredAt: "desc" }, take: 30,
          select: { type: true, label: true, value: true, secondaryValue: true, unit: true, measuredAt: true, note: true },
        })
      : Promise.resolve(undefined),
    hasPermission(permissions, "VIEW_APPOINTMENTS")
      ? prisma.healthAppointment.findMany({
          where: { userId: recipientId }, orderBy: { startsAt: "asc" }, take: 30,
          select: { title: true, startsAt: true, endsAt: true, timezone: true, provider: true, location: true, note: true },
        })
      : Promise.resolve(undefined),
    hasPermission(permissions, "VIEW_REPORT_SUMMARIES")
      ? prisma.medicalReport.findMany({
          where: { userId: recipientId, status: "READY" }, orderBy: { updatedAt: "desc" }, take: 10,
          select: { id: true, explanation: true, questions: true, uncertainties: true, updatedAt: true },
        })
      : Promise.resolve(undefined),
  ]);
  await prisma.auditEvent.create({
    data: {
      userId: caregiverId,
      action: "CARE_RECIPIENT_OVERVIEW_VIEWED",
      resourceType: "CareAccess",
      resourceId: access.id,
      metadata: { recipientId, permissions },
    },
  });
  return { recipient: access.recipient, permissions, medications, measurements, appointments, reports };
}

export { CARE_PERMISSIONS };
