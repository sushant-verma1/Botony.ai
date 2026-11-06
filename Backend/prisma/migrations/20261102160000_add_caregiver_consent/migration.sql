CREATE TYPE "CarePermission" AS ENUM ('VIEW_MEDICATIONS', 'VIEW_MEDICATION_SCHEDULES', 'VIEW_HEALTH_MEASUREMENTS', 'VIEW_APPOINTMENTS', 'VIEW_REPORT_SUMMARIES');
CREATE TYPE "CareAccessStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED');

CREATE TABLE "CareAccess" (
    "id" TEXT NOT NULL,
    "status" "CareAccessStatus" NOT NULL DEFAULT 'PENDING',
    "permissions" "CarePermission"[],
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "recipientId" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareAccess_recipientId_caregiverId_key" ON "CareAccess"("recipientId", "caregiverId");
CREATE INDEX "CareAccess_caregiverId_status_idx" ON "CareAccess"("caregiverId", "status");
CREATE INDEX "CareAccess_recipientId_status_idx" ON "CareAccess"("recipientId", "status");
ALTER TABLE "CareAccess" ADD CONSTRAINT "CareAccess_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareAccess" ADD CONSTRAINT "CareAccess_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
