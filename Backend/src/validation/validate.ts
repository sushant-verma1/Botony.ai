import Joi from "joi";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "../config/attachments.js";

export const createUserSchema = Joi.object({
  email: Joi.string().email().required(),

  password: Joi.string().min(8).max(20).required(),

  firstName: Joi.string().min(3).max(20).required(),

  lastName: Joi.string().min(2).max(50).required(),

  plan: Joi.string().valid("ADVISOR", "PERSONAL", "FRIEND").default("ADVISOR"),

  age: Joi.number().integer().min(13).max(120).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

export const createConversationSchema = Joi.object({
  title: Joi.string().max(100).optional(),

  status: Joi.string().valid("ONGOING", "COMPLETED").default("ONGOING"),
});

export const createMessageSchema = Joi.object({
  content: Joi.string().min(1).max(3000).required(),
  attachmentIds: Joi.array()
    .items(Joi.string())
    .max(MAX_ATTACHMENTS_PER_MESSAGE)
    .optional(),
});

export const renameConversationSchema = Joi.object({
  title: Joi.string().trim().min(1).max(100).required(),
});

export const attachmentSignatureSchema = Joi.object({
  kind: Joi.string().valid("IMAGE", "DOCUMENT").required(),
  mimeType: Joi.string()
    .valid("image/jpeg", "image/png", "image/webp", "application/pdf")
    .required(),
  sizeBytes: Joi.number().integer().positive().required(),
});