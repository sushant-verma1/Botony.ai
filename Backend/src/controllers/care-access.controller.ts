import type { Request, Response } from "express";
import {
  CareAccessError,
  getCareRecipientOverview,
  inviteCaregiver,
  listCareLinks,
  respondToCareInvitation,
  revokeCareAccess,
  setCaregiverMedicationReminderNotifications,
} from "../services/care-access.service.js";

function respondToError(error: unknown, res: Response) {
  if (error instanceof CareAccessError) return res.status(error.status).json({ message: error.message });
  throw error;
}

export async function inviteCaregiverController(req: Request, res: Response) {
  try {
    const access = await inviteCaregiver(req.user.userId, req.body.email, req.body.permissions);
    return res.status(201).json({ access });
  } catch (error) { return respondToError(error, res); }
}

export async function listCareLinksController(req: Request, res: Response) {
  return res.json(await listCareLinks(req.user.userId));
}

export async function respondToCareInvitationController(req: Request<{ id: string }>, res: Response) {
  try {
    const access = await respondToCareInvitation(req.user.userId, req.params.id, req.body.accept);
    return res.json({ access });
  } catch (error) { return respondToError(error, res); }
}

export async function revokeCareAccessController(req: Request<{ id: string }>, res: Response) {
  try {
    await revokeCareAccess(req.user.userId, req.params.id);
    return res.status(204).end();
  } catch (error) { return respondToError(error, res); }
}

export async function setCaregiverMedicationReminderNotificationsController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const access = await setCaregiverMedicationReminderNotifications(
      req.user.userId,
      req.params.id,
      req.body.enabled,
    );
    return res.json({ access });
  } catch (error) { return respondToError(error, res); }
}

export async function careRecipientOverviewController(req: Request<{ recipientId: string }>, res: Response) {
  try {
    return res.json({ overview: await getCareRecipientOverview(req.user.userId, req.params.recipientId) });
  } catch (error) { return respondToError(error, res); }
}
