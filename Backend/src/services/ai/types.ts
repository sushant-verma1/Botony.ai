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
  text: string;
  provider: "grok" | "gemini";
  model: string;
  usage?: AIUsage;
  finishReason?: string;
}

export class AIProviderError extends Error {
  provider: "grok" | "gemini";
  status?: number;
  retryable: boolean;

  constructor(
    message: string,
    provider: "grok" | "gemini",
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
