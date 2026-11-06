import { prisma } from "../config/db.js";

const MAX_CONTEXT_FACTS = 12;
const MAX_CONTEXT_VALUE_LENGTH = 300;

export class MemoryFactError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface CreateMemoryFactInput {
  category: string;
  value: string;
  expiresAt?: Date;
}

function cleanContextValue(value: string): string {
  // Memory comes from users or documents. It is context, never an instruction
  // to the model, so remove markup delimiters and control characters before
  // it is placed in a provider system instruction.
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");

  return withoutControls
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONTEXT_VALUE_LENGTH);
}

export async function listMemoryFacts(userId: string) {
  return prisma.memoryFact.findMany({
    where: { userId },
    select: {
      id: true,
      category: true,
      value: true,
      source: true,
      status: true,
      confidence: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function createMemoryFact(
  userId: string,
  input: CreateMemoryFactInput,
) {
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    throw new MemoryFactError("Memory expiry must be in the future", 400);
  }

  return prisma.$transaction(async (tx) => {
    const fact = await tx.memoryFact.create({
      data: {
        userId,
        category: input.category,
        value: input.value.trim(),
        source: "USER",
        status: "VERIFIED",
        confidence: 100,
        expiresAt: input.expiresAt,
      },
    });

    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEMORY_CREATED",
        resourceType: "MemoryFact",
        resourceId: fact.id,
        // Metadata stays operational; do not copy the fact value into logs.
        metadata: { category: fact.category, source: fact.source },
      },
    });

    return fact;
  });
}

export async function deleteMemoryFact(userId: string, memoryFactId: string) {
  return prisma.$transaction(async (tx) => {
    const fact = await tx.memoryFact.findFirst({
      where: { id: memoryFactId, userId },
      select: { id: true, category: true },
    });

    if (!fact) {
      // A single response avoids revealing whether another user's fact exists.
      throw new MemoryFactError("Memory fact not found", 404);
    }

    await tx.memoryFact.delete({ where: { id: fact.id } });
    await tx.auditEvent.create({
      data: {
        userId,
        action: "MEMORY_DELETED",
        resourceType: "MemoryFact",
        resourceId: fact.id,
        metadata: { category: fact.category },
      },
    });
  });
}

/**
 * Builds the only long-term patient context available to the model. It is
 * deliberately limited to active, verified facts and excludes raw chat,
 * pending document extraction, and agent inferences.
 */
export async function buildVerifiedMemoryContext(
  userId: string,
): Promise<string | undefined> {
  const now = new Date();
  const facts = await prisma.memoryFact.findMany({
    where: {
      userId,
      status: "VERIFIED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { category: true, value: true, source: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: MAX_CONTEXT_FACTS,
  });

  if (facts.length === 0) return undefined;

  const entries = facts.map((fact) =>
    JSON.stringify({
      category: fact.category,
      value: cleanContextValue(fact.value),
      source: fact.source,
    }),
  );

  return [
    "VERIFIED_PATIENT_CONTEXT_START",
    ...entries,
    "VERIFIED_PATIENT_CONTEXT_END",
  ].join("\n");
}
