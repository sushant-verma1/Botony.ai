import Joi from "joi";

export const createUserSchema = Joi.object({
  email: Joi.string().email().required(),

  password: Joi.string().min(8).max(20).required(),

  firstName: Joi.string().min(3).max(20).required(),

  lastName: Joi.string().min(2).max(50).optional(),

  plan: Joi.string().valid("ADVISOR", "PERSONAL", "FRIEND").default("ADVISOR"),
});

export const createConversationSchema = Joi.object({
  title: Joi.string().max(100).optional(),

  status: Joi.string()
    .valid("ONGOING", "COMPLETED")
    .default("ONGOING"),

  userId: Joi.string().required(),
});

export const createMessageSchema = Joi.object({
  content: Joi.string().min(1).required(),

  role: Joi.string().valid("USER", "ASSISTANT").required(),

  emergencyDetected: Joi.boolean().optional(),

  isPremiumKept: Joi.boolean().optional(),

  conversationId: Joi.string().required(),

  userId: Joi.string().required(),
});
