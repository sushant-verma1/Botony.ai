import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { disablePushSubscriptionSchema, pushSubscriptionSchema } from "../validation/validate.js";
import {
  listUnreadNotificationsController,
  markNotificationReadController,
  streamNotificationsController,
  savePushSubscriptionController,
  disablePushSubscriptionController,
} from "../controllers/notification.controller.js";

const notificationRouter = Express.Router();

notificationRouter.get("/unread", protect, listUnreadNotificationsController);
notificationRouter.get("/stream", protect, streamNotificationsController);
notificationRouter.post("/:id/read", protect, markNotificationReadController);
notificationRouter.post("/push-subscriptions", protect, validate(pushSubscriptionSchema), savePushSubscriptionController);
notificationRouter.delete("/push-subscriptions", protect, validate(disablePushSubscriptionSchema), disablePushSubscriptionController);

export default notificationRouter;
