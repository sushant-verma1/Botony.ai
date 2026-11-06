import "dotenv/config";
import "./instrument.js";
import app from "./src/app.js";
import { prisma } from "./src/config/db.js";
import { startAttachmentCleanup } from "./src/services/cleanup.scheduler.js";
import { startNotificationRealtimeSubscriber, stopNotificationRealtimeSubscriber } from "./src/services/notification-realtime.service.js";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // connect DB

    await prisma.$connect();
    console.log(" Database connected");

    // Periodically destroys uploads that were signed and pushed to
    // Cloudinary but never confirmed.
    startAttachmentCleanup();
    await startNotificationRealtimeSubscriber();
  } catch (error) {
    console.error(" Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

async function shutdown() {
  await stopNotificationRealtimeSubscriber();
  await prisma.$disconnect();
}
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
