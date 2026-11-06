-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MedicationScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DoseStatus" AS ENUM ('SCHEDULED', 'TAKEN', 'SKIPPED', 'MISSED');

-- CreateEnum
CREATE TYPE "ReminderJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DISPATCHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strength" TEXT,
    "form" TEXT,
    "instructions" TEXT,
    "status" "MedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationSchedule" (
    "id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "times" TEXT[] NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "status" "MedicationScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "medicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoseEvent" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "DoseStatus" NOT NULL DEFAULT 'SCHEDULED',
    "occurredAt" TIMESTAMP(3),
    "note" TEXT,
    "medicationId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderJob" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "medicationId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Medication_userId_status_updatedAt_idx" ON "Medication"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MedicationSchedule_userId_status_idx" ON "MedicationSchedule"("userId", "status");

-- CreateIndex
CREATE INDEX "MedicationSchedule_medicationId_status_idx" ON "MedicationSchedule"("medicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DoseEvent_scheduleId_scheduledFor_key" ON "DoseEvent"("scheduleId", "scheduledFor");

-- CreateIndex
CREATE INDEX "DoseEvent_userId_status_scheduledFor_idx" ON "DoseEvent"("userId", "status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderJob_scheduleId_scheduledFor_key" ON "ReminderJob"("scheduleId", "scheduledFor");

-- CreateIndex
CREATE INDEX "ReminderJob_status_scheduledFor_idx" ON "ReminderJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ReminderJob_userId_scheduledFor_idx" ON "ReminderJob"("userId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderJob" ADD CONSTRAINT "ReminderJob_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderJob" ADD CONSTRAINT "ReminderJob_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderJob" ADD CONSTRAINT "ReminderJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
