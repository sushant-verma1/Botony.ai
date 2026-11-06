import type { Request, Response } from "express";
import { MedicationError } from "../services/medication.service.js";
import { listDoseHistory, listDueReminderJobs, logReminderDose } from "../services/reminder.service.js";

export async function listDueRemindersController(req: Request, res: Response) {
  const reminders = await listDueReminderJobs(req.user.userId);
  return res.json({ reminders });
}

export async function listDoseHistoryController(req: Request, res: Response) {
  const doses = await listDoseHistory(req.user.userId);
  return res.json({ doses });
}

export async function logReminderDoseController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const doseEvent = await logReminderDose(
      req.user.userId,
      req.params.id,
      req.body.status,
      req.body.occurredAt ?? new Date(),
      req.body.note,
    );
    return res.status(201).json({ doseEvent });
  } catch (error) {
    if (error instanceof MedicationError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}
