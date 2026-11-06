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

/** The profile form shows one editable field, so this accepts one. The bound
 *  is createUserSchema's for firstName, because it writes the same column. */
export const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(3).max(20).required(),
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

// Same body as createMessageSchema plus the client's draft id, for
// POST /chat/message — the no-conversation-yet sibling of
// POST /chat/:chatid/message.
export const createFirstMessageSchema = createMessageSchema.keys({
  draftId: Joi.string().uuid().required(),
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

export const createMemoryFactSchema = Joi.object({
  category: Joi.string()
    .valid(
      "ALLERGY",
      "MEDICATION",
      "HEALTH_CONTEXT",
      "CARE_PREFERENCE",
      "LIFESTYLE",
      "OTHER",
    )
    .required(),
  value: Joi.string().trim().min(1).max(500).required(),
  expiresAt: Joi.date().iso().greater("now").optional(),
});

const calendarDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

export const createMedicationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  strength: Joi.string().trim().max(80).optional(),
  form: Joi.string().trim().max(80).optional(),
  instructions: Joi.string().trim().max(500).optional(),
});

export const createDailyMedicationScheduleSchema = Joi.object({
  timezone: Joi.string().trim().min(1).max(100).required(),
  times: Joi.array()
    .items(Joi.string().pattern(/^\d{2}:\d{2}$/))
    .min(1)
    .max(4)
    .unique()
    .required(),
  startsOn: calendarDate.required(),
  endsOn: calendarDate.optional(),
});
export const updateMedicineScheduleSchema = Joi.object({
  timezone: Joi.string().trim().min(1).max(100).optional(),
  times: Joi.array().items(Joi.string().pattern(/^\d{2}:\d{2}$/)).min(1).max(4).unique().optional(),
  startsOn: calendarDate.optional(),
  endsOn: calendarDate.allow(null).optional(),
}).min(1);

export const updateMedicationInventorySchema = Joi.object({
  quantityOnHand: Joi.number().integer().min(0).max(1_000_000).required(),
  refillAt: Joi.number().integer().min(0).max(1_000_000).optional(),
});

export const logReminderDoseSchema = Joi.object({
  status: Joi.string().valid("TAKEN", "SKIPPED").required(),
  occurredAt: Joi.date().iso().max("now").optional(),
  note: Joi.string().trim().max(500).optional(),
});

export const pushSubscriptionSchema = Joi.object({
  endpoint: Joi.string().uri({ scheme: ["https"] }).max(2_000).required(),
  expirationTime: Joi.number().integer().allow(null).optional(),
  keys: Joi.object({
    p256dh: Joi.string().min(16).max(1_000).required(),
    auth: Joi.string().min(8).max(1_000).required(),
  }).required(),
});

export const disablePushSubscriptionSchema = Joi.object({
  endpoint: Joi.string().uri({ scheme: ["https"] }).max(2_000).required(),
});

export const draftMedicationScheduleSchema = Joi.object({
  request: Joi.string().trim().min(1).max(1000).required(),
});

export const confirmAgentActionSchema = Joi.object({
  confirmationToken: Joi.string().hex().length(64).required(),
  revision: Joi.number().integer().positive().optional(),
});

const healthMeasurementTypes = [
  "BLOOD_PRESSURE",
  "BLOOD_GLUCOSE",
  "WEIGHT",
  "HEART_RATE",
  "TEMPERATURE",
  "CUSTOM",
];

export const createHealthMeasurementSchema = Joi.object({
  type: Joi.string().valid(...healthMeasurementTypes).required(),
  label: Joi.string().trim().max(100).optional(),
  value: Joi.number().positive().max(100_000).required(),
  secondaryValue: Joi.number().positive().max(100_000).optional(),
  unit: Joi.string().trim().min(1).max(30).required(),
  measuredAt: Joi.date().iso().max("now").required(),
  note: Joi.string().trim().max(500).optional(),
});

export const createHealthAppointmentSchema = Joi.object({
  title: Joi.string().trim().min(1).max(160).required(),
  startsAt: Joi.date().iso().required(),
  endsAt: Joi.date().iso().optional(),
  timezone: Joi.string().trim().min(1).max(100).required(),
  provider: Joi.string().trim().max(160).optional(),
  location: Joi.string().trim().max(200).optional(),
  note: Joi.string().trim().max(500).optional(),
});

const carePermissions = [
  "VIEW_MEDICATIONS",
  "VIEW_MEDICATION_SCHEDULES",
  "VIEW_HEALTH_MEASUREMENTS",
  "VIEW_APPOINTMENTS",
  "VIEW_REPORT_SUMMARIES",
];

export const createCareInvitationSchema = Joi.object({
  email: Joi.string().email().required(),
  permissions: Joi.array().items(Joi.string().valid(...carePermissions)).min(1).unique().required(),
});

export const careInvitationResponseSchema = Joi.object({
  accept: Joi.boolean().required(),
});

export const caregiverReminderNotificationsSchema = Joi.object({
  enabled: Joi.boolean().required(),
});
