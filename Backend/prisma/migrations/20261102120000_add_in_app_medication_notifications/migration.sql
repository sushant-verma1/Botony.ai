-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MEDICATION_REMINDER');

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "reminderJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppNotification_reminderJobId_key" ON "AppNotification"("reminderJobId");

-- CreateIndex
CREATE INDEX "AppNotification_userId_readAt_createdAt_idx" ON "AppNotification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_reminderJobId_fkey" FOREIGN KEY ("reminderJobId") REFERENCES "ReminderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
