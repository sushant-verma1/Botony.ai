ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "AgentRun"
  ADD COLUMN IF NOT EXISTS "pendingArguments" JSONB,
  ADD COLUMN IF NOT EXISTS "missingFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

ALTER TABLE "AgentAction"
  ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "AgentRun_userId_conversationId_status_expiresAt_idx"
  ON "AgentRun"("userId", "conversationId", "status", "expiresAt");
