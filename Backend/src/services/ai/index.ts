import * as Sentry from "@sentry/node";
import logger from "../logger.js";
import { generateWithGemini, streamWithGemini } from "./gemini.provider.js";
import { generateWithGroq, streamWithGroq } from "./groq.provider.js";
import { geminiModel, groqModel } from "../../config/config.js";
import {
  AIProviderError,
  AIServiceError,
  AIStreamInterruptedError,
} from "./types.js";
import type {
  AIAttachmentContent,
  AIMessage,
  AIProviderName,
  AIResponse,
  AIStreamEvent,
} from "./types.js";

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


const AI_INTERRUPTED_MESSAGE =
  "The answer was cut off before it finished. Please ask again.";

interface StreamAttempt {
  provider: AIProviderName;
  model: string;
  run: (
    messages: AIMessage[],
    attachments: AIAttachmentContent[],
    signal?: AbortSignal,
  ) => AsyncGenerator<string>;
}

/**
 * The streaming counterpart of generateResponse, with the same failover
 * ladder: Gemini, one Gemini retry on a retryable failure, then one Groq
 * attempt. At most 3 upstream calls.
 *
 * The one rule streaming adds: failover is only allowed *before* the first
 * visible character reaches the patient. Once text has been emitted, a
 * provider failure ends the stream with AIStreamInterruptedError rather than
 * splicing a second model's answer onto the first one's half-sentence. The
 * same rule is what stops a retry from replaying content the patient has
 * already seen.
 */
async function* streamResponse(
  messages: AIMessage[],
  attachments: AIAttachmentContent[] = [],
  signal?: AbortSignal,
): AsyncGenerator<AIStreamEvent> {
  const startedAt = Date.now();

  const attempts: StreamAttempt[] = [
    { provider: "gemini", model: geminiModel, run: streamWithGemini },
    { provider: "gemini", model: geminiModel, run: streamWithGemini },
    { provider: "groq", model: groqModel, run: streamWithGroq },
  ];

  logger.info("AI stream started", {
    provider: attempts[0].provider,
    messageCount: messages.length,
    attachmentCount: attachments.length,
  });

  for (let index = 0; index < attempts.length; index++) {
    const { provider, model, run } = attempts[index];
    const attemptStartedAt = Date.now();
    let chunks = 0;
    let chars = 0;
    let firstChunkMs: number | undefined;
    let text = "";

    try {
      for await (const delta of run(messages, attachments, signal)) {
        if (chunks === 0) {
          firstChunkMs = Date.now() - attemptStartedAt;
          yield { type: "start", provider, model };
        }

        chunks += 1;
        chars += delta.length;
        text += delta;
        yield { type: "delta", text: delta };
      }

      logger.info("AI stream succeeded", {
        provider,
        model,
        attempt: index + 1,
        retries: index,
        fallbackProvider: provider === attempts[0].provider ? undefined : provider,
        chunks,
        outputChars: chars,
        firstChunkMs,
        attemptMs: Date.now() - attemptStartedAt,
        totalMs: Date.now() - startedAt,
      });

      yield {
        type: "done",
        text,
        provider,
        model,
        retries: index,
        chunks,
        firstChunkMs,
        totalMs: Date.now() - startedAt,
      };
      return;
    } catch (error) {
      // A client disconnect aborts the provider call; that is not a failure
      // to fail over from, and there is nobody left to serve.
      if (signal?.aborted) {
        logger.info("AI stream aborted by the client", {
          provider,
          attempt: index + 1,
          chunks,
          outputChars: chars,
          totalMs: Date.now() - startedAt,
        });
        return;
      }

      logger.warn("AI stream attempt failed", {
        provider,
        attempt: index + 1,
        chunks,
        outputChars: chars,
        attemptMs: Date.now() - attemptStartedAt,
        status: error instanceof AIProviderError ? error.status : undefined,
        retryable:
          error instanceof AIProviderError ? error.retryable : false,
      });

      if (chunks > 0) {
        logger.error("AI stream interrupted after visible output", {
          provider,
          attempt: index + 1,
          outputChars: chars,
          totalMs: Date.now() - startedAt,
        });
        reportProviderFailure(error, provider);
        throw new AIStreamInterruptedError(
          AI_INTERRUPTED_MESSAGE,
          provider,
          error,
        );
      }

      const isLastAttempt = index === attempts.length - 1;
      const nonRetryableFirstFailure =
        index === 0 &&
        (!(error instanceof AIProviderError) || !error.retryable);

      if (isLastAttempt || nonRetryableFirstFailure) {
        logger.error("AI stream could not be started", {
          provider,
          attempt: index + 1,
          retries: index,
          totalMs: Date.now() - startedAt,
        });
        reportProviderFailure(error, provider);
        throw new AIServiceError(AI_UNAVAILABLE_MESSAGE, 503, error);
      }

      if (attempts[index + 1].provider === provider) {
        await delay(RETRY_DELAY_MS);
      }

      logger.warn("Retrying the AI stream", {
        failedProvider: provider,
        nextProvider: attempts[index + 1].provider,
        attempt: index + 2,
      });
    }
  }
}

export {
  generateResponse,
  streamResponse,
  AIServiceError,
  AIStreamInterruptedError,
  type AIMessage,
  type AIAttachmentContent,
  type AIResponse,
  type AIStreamEvent,
};
