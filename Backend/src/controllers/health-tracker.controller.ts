import type { Request, Response } from "express";
import {
  HealthTrackerError,
  createClinicianSummary,
  createHealthAppointment,
  createHealthMeasurement,
  listHealthAppointments,
  listHealthMeasurements,
} from "../services/health-tracker.service.js";

function handleError(error: unknown, res: Response) {
  if (error instanceof HealthTrackerError) {
    return res.status(error.status).json({ message: error.message });
  }
  throw error;
}

export async function createMeasurementController(req: Request, res: Response) {
  try {
    const measurement = await createHealthMeasurement(req.user.userId, req.body);
    return res.status(201).json({ measurement });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function listMeasurementsController(req: Request, res: Response) {
  const measurements = await listHealthMeasurements(req.user.userId);
  return res.json({ measurements });
}

export async function createAppointmentController(req: Request, res: Response) {
  try {
    const appointment = await createHealthAppointment(req.user.userId, req.body);
    return res.status(201).json({ appointment });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function listAppointmentsController(req: Request, res: Response) {
  const appointments = await listHealthAppointments(req.user.userId);
  return res.json({ appointments });
}

export async function clinicianSummaryController(req: Request, res: Response) {
  const summary = await createClinicianSummary(req.user.userId);
  return res.json({ summary });
}
