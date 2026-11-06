import type { AIToolDefinition } from "../ai/index.js";
import { embedTextWithGemini } from "../ai/gemini.provider.js";
import logger from "../logger.js";

export interface RegisteredAgentTool extends AIToolDefinition {
  /** Mutating tools are always represented as a confirmable AgentAction. */
  requiresConfirmation: boolean;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }
  return aMagnitude && bMagnitude ? dot / Math.sqrt(aMagnitude * bMagnitude) : -1;
}

/**
 * Registry is deliberately independent of routing and execution. New feature
 * modules register their tools here; it comfortably supports hundreds of
 * entries without sending every schema to a provider on every turn.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredAgentTool>();
  private embeddingsPromise: Promise<Map<string, number[]>> | null = null;

  register(tool: RegisteredAgentTool): void {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate agent tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
    this.embeddingsPromise = null;
  }

  get(name: string): RegisteredAgentTool | undefined {
    return this.tools.get(name);
  }

  /** The current catalog is small enough for direct AUTO tool selection. */
  all(): RegisteredAgentTool[] {
    return [...this.tools.values()];
  }

  private async embeddings(): Promise<Map<string, number[]>> {
    if (!this.embeddingsPromise) {
      const entries = [...this.tools.values()];
      this.embeddingsPromise = embedTextWithGemini(entries.map((tool) => `${tool.name}\n${tool.description}`))
        .then((vectors) => new Map(entries.map((tool, index) => [tool.name, vectors[index]])));
    }
    return this.embeddingsPromise;
  }

  /** Semantic vector search; catalog vectors are cached until a tool changes. */
  async search(query: string, limit = 8): Promise<RegisteredAgentTool[]> {
    const allTools = [...this.tools.values()];
    try {
      const [queryVector, catalog] = await Promise.all([
        embedTextWithGemini([query]).then(([vector]) => vector),
        this.embeddings(),
      ]);
      return allTools
        .map((tool) => ({ tool, score: cosineSimilarity(queryVector, catalog.get(tool.name) ?? []) }))
        .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
        .slice(0, limit)
        .map(({ tool }) => tool);
    } catch (error) {
      // Discovery remains available during an embedding outage. This is not
      // keyword routing: it simply exposes a bounded catalog for the LLM to
      // choose from, preserving the model as the intent decision-maker.
      logger.warn("Semantic tool search unavailable; exposing bounded catalog", {
        catalogSize: allTools.length,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return allTools.slice(0, limit);
    }
  }
}

const requestParameter = {
  type: "object",
  properties: {
    request: { type: "string", description: "The patient's complete reminder request in their own words." },
  },
  required: ["request"],
  additionalProperties: false,
};

export const toolRegistry = new ToolRegistry();

toolRegistry.register({
  name: "createMedicineSchedule",
  description: "Prepare a recurring medicine reminder from the patient's request. It never changes medication instructions and requires patient confirmation before creation.",
  parameters: requestParameter,
  requiresConfirmation: true,
});
toolRegistry.register({
  name: "getMedicineSchedules",
  description: "Retrieve the patient's existing medicine reminder schedules.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  requiresConfirmation: false,
});
toolRegistry.register({
  name: "cancelMedicationScheduleDraft",
  description: "Cancel the patient's active, unconfirmed medication reminder setup. It never deletes an already active reminder schedule.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  requiresConfirmation: false,
});
toolRegistry.register({
  name: "updateMedicineSchedule",
  description: "Prepare a change to one existing medicine reminder schedule. Requires the schedule identifier and the requested change, then patient confirmation.",
  parameters: {
    type: "object",
    properties: {
      scheduleId: { type: "string" },
      changes: {
        type: "object",
        description: "Only the schedule fields the patient explicitly requested to change.",
        properties: {
          timezone: { type: "string" },
          times: { type: "array", items: { type: "string" } },
          startsOn: { type: "string" },
          endsOn: { type: ["string", "null"] },
        },
        additionalProperties: false,
      },
    },
    required: ["scheduleId", "changes"],
    additionalProperties: false,
  },
  requiresConfirmation: true,
});
toolRegistry.register({
  name: "deleteMedicineSchedule",
  description: "Prepare deletion of one existing medicine reminder schedule. Requires patient confirmation before deletion.",
  parameters: {
    type: "object",
    properties: { scheduleId: { type: "string" } },
    required: ["scheduleId"],
    additionalProperties: false,
  },
  requiresConfirmation: true,
});

export const toolSearchDefinition: AIToolDefinition = {
  name: "searchTools",
  description: "Search the application tool catalog for capabilities relevant to the patient's request. Call this before using an application capability.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Concise natural-language capability search." } },
    required: ["query"],
    additionalProperties: false,
  },
};
