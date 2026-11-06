import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  confirmAgentActionSchema,
  draftMedicationScheduleSchema,
} from "../validation/validate.js";
import {
  confirmMedicationScheduleController,
  confirmMedicineScheduleMutationController,
  draftMedicationScheduleController,
} from "../controllers/agent.controller.js";

const agentRouter = Express.Router();

agentRouter.post(
  "/medication-schedule/draft",
  protect,
  validate(draftMedicationScheduleSchema),
  draftMedicationScheduleController,
);
agentRouter.post(
  "/medication-schedule/:id/confirm",
  protect,
  validate(confirmAgentActionSchema),
  confirmMedicationScheduleController,
);
agentRouter.post(
  "/medicine-schedule-action/:id/confirm",
  protect,
  validate(confirmAgentActionSchema),
  confirmMedicineScheduleMutationController,
);

export default agentRouter;
