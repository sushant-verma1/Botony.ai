import { GoogleGenAI } from "@google/genai";
import { geminiApiKey, geminiModel } from "../../config/config.js";
import logger from "../logger.js";
import { MEDICAL_SYSTEM_PROMPT } from "./prompt.js";
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

function toGeminiContents(
  messages: AIMessage[],
  attachments: AIAttachmentContent[],
): GeminiContent[] {
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
  const extractedText = textAttachments
    .map((a) => `\n\n[Attached document: ${a.label}]\n${a.text}`)
    .join("");

  // Gemini fallback receives extracted text but not raw image bytes: images
  // are already reduced to a signed URL by the controller, and re-fetching
  // that URL server-side to inline it is unnecessary work on the failover
  // path — fall back with text context only.
  contents.push({
    role: "user",
    parts: [{ text: last.content + extractedText }],
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
  try {
    logger.info("Calling Gemini API", { messageCount: messages.length });

    const contents = toGeminiContents(messages, attachments);

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents,
      config: {
        systemInstruction: MEDICAL_SYSTEM_PROMPT,
        maxOutputTokens: 1000,
      },
    });

    const text = response.text;

    if (!text) {
      throw new AIProviderError(
        "No text content in Gemini response",
        "gemini",
        false,
      );
    }

    logger.info("Gemini response received successfully");

    return {
      text,
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

    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Gemini request failed", { message });
    throw new AIProviderError(message, "gemini", isRetryableMessage(message));
  }
}

export { generateWithGemini };
