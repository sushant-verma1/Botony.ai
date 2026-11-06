import type { Request, Response } from "express";
import {
  AgentActionError,
  confirmMedicationScheduleAction,
  draftMedicationScheduleFromRequest,
} from "../services/agent/medication-schedule-agent.service.js";
import { MedicationError } from "../services/medication.service.js";
import { createTemporalContext } from "../services/temporal-context.service.js";
import {
  confirmMedicineScheduleMutation,
  MedicineScheduleMutationError,
} from "../services/agent/medicine-schedule-mutation.service.js";

export async function draftMedicationScheduleController(
  req: Request,
  res: Response,
) {
  try {
    const result = await draftMedicationScheduleFromRequest(
      req.user.userId,
      req.body.request,
      { temporalContext: createTemporalContext(req.get("X-Botony-Timezone")) },
    );
    return res.status(result.kind === "proposal" ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof AgentActionError || error instanceof MedicationError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}

export async function confirmMedicationScheduleController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const result = await confirmMedicationScheduleAction(
      req.user.userId,
      req.params.id,
      req.body.confirmationToken,
      req.body.revision,
    );
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof AgentActionError || error instanceof MedicationError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}

export async function confirmMedicineScheduleMutationController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const result = await confirmMedicineScheduleMutation(
      req.user.userId,
      req.params.id,
      req.body.confirmationToken,
      req.body.revision,
    );
    return res.json(result);
  } catch (error) {
    if (error instanceof MedicineScheduleMutationError || error instanceof MedicationError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}
