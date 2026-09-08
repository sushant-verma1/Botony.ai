import { attachmentCleanupIntervalMs } from "../config/config.js";
import { sweepAbandonedAttachments } from "./attachment.service.js";
import logger from "./logger.js";

let timer: NodeJS.Timeout | null = null;

async function runPass(): Promise<void> {
  try {
    await sweepAbandonedAttachments();
  } catch (error) {
    // Cleanup is best-effort background work: a failed pass is logged and
    // retried on the next tick, never allowed to take the process down.
    logger.error("Attachment cleanup pass failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Starts the periodic sweep of abandoned PENDING uploads. Set
 * ATTACHMENT_CLEANUP_INTERVAL_MS=0 to disable this and run
 * `npm run cleanup:attachments` from an external cron instead (the right
 * choice when running more than one instance, so the sweep isn't duplicated).
 */
export function startAttachmentCleanup(): NodeJS.Timeout | null {
  if (attachmentCleanupIntervalMs <= 0) {
    logger.info("Attachment cleanup timer disabled (interval is 0)");
    return null;
  }
  if (timer) return timer;

  void runPass();
  timer = setInterval(() => void runPass(), attachmentCleanupIntervalMs);
  // Don't hold the event loop open on shutdown.
  timer.unref();

  logger.info("Attachment cleanup scheduled", {
    intervalMs: attachmentCleanupIntervalMs,
  });
  return timer;
}

export function stopAttachmentCleanup(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
