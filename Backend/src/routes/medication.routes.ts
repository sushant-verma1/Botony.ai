import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createDailyMedicationScheduleSchema,
  createMedicationSchema,
  updateMedicineScheduleSchema,
  updateMedicationInventorySchema,
} from "../validation/validate.js";
import {
  archiveMedicationController,
  createMedicationController,
  createMedicationScheduleController,
  deleteMedicineScheduleController,
  listMedicineSchedulesController,
  listMedicationsController,
  updateMedicineScheduleController,
  updateMedicationInventoryController,
} from "../controllers/medication.controller.js";

const medicationRouter = Express.Router();

medicationRouter.get("/", protect, listMedicationsController);
medicationRouter.get("/schedules", protect, listMedicineSchedulesController);
medicationRouter.post(
  "/",
  protect,
  validate(createMedicationSchema),
  createMedicationController,
);
medicationRouter.patch(
  "/schedules/:scheduleId",
  protect,
  validate(updateMedicineScheduleSchema),
  updateMedicineScheduleController,
);
medicationRouter.delete("/schedules/:scheduleId", protect, deleteMedicineScheduleController);
medicationRouter.patch(
  "/:id/inventory",
  protect,
  validate(updateMedicationInventorySchema),
  updateMedicationInventoryController,
);
medicationRouter.post(
  "/:id/schedules",
  protect,
  validate(createDailyMedicationScheduleSchema),
  createMedicationScheduleController,
);
medicationRouter.post("/:id/archive", protect, archiveMedicationController);

export default medicationRouter;
