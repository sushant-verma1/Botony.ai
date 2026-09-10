import OpenAI from "openai";
import { groqApiKey, groqModel } from "../../config/config.js";
import logger from "../logger.js";
import { inlineImage } from "./image.js";
import { MEDICAL_SYSTEM_PROMPT } from "./prompt.js";
import { splitReasoning } from "./reasoning.js";
import type { AIAttachmentContent, AIMessage, AIResponse } from "./types.js";
import { AIProviderError } from "./types.js";

// Groq exposes an OpenAI-compatible endpoint, so the installed SDK is reused
// rather than adding another client library.
const client = new OpenAI({
  apiKey: groqApiKey,
  baseURL: "https://api.groq.com/openai/v1",
  timeout: 30_000,
});

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function toChatMessages(
  messages: AIMessage[],
  attachments: AIAttachmentContent[],
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
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

  // PDFs arrive here already extracted to text by the attachment service —
  // images are never turned into text.
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

  // Same inlining as Gemini: bytes, not the signed URL, with the MIME type the
  // stored derivative actually has.
  const inlined = await Promise.all(
    imageAttachments.map((a) => inlineImage(a.url, "groq")),
  );

  const parts: ChatContentPart[] = [
    { type: "text", text: last.content + extractedText },
    ...inlined.map(
      (img): ChatContentPart => ({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
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

async function generateWithGroq(
  messages: AIMessage[],
  attachments: AIAttachmentContent[] = [],
): Promise<AIResponse> {
  const startedAt = Date.now();
  const imageCount = attachments.filter((a) => a.type === "image").length;
  try {
    logger.info("Calling Groq API", {
      model: groqModel,
      messageCount: messages.length,
      imageCount,
      documentCount: attachments.filter((a) => a.type === "text").length,
    });

    const prepStartedAt = Date.now();
    const chatMessages = await toChatMessages(messages, attachments);
    const prepMs = Date.now() - prepStartedAt;

    const apiStartedAt = Date.now();
    // reasoning_effort is a Groq extension the OpenAI SDK types don't carry.
    // GROQ_MODEL is a reasoning-capable model, and left to itself it spends
    // most of max_tokens thinking — measured at 904 of 979 completion tokens,
    // which returned finish_reason "length" with an empty or truncated answer.
    // "none" runs it in non-thinking mode: no reasoning is generated at all,
    // so the whole budget goes to the answer.
    //
    // reasoning_format is deliberately not sent alongside it. Verified against
    // the live API: with reasoning_effort "none" the reply carries only
    // role+content and no reasoning field, with or without reasoning_format,
    // so it would be dead configuration. splitReasoning below still guards the
    // content if a future model ever ignores this.
    const params = {
      model: groqModel,
      max_tokens: 1000,
      messages: chatMessages,
      reasoning_effort: "none",
    };
    const response = await client.chat.completions.create(
      params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );
    const apiMs = Date.now() - apiStartedAt;

    const choice = response.choices[0];
    const message = choice?.message as
      | { content?: string | null; reasoning?: string | null }
      | undefined;

    // Sizes and timings only — never the prompt, the URL or the image itself.
    logger.info("Groq API call completed", {
      model: groqModel,
      prepMs,
      apiMs,
      totalMs: Date.now() - startedAt,
      messageCount: messages.length,
      hasImage: imageCount > 0,
      imageCount,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      finishReason: choice?.finish_reason,
    });

    const { text, reasoning, inlineBlocksStripped } = splitReasoning(
      message?.content ?? "",
      message?.reasoning,
    );

    // Reaching this means reasoning_format was not honoured for this model and
    // the answer arrived inline instead. Count only — never the block itself.
    if (inlineBlocksStripped > 0) {
      logger.warn("Stripped inline reasoning from Groq content", {
        model: groqModel,
        inlineBlocksStripped,
      });
    }

    if (!text) {
      throw new AIProviderError(
        "No text content in Groq response",
        "groq",
        false,
      );
    }

    // Lengths only — reasoning content is never logged.
    logger.info("Groq response received successfully", {
      totalMs: Date.now() - startedAt,
      responseChars: text.length,
      reasoningChars: reasoning?.length ?? 0,
    });

    return {
      text,
      reasoning,
      provider: "groq",
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
      logger.error("Groq API error", {
        model: groqModel,
        status: error.status,
        message: error.message,
        failedAfterMs: Date.now() - startedAt,
      });
      throw new AIProviderError(
        error.message,
        "groq",
        isRetryableStatus(error.status),
        error.status,
      );
    }

    // Network failures, aborts/timeouts, etc. — treat as retryable.
    logger.error("Groq request failed", {
      model: groqModel,
      message: error instanceof Error ? error.message : "Unknown error",
      failedAfterMs: Date.now() - startedAt,
    });
    throw new AIProviderError(
      error instanceof Error ? error.message : "Unknown Groq error",
      "groq",
      true,
    );
  }
}

export { generateWithGroq };
