import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createHealthAppointmentSchema,
  createHealthMeasurementSchema,
} from "../validation/validate.js";
import {
  clinicianSummaryController,
  createAppointmentController,
  createMeasurementController,
  listAppointmentsController,
  listMeasurementsController,
} from "../controllers/health-tracker.controller.js";

const healthTrackerRouter = Express.Router();

healthTrackerRouter.get("/measurements", protect, listMeasurementsController);
healthTrackerRouter.post("/measurements", protect, validate(createHealthMeasurementSchema), createMeasurementController);
healthTrackerRouter.get("/appointments", protect, listAppointmentsController);
healthTrackerRouter.post("/appointments", protect, validate(createHealthAppointmentSchema), createAppointmentController);
healthTrackerRouter.get("/clinician-summary", protect, clinicianSummaryController);

export default healthTrackerRouter;
