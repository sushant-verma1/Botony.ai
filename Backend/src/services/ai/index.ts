import * as Sentry from "@sentry/node";
import logger from "../logger.js";
import { generateWithGrok } from "./grok.provider.js";
import { generateWithGemini } from "./gemini.provider.js";
import { AIProviderError, AIServiceError } from "./types.js";
import type { AIAttachmentContent, AIMessage, AIResponse } from "./types.js";

// Tags only — never the prompt/message content itself.
function reportProviderFailure(error: unknown, provider: "grok" | "gemini") {
  Sentry.captureException(error, {
    tags: {
      aiProvider: provider,
      aiStatus: error instanceof AIProviderError ? error.status : undefined,
    },
  });
}

const AI_UNAVAILABLE_MESSAGE =
  "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.";

const RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Grok is primary. A retryable Grok failure (timeout, 429, 5xx, network error)
 * gets one retry, then one Gemini attempt. A non-retryable Grok failure
 * (4xx other than 429) goes straight to AIServiceError — failing over to
 * Gemini would not help and would double the cost of a bad request.
 * At most 3 upstream calls total; never an unbounded loop.
 */
async function generateResponse(
  messages: AIMessage[],
  attachments: AIAttachmentContent[] = [],
): Promise<AIResponse> {
  try {
    return await generateWithGrok(messages, attachments);
  } catch (firstError) {
    if (!(firstError instanceof AIProviderError) || !firstError.retryable) {
      logger.error("Grok failed with a non-retryable error", {
        status: firstError instanceof AIProviderError ? firstError.status : undefined,
      });
      throw new AIServiceError(AI_UNAVAILABLE_MESSAGE, 503, firstError);
    }

    logger.warn("Grok request failed, retrying once", {
      status: firstError.status,
    });
    await delay(RETRY_DELAY_MS);

    try {
      return await generateWithGrok(messages, attachments);
    } catch (secondError) {
      logger.warn("Grok retry failed, failing over to Gemini", {
        status:
          secondError instanceof AIProviderError ? secondError.status : undefined,
      });

      try {
        return await generateWithGemini(messages, attachments);
      } catch (geminiError) {
        logger.error("Both Grok and Gemini failed", {
          geminiStatus:
            geminiError instanceof AIProviderError
              ? geminiError.status
              : undefined,
        });
        reportProviderFailure(secondError, "grok");
        reportProviderFailure(geminiError, "gemini");
        throw new AIServiceError(AI_UNAVAILABLE_MESSAGE, 503, geminiError);
      }
    }
  }
}

export { generateResponse, AIServiceError, type AIMessage, type AIAttachmentContent, type AIResponse };
