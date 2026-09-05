import Anthropic from "@anthropic-ai/sdk";
import { claudeKey } from "../config/config.js";
import logger from "./logger.js";

const anthropic = new Anthropic({
  apiKey: claudeKey,
});

const CLAUDE_UNAVAILABLE_MESSAGE =
  "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.";

class ClaudeServiceError extends Error {
  status: number;
  userMessage: string;
  originalMessage?: string;

  constructor(userMessage: string, status = 503, originalError?: unknown) {
    super(userMessage);
    this.name = "ClaudeServiceError";
    this.status = status;
    this.userMessage = userMessage;
    this.originalMessage =
      originalError instanceof Error ? originalError.message : undefined;
  }
}

const MEDICAL_SYSTEM_PROMPT = `You are a health information assistant. You provide educational health information only.

CRITICAL RULES:
1. YOU ARE NOT A LICENSED PHYSICIAN
2. YOU CANNOT DIAGNOSE DISEASES
3. YOU CANNOT PRESCRIBE MEDICATIONS
4. THIS IS FOR EDUCATIONAL PURPOSES ONLY
5. ALWAYS RECOMMEND SEEING A REAL DOCTOR

Your role:
- Provide health information
- Ask clarifying questions about symptoms
- Suggest when to see a doctor
- Direct users to medical professionals

NEVER:
- Say you can diagnose them
- Recommend specific medications to take
- Provide medical advice that replaces a doctor
- Make definitive medical claims

Always end responses by recommending they see a healthcare provider.`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function callClaudeAPI(
  messages: Message[],
  systemPrompt: string = MEDICAL_SYSTEM_PROMPT,
): Promise<string> {
  try {
    logger.info("Calling Claude API", { messageCount: messages.length });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: messages,
    });

    const textContent = response.content.find((block) => block.type === "text");

    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    logger.info("Claude response received successfully");
    return textContent.text;
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      logger.error("Claude API error", {
        status: error.status,
        detail: error.error,
      });
      throw new ClaudeServiceError(
        CLAUDE_UNAVAILABLE_MESSAGE,
        503,
        error,
      );
    }

    logger.error("Claude API error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw new ClaudeServiceError(
      "Failed to generate a response. Please try again.",
      503,
      error instanceof Error ? error : undefined,
    );
  }
}

async function getClaudeResponse(
  conversationMessages: Message[],
): Promise<string> {
  return callClaudeAPI(conversationMessages, MEDICAL_SYSTEM_PROMPT);
}

function getSystemPrompt(): string {
  return MEDICAL_SYSTEM_PROMPT;
}

export {
  callClaudeAPI,
  getClaudeResponse,
  getSystemPrompt,
  ClaudeServiceError,
  type Message,
};
