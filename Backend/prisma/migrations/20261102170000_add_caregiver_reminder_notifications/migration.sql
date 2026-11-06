-- This migration may be retried after a previous non-transactional attempt
-- stopped while dropping the old unique index. Keep the statements that run
-- before that point safe to apply again.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CAREGIVER_MEDICATION_REMINDER';

ALTER TABLE "CareAccess" ADD COLUMN IF NOT EXISTS "medicationReminderNotifications" BOOLEAN NOT NULL DEFAULT false;

-- The previous migration created this as a unique index, not a constraint.
DROP INDEX IF EXISTS "AppNotification_reminderJobId_key";
ALTER TABLE "AppNotification" ALTER COLUMN "reminderJobId" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AppNotification_reminderJobId_userId_key" ON "AppNotification"("reminderJobId", "userId");
