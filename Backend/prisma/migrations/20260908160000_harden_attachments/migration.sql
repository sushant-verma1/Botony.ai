-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "scanner" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_status_createdAt_idx" ON "Attachment"("status", "createdAt");

-- Last line of defence for "a PENDING attachment can never be consumed":
-- an attachment can only be bound to a message once it is READY, enforced by
-- the database rather than only by application code. Prisma does not model
-- CHECK constraints, so this statement is hand-written and will not appear in
-- future `prisma migrate diff` output (nor will it be dropped by it).
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_bound_requires_ready"
  CHECK ("messageId" IS NULL OR "status" = 'READY');
