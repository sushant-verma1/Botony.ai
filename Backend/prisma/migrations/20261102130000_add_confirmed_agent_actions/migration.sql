-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'EXECUTED', 'REJECTED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "confirmationTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resultResourceId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "MedicationSchedule" ADD COLUMN "agentActionId" TEXT;

-- CreateIndex
CREATE INDEX "AgentAction_userId_status_expiresAt_idx" ON "AgentAction"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentAction_agentRunId_idx" ON "AgentAction"("agentRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationSchedule_agentActionId_key" ON "MedicationSchedule"("agentActionId");

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_agentActionId_fkey" FOREIGN KEY ("agentActionId") REFERENCES "AgentAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
