import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { generateResponse } from "../ai/index.js";
import {
  MedicationError,
  buildUpcomingReminderJobs,
  createMedication,
  createDailyMedicationSchedule,
  type MedicationInput,
  type DailyScheduleInput,
} from "../medication.service.js";
import { evaluateToolRequest } from "./tool-guardrail.service.js";
import logger from "../logger.js";
import {
  createTemporalContext,
  resolveScheduleDateExpression,
  TemporalResolutionError,
  type TemporalContext,
} from "../temporal-context.service.js";

const TOOL_NAME = "draft_medication_schedule";
const GUARDRAIL_VERSION = "medication-schedule-v1";
const ACTION_TTL_MS = 15 * 60_000;

export class AgentActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface MedicationScheduleAgentContext {
  conversationId?: string;
  temporalContext?: TemporalContext;
}

/** Audit writes must not make a safe patient-facing action unavailable. */
async function writeAgentAuditEvent(
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string | undefined,
  metadata: Record<string, string | boolean | number | undefined>,
) {
  try {
    await prisma.auditEvent.create({
      data: { userId, action, resourceType, resourceId, metadata },
    });
  } catch (error) {
    logger.error("Agent audit event write failed", {
      action,
      resourceType,
      resourceId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }
}

interface MedicationScheduleFields {
  times: string[];
  timezone: string;
  startsOn: string;
  endsOn?: string;
}

export type MedicationScheduleDraft = MedicationScheduleFields & (
  | { medicationId: string; newMedication?: never }
  | { medicationId?: never; newMedication: MedicationInput }
);

export type MedicationSchedulePlannerResult =
  | { kind: "proposal"; draft: MedicationScheduleDraft }
  | {
      kind: "clarification";
      question: string;
      partial: Record<string, unknown>;
      missingFields: string[];
    };

function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidate = (fenced ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1));
    }
    throw new AgentActionError("The assistant could not create a safe schedule draft", 422);
  }
}

export function parseMedicationSchedulePlannerResult(text: string): MedicationSchedulePlannerResult {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (error) {
    if (error instanceof AgentActionError) throw error;
    throw new AgentActionError("The assistant could not create a safe schedule draft", 422);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AgentActionError("The assistant returned an invalid schedule draft", 422);
  }
  const value = parsed as Record<string, unknown>;
  if (value.kind === "clarification" && typeof value.question === "string") {
    const question = value.question.trim().slice(0, 500);
    if (!question) throw new AgentActionError("The assistant returned an invalid schedule response", 422);
    const partial = typeof value.partial === "object" && value.partial !== null && !Array.isArray(value.partial)
      ? value.partial as Record<string, unknown>
      : {};
    const missingFields = Array.isArray(value.missingFields)
      ? value.missingFields.filter((field): field is string => typeof field === "string").slice(0, 8)
      : [];
    return { kind: "clarification", question, partial, missingFields };
  }
  if (
    (value.kind !== undefined && value.kind !== "proposal") ||
    !Array.isArray(value.times) ||
    !value.times.every((time) => typeof time === "string") ||
    typeof value.timezone !== "string" ||
    typeof value.startsOn !== "string" ||
    (value.endsOn !== undefined && typeof value.endsOn !== "string")
  ) {
    throw new AgentActionError("The assistant returned an invalid schedule draft", 422);
  }

  const medicationId = typeof value.medicationId === "string" ? value.medicationId.trim() : "";
  const newMedicationValue = value.newMedication;
  const hasNewMedication = typeof newMedicationValue === "object" && newMedicationValue !== null && !Array.isArray(newMedicationValue);
  if ((medicationId ? 1 : 0) + (hasNewMedication ? 1 : 0) !== 1) {
    throw new AgentActionError("The assistant returned an invalid schedule draft", 422);
  }

  const schedule: MedicationScheduleFields = {
    times: value.times,
    timezone: value.timezone,
    startsOn: value.startsOn,
    ...(typeof value.endsOn === "string" ? { endsOn: value.endsOn } : {}),
  };
  if (medicationId) return { kind: "proposal", draft: { medicationId, ...schedule } };

  const medication = newMedicationValue as Record<string, unknown>;
  if (
    typeof medication.name !== "string" ||
    !medication.name.trim() ||
    (medication.strength !== undefined && typeof medication.strength !== "string") ||
    (medication.form !== undefined && typeof medication.form !== "string")
  ) {
    throw new AgentActionError("The assistant returned an invalid new medication", 422);
  }
  return {
    kind: "proposal",
    draft: {
      newMedication: {
        name: medication.name.trim(),
        ...(typeof medication.strength === "string" && medication.strength.trim()
          ? { strength: medication.strength.trim() }
          : {}),
        ...(typeof medication.form === "string" && medication.form.trim()
          ? { form: medication.form.trim() }
          : {}),
      },
      ...schedule,
    },
  };
}

export function parseMedicationScheduleDraft(text: string): MedicationScheduleDraft {
  const result = parseMedicationSchedulePlannerResult(text);
  if (result.kind !== "proposal") {
    throw new AgentActionError("More schedule details are needed", 422);
  }
  return result.draft;
}

export function plannerPrompt(
  request: string,
  medications: Array<{ id: string; name: string; strength: string | null; form: string | null }>,
  temporalContext: TemporalContext,
) {
  return `Create a medication reminder schedule proposal from the user's request.

You may only choose a medicationId from this server-supplied list:
${JSON.stringify(medications)}

Return JSON only, in exactly one of these shapes:
{"kind":"proposal","medicationId":"existing id","times":["HH:mm"],"timezone":"IANA timezone","startsOn":"user date expression, e.g. tomorrow or 2026-11-06","endsOn":"YYYY-MM-DD optional"}
{"kind":"proposal","newMedication":{"name":"user-provided medicine name","strength":"user-provided optional strength","form":"user-provided optional form"},"times":["HH:mm"],"timezone":"IANA timezone","startsOn":"user date expression, e.g. tomorrow or 2026-11-06","endsOn":"YYYY-MM-DD optional"}
{"kind":"clarification","question":"one concise question asking for the missing details","partial":{"only":"explicitly supplied fields"},"missingFields":["field names"]}

Rules:
- Never invent a medication, strength, dose, frequency, timezone, date, or user preference. Use the complete conversation request to interpret ordinary natural-language time and date phrasing.
- A medication name that unambiguously identifies exactly one item in the server-supplied list must use that medicationId. If the user explicitly names a medicine not in the list, use newMedication with the exact user-provided name and only user-provided strength or form. If a name could match multiple saved medicines, ask which saved medicine the user means.
- Interpret natural time wording. Both "9 34 pm" and "9:34 pm" mean 21:34. "tonight at 9" can confidently mean 21:00, with startsOn "today". "today at 9" is ambiguous and requires an AM/PM clarification. After you ask that question, a later reply of only "am" or "pm" resolves the earlier time using the conversation context. Normalize a confident result to HH:mm. When uncertain, ask exactly one concise clarification; do not guess.
- Use the trusted temporal context to resolve natural date phrases into the supported structured startsOn values: a calendar date, "today", "tomorrow", "next <weekday>", or "in N hours/days/weeks". When the server-supplied timezone is known, timezone must equal it exactly; when it is unknown, ask for an IANA timezone.
- Ask a clarification instead of making a proposal whenever any required value is missing or ambiguous. Do not infer a medicine name, strength, form, dose, frequency, time, timezone, or date. Schedules never change medication instructions.
- This is only a proposal; it cannot prescribe or change medication. A new medication record is created only after the user explicitly confirms this exact proposal.

Temporal context (trusted server data):
${JSON.stringify(temporalContext)}

User request: ${request}`;
}

function asScheduleInput(draft: MedicationScheduleDraft): DailyScheduleInput {
  return {
    timezone: draft.timezone,
    times: draft.times,
    startsOn: draft.startsOn,
    ...(draft.endsOn ? { endsOn: draft.endsOn } : {}),
  };
}

function confirmationMatches(token: string, expectedHash: string): boolean {
  const received = Buffer.from(hashConfirmationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function draftMedicationScheduleFromRequest(
  userId: string,
  request: string,
  context: MedicationScheduleAgentContext = {},
) {
  const guardrail = evaluateToolRequest(TOOL_NAME);
  if (!guardrail.allowed || !guardrail.requiresConfirmation) {
    throw new AgentActionError("Medication scheduling is unavailable", 403);
  }

  const run = await prisma.agentRun.create({
    data: {
      userId,
      intent: TOOL_NAME,
      guardrailVersion: GUARDRAIL_VERSION,
      ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    },
  });
  await writeAgentAuditEvent(userId, "AGENT_TOOL_STARTED", "AgentRun", run.id, {
    toolName: TOOL_NAME,
    guardrailVersion: GUARDRAIL_VERSION,
  });

  const medications = await prisma.medication.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, name: true, strength: true, form: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  try {
    const temporalContext = context.temporalContext ?? createTemporalContext();
    const response = await generateResponse([
      { role: "user", content: plannerPrompt(request, medications, temporalContext) },
    ], [], undefined, temporalContext);
    const plannerResult = parseMedicationSchedulePlannerResult(response.text);
    if (plannerResult.kind === "clarification") {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "BLOCKED",
          completedAt: new Date(),
          pendingArguments: plannerResult.partial as Prisma.InputJsonValue,
          missingFields: plannerResult.missingFields,
          revision: { increment: 1 },
          expiresAt: new Date(Date.now() + ACTION_TTL_MS),
        },
      });
      await writeAgentAuditEvent(userId, "AGENT_TOOL_BLOCKED", "AgentRun", run.id, {
        toolName: TOOL_NAME,
        reason: "planner_requested_clarification",
      });
      logger.info("Medication schedule tool requested clarification", {
        userId,
        agentRunId: run.id,
        conversationId: context.conversationId,
      });
      return plannerResult;
    }
    let draft = plannerResult.draft;
    try {
      if (!temporalContext.timezone) {
        throw new TemporalResolutionError("What IANA timezone should I use for this reminder?");
      }
      if (draft.timezone !== temporalContext.timezone) {
        throw new TemporalResolutionError("Please confirm the timezone for this reminder.");
      }
      draft = {
        ...draft,
        startsOn: resolveScheduleDateExpression(draft.startsOn, temporalContext),
      };
    } catch (error) {
      if (error instanceof TemporalResolutionError) {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: "BLOCKED", completedAt: new Date() },
        });
        await writeAgentAuditEvent(userId, "AGENT_TOOL_BLOCKED", "AgentRun", run.id, {
          toolName: TOOL_NAME,
          reason: "date_resolution_clarification",
        });
        return { kind: "clarification" as const, question: error.message, partial: {}, missingFields: ["startsOn"] };
      }
      throw error;
    }
    if (draft.medicationId && !medications.some((medication) => medication.id === draft.medicationId)) {
      throw new AgentActionError("The assistant selected an unavailable medication", 422);
    }

    // Reuse the deterministic scheduling calculator to validate timezones,
    // dates, and daylight-saving gaps before a patient ever sees a proposal.
    buildUpcomingReminderJobs(
      {
        scheduleId: "draft",
        medicationId: draft.medicationId ?? "draft-new-medication",
        userId,
        ...asScheduleInput(draft),
      },
      new Date(),
      1,
    );

    const actionArguments = draft.medicationId
      ? { medicationId: draft.medicationId }
      : {
          newMedication: {
            name: draft.newMedication!.name,
            ...(draft.newMedication!.strength ? { strength: draft.newMedication!.strength } : {}),
            ...(draft.newMedication!.form ? { form: draft.newMedication!.form } : {}),
          },
        };
    const confirmationToken = randomBytes(32).toString("hex");
    const action = await prisma.agentAction.create({
      data: {
        userId,
        agentRunId: run.id,
        toolName: TOOL_NAME,
        arguments: {
          ...actionArguments,
          times: draft.times,
          timezone: draft.timezone,
          startsOn: draft.startsOn,
          ...(draft.endsOn ? { endsOn: draft.endsOn } : {}),
        },
        confirmationTokenHash: hashConfirmationToken(confirmationToken),
        expiresAt: new Date(Date.now() + ACTION_TTL_MS),
      },
      select: { id: true, expiresAt: true, revision: true },
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", completedAt: new Date() },
    });
    await writeAgentAuditEvent(userId, "AGENT_TOOL_DRAFTED", "AgentAction", action.id, {
      toolName: TOOL_NAME,
      agentRunId: run.id,
    });
    logger.info("Medication schedule tool drafted proposal", {
      userId,
      agentRunId: run.id,
      agentActionId: action.id,
      conversationId: context.conversationId,
    });

    return { kind: "proposal" as const, action, draft, confirmationToken };
  } catch (error) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: error instanceof AgentActionError ? "BLOCKED" : "FAILED",
        completedAt: new Date(),
      },
    });
    await writeAgentAuditEvent(userId, "AGENT_TOOL_FAILED", "AgentRun", run.id, {
      toolName: TOOL_NAME,
      outcome: error instanceof AgentActionError ? "blocked" : "failed",
    });
    logger.warn("Medication schedule tool failed", {
      userId,
      agentRunId: run.id,
      conversationId: context.conversationId,
      outcome: error instanceof AgentActionError ? "blocked" : "failed",
    });
    if (error instanceof AgentActionError || error instanceof MedicationError) {
      throw error;
    }
    throw new AgentActionError("The assistant could not create a safe schedule draft", 422);
  }
}

export async function confirmMedicationScheduleAction(
  userId: string,
  actionId: string,
  confirmationToken: string,
  expectedRevision?: number,
) {
  const action = await prisma.agentAction.findFirst({
    where: { id: actionId, userId, toolName: TOOL_NAME },
    select: {
      id: true,
      arguments: true,
      status: true,
      expiresAt: true,
      confirmationTokenHash: true,
      resultResourceId: true,
      agentRunId: true,
      revision: true,
    },
  } as never) as any;
  if (!action) throw new AgentActionError("Schedule proposal not found", 404);
  if (expectedRevision !== undefined && action.revision !== expectedRevision) {
    throw new AgentActionError("Schedule proposal has been superseded", 409);
  }
  if (!confirmationMatches(confirmationToken, action.confirmationTokenHash)) {
    throw new AgentActionError("Schedule confirmation was rejected", 403);
  }
  if (action.status === "EXECUTED" && action.resultResourceId) {
    const schedule = await prisma.medicationSchedule.findFirst({
      where: { id: action.resultResourceId, userId },
    });
    if (schedule) return { schedule, replayed: true };
  }
  if (action.expiresAt.getTime() <= Date.now()) {
    await prisma.agentAction.update({
      where: { id: action.id },
      data: { status: "EXPIRED" },
    });
    throw new AgentActionError("Schedule proposal has expired", 410);
  }
  if (!["PENDING_CONFIRMATION", "CONFIRMED"].includes(action.status)) {
    throw new AgentActionError("Schedule proposal cannot be confirmed", 409);
  }

  const claimed = await prisma.agentAction.updateMany({
    where: { id: action.id, status: "PENDING_CONFIRMATION", revision: action.revision },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
  if (claimed.count === 0 && action.status !== "CONFIRMED") {
    throw new AgentActionError("Schedule proposal is being processed", 409);
  }

  try {
    const draft = parseMedicationScheduleDraft(JSON.stringify(action.arguments));
    const medicationId = draft.medicationId ?? (await createMedication(userId, draft.newMedication!)).id;
    const result = await createDailyMedicationSchedule(
      userId,
      medicationId,
      asScheduleInput(draft),
      action.id,
    );
    await prisma.agentAction.update({
      where: { id: action.id },
      data: {
        status: "EXECUTED",
        resultResourceId: result.schedule.id,
        executedAt: new Date(),
      },
    });
    await prisma.auditEvent.create({
      data: {
        userId,
        action: "AGENT_MEDICATION_SCHEDULE_EXECUTED",
        resourceType: "MedicationSchedule",
        resourceId: result.schedule.id,
        metadata: { agentActionId: action.id, agentRunId: action.agentRunId },
      },
    });
    logger.info("Medication schedule tool executed", {
      userId,
      agentActionId: action.id,
      agentRunId: action.agentRunId,
      scheduleId: result.schedule.id,
    });
    return { schedule: result.schedule, replayed: false };
  } catch (error) {
    await prisma.agentAction.update({
      where: { id: action.id },
      data: { status: "FAILED" },
    });
    if (error instanceof AgentActionError || error instanceof MedicationError) {
      throw error;
    }
    throw new AgentActionError("Could not create the medication schedule", 500);
  }
}
