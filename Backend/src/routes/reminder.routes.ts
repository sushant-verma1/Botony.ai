import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { logReminderDoseSchema } from "../validation/validate.js";
import {
  listDueRemindersController,
  listDoseHistoryController,
  logReminderDoseController,
} from "../controllers/reminder.controller.js";

const reminderRouter = Express.Router();

reminderRouter.get("/due", protect, listDueRemindersController);
reminderRouter.get("/history", protect, listDoseHistoryController);
reminderRouter.post(
  "/:id/dose-event",
  protect,
  validate(logReminderDoseSchema),
  logReminderDoseController,
);

export default reminderRouter;
