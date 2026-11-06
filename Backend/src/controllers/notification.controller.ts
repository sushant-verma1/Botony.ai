import type { Request, Response } from "express";
import { openEventStream, sendEvent } from "../utils/sse.util.js";
import { registerNotificationStream } from "../services/notification-realtime.service.js";
import { disablePushSubscription, savePushSubscription } from "../services/web-push.service.js";
import {
  MedicationError,
} from "../services/medication.service.js";
import {
  listUnreadNotifications,
  markNotificationRead,
} from "../services/reminder.service.js";

export async function listUnreadNotificationsController(
  req: Request,
  res: Response,
) {
  const notifications = await listUnreadNotifications(req.user.userId);
  return res.json({ notifications });
}

export async function markNotificationReadController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    await markNotificationRead(req.user.userId, req.params.id);
    return res.status(204).end();
  } catch (error) {
    if (error instanceof MedicationError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}

export async function streamNotificationsController(req: Request, res: Response) {
  openEventStream(res);
  const unregister = registerNotificationStream(req.user.userId, res);
  const notifications = await listUnreadNotifications(req.user.userId);
  for (const notification of notifications) sendEvent(res, "notification", notification);
  req.on("close", unregister);
}

export async function savePushSubscriptionController(req: Request, res: Response) {
  const subscription = await savePushSubscription(req.user.userId, req.body);
  return res.status(201).json({ subscription: { id: subscription.id, endpoint: subscription.endpoint } });
}

export async function disablePushSubscriptionController(req: Request, res: Response) {
  await disablePushSubscription(req.user.userId, req.body.endpoint);
  return res.status(204).end();
}
