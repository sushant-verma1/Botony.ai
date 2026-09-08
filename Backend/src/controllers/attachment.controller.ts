import Express from "express";
import {
  requestUploadSignature,
  confirmAttachment,
  getAttachmentDeliveryUrl,
  deleteAttachment,
  AttachmentError,
} from "../services/attachment.service.js";
import logger from "../services/logger.js";

function handleAttachmentError(
  error: unknown,
  res: Express.Response,
  fallbackMessage: string,
): Express.Response {
  if (error instanceof AttachmentError) {
    return res.status(error.status).json({ message: error.message });
  }
  logger.error(fallbackMessage, {
    message: error instanceof Error ? error.message : "unknown",
  });
  return res.status(500).json({ message: fallbackMessage });
}

export const createAttachmentSignatureController = async (
  req: Express.Request,
  res: Express.Response,
) => {
  const { kind, mimeType, sizeBytes } = req.body;

  try {
    const result = await requestUploadSignature(req.user.userId, {
      kind,
      mimeType,
      sizeBytes,
    });
    return res.json(result);
  } catch (error) {
    return handleAttachmentError(
      error,
      res,
      "Failed to create upload signature",
    );
  }
};

export const confirmAttachmentController = async (
  req: Express.Request<{ id: string }>,
  res: Express.Response,
) => {
  try {
    const attachment = await confirmAttachment(req.user.userId, req.params.id);
    return res.json({
      id: attachment.id,
      kind: attachment.kind,
      status: attachment.status,
      mimeType: attachment.mimeType,
      bytes: attachment.bytes,
      width: attachment.width,
      height: attachment.height,
      createdAt: attachment.createdAt,
    });
  } catch (error) {
    return handleAttachmentError(error, res, "Failed to confirm attachment");
  }
};

export const getAttachmentController = async (
  req: Express.Request<{ id: string }>,
  res: Express.Response,
) => {
  try {
    const { url, mimeType } = await getAttachmentDeliveryUrl(
      req.user.userId,
      req.params.id,
    );
    return res.json({ url, mimeType });
  } catch (error) {
    return handleAttachmentError(error, res, "Failed to load attachment");
  }
};

export const deleteAttachmentController = async (
  req: Express.Request<{ id: string }>,
  res: Express.Response,
) => {
  try {
    await deleteAttachment(req.user.userId, req.params.id);
    return res.json({ message: "Attachment deleted successfully" });
  } catch (error) {
    return handleAttachmentError(error, res, "Failed to delete attachment");
  }
};
