import * as Sentry from "@sentry/node";
import logger from "../logger.js";
import { generateWithGemini } from "./gemini.provider.js";
import { generateWithGroq } from "./groq.provider.js";
import { AIProviderError, AIServiceError } from "./types.js";
import type { AIAttachmentContent, AIMessage, AIResponse } from "./types.js";

// Tags only — never the prompt/message content itself.
function reportProviderFailure(error: unknown, provider: "gemini" | "groq") {
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
 * Gemini is primary. A retryable Gemini failure (timeout, 429, 5xx, network
 * error) gets one retry, then one Groq attempt. A non-retryable Gemini failure
 * (4xx other than 429) goes straight to AIServiceError — failing over to
 * Groq would not help and would double the cost of a bad request.
 * At most 3 upstream calls total; never an unbounded loop.
 */
async function generateResponse(
  messages: AIMessage[],
  attachments: AIAttachmentContent[] = [],
): Promise<AIResponse> {
  // Attempt-level timings, so a slow response can be attributed to a single
  // slow call rather than to retries and failover stacking up.
  const startedAt = Date.now();
  logger.info("AI generation started", {
    provider: "gemini",
    attempt: 1,
    messageCount: messages.length,
    attachmentCount: attachments.length,
  });

  let attemptStartedAt = Date.now();
  try {
    const response = await generateWithGemini(messages, attachments);
    logger.info("AI generation succeeded", {
      provider: "gemini",
      attempt: 1,
      retries: 0,
      attemptMs: Date.now() - attemptStartedAt,
      totalMs: Date.now() - startedAt,
    });
    return response;
  } catch (firstError) {
    logger.warn("AI generation attempt failed", {
      provider: "gemini",
      attempt: 1,
      attemptMs: Date.now() - attemptStartedAt,
      status: firstError instanceof AIProviderError ? firstError.status : undefined,
      retryable: firstError instanceof AIProviderError ? firstError.retryable : false,
    });

    if (!(firstError instanceof AIProviderError) || !firstError.retryable) {
      logger.error("Gemini failed with a non-retryable error", {
        status: firstError instanceof AIProviderError ? firstError.status : undefined,
        totalMs: Date.now() - startedAt,
      });
      throw new AIServiceError(AI_UNAVAILABLE_MESSAGE, 503, firstError);
    }

    logger.warn("Gemini request failed, retrying once", {
      status: firstError.status,
      retryDelayMs: RETRY_DELAY_MS,
    });
    await delay(RETRY_DELAY_MS);

    attemptStartedAt = Date.now();
    logger.info("AI generation started", { provider: "gemini", attempt: 2 });
    try {
      const response = await generateWithGemini(messages, attachments);
      logger.info("AI generation succeeded", {
        provider: "gemini",
        attempt: 2,
        retries: 1,
        attemptMs: Date.now() - attemptStartedAt,
        totalMs: Date.now() - startedAt,
      });
      return response;
    } catch (secondError) {
      logger.warn("Gemini retry failed, failing over to Groq", {
        status:
          secondError instanceof AIProviderError ? secondError.status : undefined,
        attemptMs: Date.now() - attemptStartedAt,
        totalMs: Date.now() - startedAt,
      });

      attemptStartedAt = Date.now();
      logger.info("AI generation started", { provider: "groq", attempt: 3 });
      try {
        const response = await generateWithGroq(messages, attachments);
        logger.info("AI generation succeeded", {
          provider: "groq",
          attempt: 3,
          retries: 2,
          attemptMs: Date.now() - attemptStartedAt,
          totalMs: Date.now() - startedAt,
        });
        return response;
      } catch (groqError) {
        logger.error("Both Gemini and Groq failed", {
          groqStatus:
            groqError instanceof AIProviderError ? groqError.status : undefined,
          groqAttemptMs: Date.now() - attemptStartedAt,
          totalMs: Date.now() - startedAt,
          retries: 2,
        });
        reportProviderFailure(secondError, "gemini");
        reportProviderFailure(groqError, "groq");
        throw new AIServiceError(AI_UNAVAILABLE_MESSAGE, 503, groqError);
      }
    }
  }
}

export { generateResponse, AIServiceError, type AIMessage, type AIAttachmentContent, type AIResponse };
