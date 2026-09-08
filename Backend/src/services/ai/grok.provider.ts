import OpenAI from "openai";
import { xaiApiKey, xaiModel } from "../../config/config.js";
import logger from "../logger.js";
import { MEDICAL_SYSTEM_PROMPT } from "./prompt.js";
import type { AIAttachmentContent, AIMessage, AIResponse } from "./types.js";
import { AIProviderError } from "./types.js";

const client = new OpenAI({
  apiKey: xaiApiKey,
  baseURL: "https://api.x.ai/v1",
  timeout: 30_000,
});

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "high" } };

function toChatMessages(
  messages: AIMessage[],
  attachments: AIAttachmentContent[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: MEDICAL_SYSTEM_PROMPT },
    ...messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const last = messages[messages.length - 1];
  if (!last) {
    return chatMessages;
  }

  const textAttachments = attachments.filter(
    (a): a is Extract<AIAttachmentContent, { type: "text" }> =>
      a.type === "text",
  );
  const imageAttachments = attachments.filter(
    (a): a is Extract<AIAttachmentContent, { type: "image" }> =>
      a.type === "image",
  );

  const extractedText = textAttachments
    .map((a) => `\n\n[Attached document: ${a.label}]\n${a.text}`)
    .join("");

  if (imageAttachments.length === 0) {
    chatMessages.push({
      role: last.role,
      content: last.content + extractedText,
    });
    return chatMessages;
  }

  const parts: ChatContentPart[] = [
    { type: "text", text: last.content + extractedText },
    ...imageAttachments.map(
      (a): ChatContentPart => ({
        type: "image_url",
        image_url: { url: a.url, detail: "high" },
      }),
    ),
  ];

  // Images are only ever attached to the user's own turn.
  chatMessages.push({ role: "user", content: parts });
  return chatMessages;
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network/timeout errors have no status
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function generateWithGrok(
  messages: AIMessage[],
  attachments: AIAttachmentContent[] = [],
): Promise<AIResponse> {
  try {
    logger.info("Calling Grok API", { messageCount: messages.length });

    const chatMessages = toChatMessages(messages, attachments);

    const response = await client.chat.completions.create({
      model: xaiModel,
      max_tokens: 1000,
      messages: chatMessages,
    });

    const choice = response.choices[0];
    const text = choice?.message?.content;

    if (!text) {
      throw new AIProviderError(
        "No text content in Grok response",
        "grok",
        false,
      );
    }

    logger.info("Grok response received successfully");

    return {
      text,
      provider: "grok",
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
      finishReason: choice.finish_reason ?? undefined,
    };
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    if (error instanceof OpenAI.APIError) {
      logger.error("Grok API error", {
        status: error.status,
        message: error.message,
      });
      throw new AIProviderError(
        error.message,
        "grok",
        isRetryableStatus(error.status),
        error.status,
      );
    }

    // Network failures, aborts/timeouts, etc. — treat as retryable.
    logger.error("Grok request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw new AIProviderError(
      error instanceof Error ? error.message : "Unknown Grok error",
      "grok",
      true,
    );
  }
}

export { generateWithGrok };
