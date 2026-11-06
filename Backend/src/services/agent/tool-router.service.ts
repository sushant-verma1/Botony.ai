import { generateResponse } from "../ai/index.js";

export type AgentToolDecision =
  | { toolName: "draft_medication_schedule" }
  | { toolName: "none" };

const SCHEDULE_VERB = /\b(?:schedule|schedle|scehdul|remind(?:er)?|plan)\b/i;
const MEDICATION_REFERENCE = /\b(?:medication|medicine|meds?|tablet(?:s)?|capsule(?:s)?|pill(?:s)?|vitamin(?:s)?|supplement(?:s)?|dose(?:s)?)\b/i;

/**
 * Conservative local fallback for explicit medication scheduling intent.
 * The planner LLM receives incomplete requests and asks for what it needs;
 * this guard only prevents a clear scheduling request falling through because
 * the router returned malformed JSON or was temporarily unavailable.
 */
export function hasDeterministicMedicationScheduleIntent(request: string): boolean {
  return SCHEDULE_VERB.test(request)
    && MEDICATION_REFERENCE.test(request);
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidate = (fenced ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    return null;
  }
}

/** Parse only declared tools; an unusable routing reply fails closed to chat. */
export function parseAgentToolDecision(text: string): AgentToolDecision {
  const value = extractJson(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { toolName: "none" };
  }
  return (value as Record<string, unknown>).toolName === "draft_medication_schedule"
    ? { toolName: "draft_medication_schedule" }
    : { toolName: "none" };
}

function routerPrompt(request: string): string {
  return `Decide whether to invoke an application tool for this patient message.

Available tools:
- draft_medication_schedule: use only when the patient asks to create, set, plan, schedule, or receive recurring reminders for taking a medicine. Use it for follow-up details that complete an earlier medication-reminder discussion.

Do not use a tool for medication education, dosage questions, symptoms, prescriptions, or unrelated health questions.

Return JSON only, exactly one of:
{"toolName":"draft_medication_schedule"}
{"toolName":"none"}

Patient message and any relevant earlier scheduling details:
${request}`;
}

/**
 * This is the server-side equivalent of an LLM function/tool selection. The
 * model chooses from the small allowlist; the controller—not the model—runs
 * the selected capability and its confirmation safeguards.
 */
export async function selectAgentTool(request: string): Promise<AgentToolDecision> {
  const response = await generateResponse([{ role: "user", content: routerPrompt(request) }]);
  return parseAgentToolDecision(response.text);
}
