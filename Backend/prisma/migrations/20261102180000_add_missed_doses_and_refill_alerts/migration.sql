ALTER TYPE "NotificationType" ADD VALUE 'REFILL_ALERT';

ALTER TABLE "Medication" ADD COLUMN "quantityOnHand" INTEGER;
ALTER TABLE "Medication" ADD COLUMN "refillAt" INTEGER;
ALTER TABLE "Medication" ADD COLUMN "refillAlertedAt" TIMESTAMP(3);
ALTER TABLE "AppNotification" ADD COLUMN "medicationId" TEXT;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
