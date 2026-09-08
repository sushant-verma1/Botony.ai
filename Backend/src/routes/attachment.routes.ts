import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { attachmentSignatureSchema } from "../validation/validate.js";
import { attachmentLimiter } from "../middleware/rateLImit.middleware.js";
import {
  createAttachmentSignatureController,
  confirmAttachmentController,
  getAttachmentController,
  deleteAttachmentController,
} from "../controllers/attachment.controller.js";

const attachmentRouter = Express.Router();

attachmentRouter.post(
  "/signature",
  attachmentLimiter,
  protect,
  validate(attachmentSignatureSchema),
  createAttachmentSignatureController,
);
attachmentRouter.post(
  "/:id/confirm",
  attachmentLimiter,
  protect,
  confirmAttachmentController,
);
attachmentRouter.get("/:id", protect, getAttachmentController);
attachmentRouter.delete("/:id", protect, deleteAttachmentController);

export default attachmentRouter;
