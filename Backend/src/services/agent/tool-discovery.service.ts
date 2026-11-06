import { generateToolCalls, type AIMessage } from "../ai/index.js";
import type { TemporalContext } from "../temporal-context.service.js";
import {
  toolRegistry,
  type RegisteredAgentTool,
} from "./tool-registry.service.js";

export interface DiscoveredToolCall {
  tool: RegisteredAgentTool;
  arguments: Record<string, unknown>;
  provider: "gemini" | "groq";
}

/** A successful AUTO inference may answer directly instead of calling a tool. */
export interface DirectToolResponse {
  text: string;
  provider: "gemini" | "groq";
}

export type ToolDiscoveryResult = DiscoveredToolCall | DirectToolResponse;

/**
 * The current registry is small, so one native AUTO function-calling request
 * can understand intent, select a registered capability, and extract its
 * arguments without lexical pre-routing.
 */
export async function discoverToolCall(
  history: AIMessage[],
  temporalContext?: TemporalContext,
): Promise<ToolDiscoveryResult | null> {
  const selection = await generateToolCalls([
    ...history,
    {
      role: "user",
      content: "Use a listed application tool only when it directly fulfills the latest patient request or continues its active medical workflow. A mutating tool only prepares a confirmation-required action; never claim it has already happened. If details are missing or multiple independent actions were requested, respond with a concise clarification instead of calling a tool. If no tool is needed, answer the health request normally. Do not treat the absence of a tool call as evidence that the request is out of scope.",
    },
  ], toolRegistry.all(), temporalContext);
  const selected = selection.toolCalls.find((call) => toolRegistry.get(call.name));
  if (!selected) {
    return selection.text.trim()
      ? { text: selection.text, provider: selection.provider }
      : null;
  }
  const tool = toolRegistry.get(selected.name);
  if (!tool) return null;
  return { tool, arguments: selected.arguments, provider: selection.provider };
}
