import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { geminiApiKey, geminiModel } from "../../config/config.js";
import logger from "../logger.js";
import { describeError } from "../../utils/error.util.js";
import { inlineImage } from "./image.js";
import { MEDICAL_SYSTEM_PROMPT } from "./prompt.js";
import { splitReasoning } from "./reasoning.js";
import type { AIAttachmentContent, AIMessage, AIResponse } from "./types.js";
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
        systemInstruction: MEDICAL_SYSTEM_PROMPT,
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

export { generateWithGemini };
