-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
-- Postgres unique indexes permit unlimited NULLs, so every existing row and
-- every ordinary message stays NULL with no backfill. Only the first message
-- of a conversation created via POST /api/chat/message sets this, and the
-- index is what makes a retried request resolve to the same row instead of
-- creating a duplicate.
CREATE UNIQUE INDEX "Message_clientKey_key" ON "Message"("clientKey");
