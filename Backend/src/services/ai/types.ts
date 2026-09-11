export type AIRole = "user" | "assistant";

export interface AIMessage {
  role: AIRole;
  content: string;
}

export interface AIImageAttachment {
  type: "image";
  url: string;
}

export interface AITextAttachment {
  type: "text";
  label: string;
  text: string;
}

export type AIAttachmentContent = AIImageAttachment | AITextAttachment;

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIResponse {
  /** The only field that may reach the patient or Message.content. */
  text: string;
  /**
   * Model chain of thought, kept separate so it cannot reach `text`. Never
   * returned to the client, never persisted, never logged as content — the
   * providers log its length only.
   */
  reasoning?: string;
  provider: "gemini" | "groq";
  model: string;
  usage?: AIUsage;
  finishReason?: string;
}

export type AIProviderName = "gemini" | "groq";

/**
 * What a streaming generation emits. `done` carries the assembled answer —
 * the deltas are never persisted individually.
 */
export type AIStreamEvent =
  | { type: "start"; provider: AIProviderName; model: string }
  | { type: "delta"; text: string }
  | {
      type: "done";
      text: string;
      provider: AIProviderName;
      model: string;
      retries: number;
      chunks: number;
      firstChunkMs?: number;
      totalMs: number;
    };

/**
 * A provider died after visible text had already reached the patient. Failing
 * over here would splice two models' answers together mid-sentence, so the
 * stream ends instead — see streamResponse.
 */
export class AIStreamInterruptedError extends Error {
  userMessage: string;
  provider: AIProviderName;
  originalMessage?: string;

  constructor(
    userMessage: string,
    provider: AIProviderName,
    originalError?: unknown,
  ) {
    super(userMessage);
    this.name = "AIStreamInterruptedError";
    this.userMessage = userMessage;
    this.provider = provider;
    this.originalMessage =
      originalError instanceof Error ? originalError.message : undefined;
  }
}

export class AIProviderError extends Error {
  provider: "gemini" | "groq";
  status?: number;
  retryable: boolean;

  constructor(
    message: string,
    provider: "gemini" | "groq",
    retryable: boolean,
    status?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

export class AIServiceError extends Error {
  status: number;
  userMessage: string;
  originalMessage?: string;

  constructor(userMessage: string, status = 503, originalError?: unknown) {
    super(userMessage);
    this.name = "AIServiceError";
    this.status = status;
    this.userMessage = userMessage;
    this.originalMessage =
      originalError instanceof Error ? originalError.message : undefined;
  }
}
