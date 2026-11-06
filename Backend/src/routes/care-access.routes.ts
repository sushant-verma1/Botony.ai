import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { careInvitationResponseSchema, createCareInvitationSchema, caregiverReminderNotificationsSchema } from "../validation/validate.js";
import {
  careRecipientOverviewController,
  inviteCaregiverController,
  listCareLinksController,
  respondToCareInvitationController,
  revokeCareAccessController,
  setCaregiverMedicationReminderNotificationsController,
} from "../controllers/care-access.controller.js";

const careAccessRouter = Express.Router();

careAccessRouter.get("/", protect, listCareLinksController);
careAccessRouter.post("/invitations", protect, validate(createCareInvitationSchema), inviteCaregiverController);
careAccessRouter.post("/invitations/:id/respond", protect, validate(careInvitationResponseSchema), respondToCareInvitationController);
careAccessRouter.patch("/:id/medication-reminders", protect, validate(caregiverReminderNotificationsSchema), setCaregiverMedicationReminderNotificationsController);
careAccessRouter.delete("/:id", protect, revokeCareAccessController);
careAccessRouter.get("/recipients/:recipientId/overview", protect, careRecipientOverviewController);

export default careAccessRouter;
