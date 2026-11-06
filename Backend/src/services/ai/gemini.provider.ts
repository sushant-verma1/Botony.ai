import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import { geminiApiKey, geminiEmbeddingModel, geminiModel } from "../../config/config.js";
import logger from "../logger.js";
import { describeError } from "../../utils/error.util.js";
import { inlineImage } from "./image.js";
import { getSystemPrompt } from "./prompt.js";
import { createTemporalContext, type TemporalContext } from "../temporal-context.service.js";
import { createReasoningFilter, splitReasoning } from "./reasoning.js";
import type {
  AIAttachmentContent,
  AIMessage,
  AIResponse,
  AIToolCall,
  AIToolCallResponse,
  AIToolDefinition,
} from "./types.js";
import { AIProviderError } from "./types.js";

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

async function toGeminiContents(
  messages: AIMessage[],
  attachments: AIAttachmentContent[],
): Promise<GeminiContent[]> {
  const contents: GeminiContent[] = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const last = messages[messages.length - 1];
  if (!last) return contents;

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

  // Gemini cannot fetch a URL itself, so the image is inlined as bytes.
  const imageParts: GeminiPart[] = (
    await Promise.all(imageAttachments.map((a) => inlineImage(a.url, "gemini")))
  ).map((img) => ({
    inlineData: { mimeType: img.mimeType, data: img.base64 },
  }));

  // Images are only ever attached to the user's own turn.
  contents.push({
    role: "user",
    parts: [{ text: last.content + extractedText }, ...imageParts],
  });

  return contents;
}

function isRetryableMessage(message: string): boolean {
  return /429|500|502|503|504|timeout|network|ECONNRESET|ETIMEDOUT/i.test(
    message,
  );
}

async function generateWithGemini(
  messages: AIMessage[],
  attachments: AIAttachmentContent[] = [],
  verifiedPatientContext?: string,
  temporalContext?: TemporalContext,
): Promise<AIResponse> {
  const startedAt = Date.now();
  try {
    logger.info("Calling Gemini API", {
      model: geminiModel,
      messageCount: messages.length,
      imageCount: attachments.filter((a) => a.type === "image").length,
      documentCount: attachments.filter((a) => a.type === "text").length,
    });

    const prepStartedAt = Date.now();
    const contents = await toGeminiContents(messages, attachments);
    const prepMs = Date.now() - prepStartedAt;

    // Sizes only — the parts themselves are patient content and never logged.
    const inlineImages = contents
      .flatMap((c) => c.parts)
      .filter((p) => p.inlineData);
    const inlineImageBytes = inlineImages.reduce(
      (sum, p) => sum + (p.inlineData?.data.length ?? 0),
      0,
    );
    const textChars = contents
      .flatMap((c) => c.parts)
      .reduce((sum, p) => sum + (p.text?.length ?? 0), 0);

    const apiStartedAt = Date.now();
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents,
      config: {
        systemInstruction: getSystemPrompt(verifiedPatientContext, temporalContext ?? createTemporalContext()),
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    const apiMs = Date.now() - apiStartedAt;

    // The one line that answers "where did the minute go": how long building
    // the request took (image download + base64) vs. how long Gemini itself
    // held the connection.
    logger.info("Gemini API call completed", {
      model: geminiModel,
      prepMs,
      apiMs,
      totalMs: Date.now() - startedAt,
      messageCount: messages.length,
      hasImage: inlineImages.length > 0,
      imageCount: inlineImages.length,
      imageMimeTypes: inlineImages.map((p) => p.inlineData?.mimeType),
      inlineImageBase64Bytes: inlineImageBytes,
      approxInputChars: textChars,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
      thoughtsTokens: response.usageMetadata?.thoughtsTokenCount,
      totalTokens: response.usageMetadata?.totalTokenCount,
      finishReason: response.candidates?.[0]?.finishReason,
    });

    // `response.text` already excludes parts flagged `thought: true`, and
    // includeThoughts is off, so thought summaries are not returned at all.
    // splitReasoning is applied anyway to keep both providers on one path.
    const { text, reasoning, inlineBlocksStripped } = splitReasoning(
      response.text ?? "",
    );

    if (inlineBlocksStripped > 0) {
      logger.warn("Stripped inline reasoning from Gemini content", {
        model: geminiModel,
        inlineBlocksStripped,
      });
    }

    if (!text) {
      throw new AIProviderError(
        "No text content in Gemini response",
        "gemini",
        false,
      );
    }

    // Lengths only — reasoning content is never logged.
    logger.info("Gemini response received successfully", {
      totalMs: Date.now() - startedAt,
      responseChars: text.length,
      reasoningChars: reasoning?.length ?? 0,
    });

    return {
      text,
      reasoning,
      provider: "gemini",
      model: geminiModel,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      },
      finishReason: response.candidates?.[0]?.finishReason ?? undefined,
    };
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    const details = describeError(error);
    logger.error("Gemini request failed", {
      model: geminiModel,
      messageCount: messages.length,
      failedAfterMs: Date.now() - startedAt,
      ...details,
    });
    throw new AIProviderError(
      details.message,
      "gemini",
      isRetryableMessage(details.message),
      details.httpCode,
    );
  }
}

/** Native Gemini function-calling adapter. Tool execution stays server-side. */
async function generateToolCallsWithGemini(
  messages: AIMessage[],
  tools: AIToolDefinition[],
  temporalContext?: TemporalContext,
): Promise<AIToolCallResponse> {
  const startedAt = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: await toGeminiContents(messages, []),
      config: {
        systemInstruction: getSystemPrompt(undefined, temporalContext ?? createTemporalContext()),
        maxOutputTokens: 600,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        tools: [{
          functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parametersJsonSchema: tool.parameters,
          })),
        }],
      },
    });
    const toolCalls: AIToolCall[] = (response.functionCalls ?? []).flatMap((call) => {
      if (!call.name) return [];
      const args = call.args;
      return [{
        id: call.id,
        name: call.name,
        arguments: args && typeof args === "object" && !Array.isArray(args)
          ? args as Record<string, unknown>
          : {},
      }];
    });
    const { text } = splitReasoning(response.text ?? "");
    logger.info("Gemini function-call response received", {
      model: geminiModel,
      toolCount: tools.length,
      callCount: toolCalls.length,
      totalMs: Date.now() - startedAt,
    });
    return { text, toolCalls, provider: "gemini", model: geminiModel };
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    const details = describeError(error);
    throw new AIProviderError(details.message, "gemini", isRetryableMessage(details.message), details.httpCode);
  }
}

/** Text embeddings used only for server-side tool discovery; no patient text is logged. */
async function embedTextWithGemini(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const response = await ai.models.embedContent({
      model: geminiEmbeddingModel,
      contents: texts,
      config: { taskType: "SEMANTIC_SIMILARITY", outputDimensionality: 768 },
    });
    const embeddings = (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
    if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length === 0)) {
      throw new Error("Gemini returned incomplete tool-search embeddings");
    }
    logger.info("Gemini tool-search embeddings generated", {
      model: geminiEmbeddingModel,
      textCount: texts.length,
      dimensions: embeddings[0]?.length,
    });
    return embeddings;
  } catch (error) {
    const details = describeError(error);
    logger.warn("Gemini tool-search embeddings failed", {
      model: geminiEmbeddingModel,
      textCount: texts.length,
      ...details,
    });
    throw new AIProviderError(details.message, "gemini", isRetryableMessage(details.message), details.httpCode);
  }
}

/**
 * Only parts the patient may see. `part.thought` is Gemini's marker for chain
 * of thought; includeThoughts is off so these should never arrive, and they
 * are dropped here anyway rather than trusted not to.
 */
function visibleText(chunk: GenerateContentResponse): string {
  const parts = chunk.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/**
 * Streaming twin of generateWithGemini: same model, same config, same image
 * inlining — it yields user-visible text as it arrives instead of returning
 * the finished answer. Yields nothing at all if the model produced no visible
 * text, which the caller treats as a failed attempt.
 */
async function* streamWithGemini(
  messages: AIMessage[],
  attachments: AIAttachmentContent[] = [],
  signal?: AbortSignal,
  verifiedPatientContext?: string,
  temporalContext?: TemporalContext,
): AsyncGenerator<string> {
  const startedAt = Date.now();
  const filter = createReasoningFilter();
  let chunks = 0;
  let visibleChars = 0;
  let firstChunkMs: number | undefined;
  let usage: GenerateContentResponse["usageMetadata"];
  let finishReason: string | undefined;

  try {
    logger.info("Calling Gemini streaming API", {
      model: geminiModel,
      messageCount: messages.length,
      imageCount: attachments.filter((a) => a.type === "image").length,
      documentCount: attachments.filter((a) => a.type === "text").length,
    });

    const prepStartedAt = Date.now();
    const contents = await toGeminiContents(messages, attachments);
    const prepMs = Date.now() - prepStartedAt;

    const stream = await ai.models.generateContentStream({
      model: geminiModel,
      contents,
      config: {
        systemInstruction: getSystemPrompt(verifiedPatientContext, temporalContext ?? createTemporalContext()),
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal: signal,
      },
    });

    for await (const chunk of stream) {
      usage = chunk.usageMetadata ?? usage;
      finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;

      const text = filter.push(visibleText(chunk));
      if (!text) continue;

      chunks += 1;
      visibleChars += text.length;
      firstChunkMs ??= Date.now() - startedAt;
      yield text;
    }

    const tail = filter.flush();
    if (tail) {
      chunks += 1;
      visibleChars += tail.length;
      firstChunkMs ??= Date.now() - startedAt;
      yield tail;
    }

    if (filter.inlineBlocksStripped > 0) {
      logger.warn("Stripped inline reasoning from a Gemini stream", {
        model: geminiModel,
        inlineBlocksStripped: filter.inlineBlocksStripped,
      });
    }

    if (visibleChars === 0) {
      throw new AIProviderError(
        "No text content in Gemini stream",
        "gemini",
        false,
      );
    }

    // Counts and timings only — never the generated text.
    logger.info("Gemini stream completed", {
      model: geminiModel,
      prepMs,
      firstChunkMs,
      totalMs: Date.now() - startedAt,
      chunks,
      visibleChars,
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      thoughtsTokens: usage?.thoughtsTokenCount,
      finishReason,
    });
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }

    const details = describeError(error);
    logger.error("Gemini stream failed", {
      model: geminiModel,
      messageCount: messages.length,
      chunksBeforeFailure: chunks,
      failedAfterMs: Date.now() - startedAt,
      ...details,
    });
    throw new AIProviderError(
      details.message,
      "gemini",
      isRetryableMessage(details.message),
      details.httpCode,
    );
  }
}

export { embedTextWithGemini, generateWithGemini, generateToolCallsWithGemini, streamWithGemini };
