import webpush from "web-push";
import { vapidPrivateKey, vapidPublicKey, vapidSubject } from "../config/config.js";
import { prisma } from "../config/db.js";
import logger from "./logger.js";
import type { RealtimeNotification } from "./notification-realtime.service.js";

const enabled = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);
if (enabled) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null },
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      enabled: true,
    },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
    },
  });
}

export async function disablePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.updateMany({ where: { userId, endpoint }, data: { enabled: false } });
}

export async function sendPushNotification(notification: RealtimeNotification): Promise<void> {
  if (!enabled) return;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: notification.userId, enabled: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          reminderJobId: notification.reminderJobId,
        }),
      );
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode) : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { enabled: false } });
        return;
      }
      logger.error("Could not send browser push notification", {
        notificationId: notification.id,
        userId: notification.userId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }));
}
