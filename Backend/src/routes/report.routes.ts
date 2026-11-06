import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  analyzeReportController,
  listReportsController,
} from "../controllers/report.controller.js";

const reportRouter = Express.Router();

reportRouter.get("/", protect, listReportsController);
reportRouter.post("/:attachmentId/analyze", protect, analyzeReportController);

export default reportRouter;
