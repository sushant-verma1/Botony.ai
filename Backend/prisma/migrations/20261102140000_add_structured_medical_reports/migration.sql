-- CreateEnum
CREATE TYPE "MedicalReportStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "LabObservationFlag" AS ENUM ('NORMAL', 'HIGH', 'LOW', 'UNKNOWN');

-- CreateTable
CREATE TABLE "MedicalReport" (
    "id" TEXT NOT NULL,
    "status" "MedicalReportStatus" NOT NULL DEFAULT 'PROCESSING',
    "explanation" TEXT,
    "questions" JSONB,
    "uncertainties" JSONB,
    "attachmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabObservation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "referenceRange" TEXT,
    "flag" "LabObservationFlag" NOT NULL DEFAULT 'UNKNOWN',
    "sourcePage" INTEGER,
    "reportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalReport_attachmentId_key" ON "MedicalReport"("attachmentId");

-- CreateIndex
CREATE INDEX "MedicalReport_userId_updatedAt_idx" ON "MedicalReport"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "LabObservation_reportId_idx" ON "LabObservation"("reportId");

-- AddForeignKey
ALTER TABLE "MedicalReport" ADD CONSTRAINT "MedicalReport_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalReport" ADD CONSTRAINT "MedicalReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabObservation" ADD CONSTRAINT "LabObservation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MedicalReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
