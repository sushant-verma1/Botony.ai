import type { Response } from "express";
import { Redis } from "ioredis";
import { redisUrl } from "../config/config.js";
import { sendEvent } from "../utils/sse.util.js";
import logger from "./logger.js";

export const REMINDER_NOTIFICATION_CHANNEL = "botony:notification-events";

export interface RealtimeNotification {
  id: string;
  type: "MEDICATION_REMINDER" | "CAREGIVER_MEDICATION_REMINDER" | "REFILL_ALERT";
  title: string;
  body: string;
  createdAt: Date;
  reminderJobId: string | null;
  userId: string;
}

const streams = new Map<string, Set<Response>>();
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function emitLocal(notification: RealtimeNotification): void {
  const userStreams = streams.get(notification.userId);
  if (!userStreams) return;
  const { userId: _userId, ...payload } = notification;
  for (const res of userStreams) sendEvent(res, "notification", payload);
}

function getPublisher(): Redis {
  publisher ??= new Redis(redisUrl, { maxRetriesPerRequest: null });
  return publisher;
}

export function registerNotificationStream(userId: string, res: Response): () => void {
  const userStreams = streams.get(userId) ?? new Set<Response>();
  userStreams.add(res);
  streams.set(userId, userStreams);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": keep-alive\n\n");
  }, 25_000);
  heartbeat.unref();
  return () => {
    clearInterval(heartbeat);
    userStreams.delete(res);
    if (userStreams.size === 0) streams.delete(userId);
  };
}

export async function publishNotification(notification: RealtimeNotification): Promise<void> {
  await getPublisher().publish(REMINDER_NOTIFICATION_CHANNEL, JSON.stringify(notification));
}

/** Called by API instances only; workers only publish to the Redis channel. */
export async function startNotificationRealtimeSubscriber(): Promise<void> {
  if (subscriber) return;
  subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  subscriber.on("message", (_channel, raw) => {
    try {
      const notification = JSON.parse(raw) as RealtimeNotification;
      emitLocal({ ...notification, createdAt: new Date(notification.createdAt) });
    } catch (error) {
      logger.error("Could not process real-time notification event", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  });
  await subscriber.subscribe(REMINDER_NOTIFICATION_CHANNEL);
}

export async function stopNotificationRealtimeSubscriber(): Promise<void> {
  await subscriber?.quit();
  await publisher?.quit();
  subscriber = null;
  publisher = null;
}
