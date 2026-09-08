// Standalone entry point for running the abandoned-upload sweep from an
// external cron/scheduled job: `npm run cleanup:attachments`.
// Use this instead of the in-process timer when running multiple instances.
import "dotenv/config";
import { sweepAbandonedAttachments } from "../src/services/attachment.service.js";
import { prisma } from "../src/config/db.js";

const summary = await sweepAbandonedAttachments();
console.log(JSON.stringify(summary));
await prisma.$disconnect();
