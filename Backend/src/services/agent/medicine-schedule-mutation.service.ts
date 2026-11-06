import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import {
  deleteMedicineSchedule,
  updateMedicineSchedule,
  type UpdateMedicationScheduleInput,
} from "../medication.service.js";
import { evaluateToolRequest } from "./tool-guardrail.service.js";
import {
  createTemporalContext,
  resolveScheduleDateExpression,
  TemporalResolutionError,
  type TemporalContext,
} from "../temporal-context.service.js";

type MutationToolName = "updateMedicineSchedule" | "deleteMedicineSchedule";

export class MedicineScheduleMutationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(token: string, expectedHash: string): boolean {
  const received = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function asUpdateInput(value: unknown): UpdateMedicationScheduleInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MedicineScheduleMutationError("Schedule changes are required", 400);
  }
  const input = value as Record<string, unknown>;
  const result: UpdateMedicationScheduleInput = {};
  if (typeof input.timezone === "string") result.timezone = input.timezone;
  if (Array.isArray(input.times) && input.times.every((time) => typeof time === "string")) {
    result.times = input.times as string[];
  }
  if (typeof input.startsOn === "string") result.startsOn = input.startsOn;
  if (typeof input.endsOn === "string" || input.endsOn === null) result.endsOn = input.endsOn;
  if (Object.keys(result).length === 0) {
    throw new MedicineScheduleMutationError("At least one schedule change is required", 400);
  }
  return result;
}

export async function draftMedicineScheduleMutation(
  userId: string,
  toolName: MutationToolName,
  argumentsValue: Record<string, unknown>,
  conversationId?: string,
  temporalContext?: TemporalContext,
) {
  const policy = evaluateToolRequest(toolName);
  if (!policy.allowed || !policy.requiresConfirmation) {
    throw new MedicineScheduleMutationError("This schedule action is unavailable", 403);
  }
  const scheduleId = typeof argumentsValue.scheduleId === "string" ? argumentsValue.scheduleId : "";
  if (!scheduleId) throw new MedicineScheduleMutationError("A schedule identifier is required", 400);
  const schedule = await prisma.medicationSchedule.findFirst({
    where: { id: scheduleId, userId, status: "ACTIVE" },
    select: { id: true, timezone: true },
  });
  if (!schedule) throw new MedicineScheduleMutationError("Active medication schedule not found", 404);
  let argumentsForAction: { scheduleId: string; changes?: UpdateMedicationScheduleInput };
  if (toolName === "updateMedicineSchedule") {
    const changes = asUpdateInput(argumentsValue.changes);
    if (changes.startsOn) {
      try {
        const reference = temporalContext ?? createTemporalContext(schedule.timezone);
        changes.startsOn = resolveScheduleDateExpression(changes.startsOn, {
          ...reference,
          timezone: changes.timezone ?? schedule.timezone,
        });
      } catch (error) {
        if (error instanceof TemporalResolutionError) {
          throw new MedicineScheduleMutationError(error.message, 400);
        }
        throw error;
      }
    }
    argumentsForAction = { scheduleId, changes };
  } else {
    argumentsForAction = { scheduleId };
  }
  const token = randomBytes(32).toString("hex");
  const [run, action] = await prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.create({
      data: { userId, intent: toolName, guardrailVersion: "native-tool-v1", conversationId },
    });
    const action = await tx.agentAction.create({
      data: {
        userId,
        agentRunId: run.id,
        toolName,
        arguments: argumentsForAction as unknown as Prisma.InputJsonValue,
        confirmationTokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
      select: { id: true, expiresAt: true, revision: true },
    });
    await tx.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    await tx.auditEvent.create({
      data: { userId, action: "AGENT_TOOL_DRAFTED", resourceType: "AgentAction", resourceId: action.id, metadata: { toolName, agentRunId: run.id } },
    });
    return [run, action] as const;
  });
  return { action, confirmationToken: token, agentRunId: run.id };
}

export async function confirmMedicineScheduleMutation(
  userId: string,
  actionId: string,
  confirmationToken: string,
  expectedRevision?: number,
) {
  const action = await prisma.agentAction.findFirst({
    where: { id: actionId, userId, toolName: { in: ["updateMedicineSchedule", "deleteMedicineSchedule"] } },
    select: { id: true, toolName: true, arguments: true, status: true, expiresAt: true, confirmationTokenHash: true, revision: true },
  } as never) as any;
  if (!action) throw new MedicineScheduleMutationError("Schedule action not found", 404);
  if (expectedRevision !== undefined && action.revision !== expectedRevision) {
    throw new MedicineScheduleMutationError("Schedule action has been superseded", 409);
  }
  if (!tokenMatches(confirmationToken, action.confirmationTokenHash)) {
    throw new MedicineScheduleMutationError("Schedule confirmation is invalid", 403);
  }
  if (action.expiresAt.getTime() < Date.now()) {
    await prisma.agentAction.update({ where: { id: action.id }, data: { status: "EXPIRED" } });
    throw new MedicineScheduleMutationError("Schedule confirmation expired", 410);
  }
  if (action.status !== "PENDING_CONFIRMATION") {
    throw new MedicineScheduleMutationError("Schedule action is no longer pending", 409);
  }
  const claimed = await prisma.agentAction.updateMany({
    where: { id: action.id, status: "PENDING_CONFIRMATION", revision: action.revision },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  } as never);
  if (claimed.count === 0) {
    throw new MedicineScheduleMutationError("Schedule action is being processed", 409);
  }
  const args = action.arguments as Record<string, unknown>;
  const scheduleId = typeof args.scheduleId === "string" ? args.scheduleId : "";
  try {
    const result = action.toolName === "updateMedicineSchedule"
      ? await updateMedicineSchedule(userId, scheduleId, asUpdateInput(args.changes))
      : (await deleteMedicineSchedule(userId, scheduleId), { scheduleId });
    await prisma.agentAction.update({ where: { id: action.id }, data: { status: "EXECUTED", resultResourceId: scheduleId, executedAt: new Date() } });
    return result;
  } catch (error) {
    await prisma.agentAction.update({ where: { id: action.id }, data: { status: "FAILED" } });
    if (error instanceof MedicineScheduleMutationError) throw error;
    throw error;
  }
}
