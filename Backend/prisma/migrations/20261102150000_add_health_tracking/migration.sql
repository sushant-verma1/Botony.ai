-- Patient-entered health tracking. Values are deliberately stored without
-- normal-range flags or diagnostic fields.
CREATE TYPE "HealthMeasurementType" AS ENUM ('BLOOD_PRESSURE', 'BLOOD_GLUCOSE', 'WEIGHT', 'HEART_RATE', 'TEMPERATURE', 'CUSTOM');

CREATE TABLE "HealthMeasurement" (
    "id" TEXT NOT NULL,
    "type" "HealthMeasurementType" NOT NULL,
    "label" TEXT,
    "value" DECIMAL(12,3) NOT NULL,
    "secondaryValue" DECIMAL(12,3),
    "unit" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthAppointment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "provider" TEXT,
    "location" TEXT,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthMeasurement_userId_type_measuredAt_idx" ON "HealthMeasurement"("userId", "type", "measuredAt");
CREATE INDEX "HealthAppointment_userId_startsAt_idx" ON "HealthAppointment"("userId", "startsAt");
ALTER TABLE "HealthMeasurement" ADD CONSTRAINT "HealthMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
