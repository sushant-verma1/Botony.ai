import type { Request, Response } from "express";
import logger from "../services/logger.js";
import {
  MedicationError,
  archiveMedication,
  createDailyMedicationSchedule,
  createMedication,
  deleteMedicineSchedule,
  listMedicineSchedules,
  listMedications,
  updateMedicineSchedule,
  updateMedicationInventory,
} from "../services/medication.service.js";

export async function listMedicationsController(req: Request, res: Response) {
  const medications = await listMedications(req.user.userId);
  return res.json({ medications });
}

export async function createMedicationController(req: Request, res: Response) {
  const medication = await createMedication(req.user.userId, req.body);
  logger.info("Medication created", {
    userId: req.user.userId,
    medicationId: medication.id,
  });
  return res.status(201).json({ medication });
}

export async function archiveMedicationController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    await archiveMedication(req.user.userId, req.params.id);
    logger.info("Medication archived", {
      userId: req.user.userId,
      medicationId: req.params.id,
    });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof MedicationError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}

export async function createMedicationScheduleController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const result = await createDailyMedicationSchedule(
      req.user.userId,
      req.params.id,
      req.body,
    );
    logger.info("Medication schedule created", {
      userId: req.user.userId,
      medicationId: req.params.id,
      scheduleId: result.schedule.id,
      reminderJobCount: result.reminderJobCount,
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof MedicationError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}

export async function updateMedicationInventoryController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const medication = await updateMedicationInventory(req.user.userId, req.params.id, req.body);
    return res.json({ medication });
  } catch (error) {
    if (error instanceof MedicationError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
}

export async function listMedicineSchedulesController(req: Request, res: Response) {
  const schedules = await listMedicineSchedules(req.user.userId);
  return res.json({ schedules });
}

export async function updateMedicineScheduleController(
  req: Request<{ scheduleId: string }>,
  res: Response,
) {
  try {
    const result = await updateMedicineSchedule(req.user.userId, req.params.scheduleId, req.body);
    return res.json(result);
  } catch (error) {
    if (error instanceof MedicationError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
}

export async function deleteMedicineScheduleController(
  req: Request<{ scheduleId: string }>,
  res: Response,
) {
  try {
    await deleteMedicineSchedule(req.user.userId, req.params.scheduleId);
    return res.status(204).end();
  } catch (error) {
    if (error instanceof MedicationError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
}
