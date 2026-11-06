import type { Request, Response } from "express";
import {
  ReportError,
  analyzeReportAttachment,
  listMedicalReports,
} from "../services/report.service.js";

export async function analyzeReportController(
  req: Request<{ attachmentId: string }>,
  res: Response,
) {
  try {
    const report = await analyzeReportAttachment(req.user.userId, req.params.attachmentId);
    return res.status(201).json({ report });
  } catch (error) {
    if (error instanceof ReportError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}

export async function listReportsController(req: Request, res: Response) {
  const reports = await listMedicalReports(req.user.userId);
  return res.json({ reports });
}
