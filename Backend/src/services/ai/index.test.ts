import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockGenerateWithGroq, mockGenerateWithGemini } = vi.hoisted(() => ({
  mockGenerateWithGroq: vi.fn(),
  mockGenerateWithGemini: vi.fn(),
}));

vi.mock("./groq.provider.js", () => ({
  generateWithGroq: mockGenerateWithGroq,
}));

vi.mock("./gemini.provider.js", () => ({
  generateWithGemini: mockGenerateWithGemini,
}));

import { generateResponse, AIServiceError } from "./index.js";
import { AIProviderError } from "./types.js";

const messages = [{ role: "user" as const, content: "I have a headache" }];

beforeEach(() => {
  mockGenerateWithGroq.mockReset();
  mockGenerateWithGemini.mockReset();
  vi.useRealTimers();
});

describe("generateResponse failover", () => {
  it("returns the Gemini response on success without calling Groq", async () => {
    mockGenerateWithGemini.mockResolvedValue({
      text: "gemini says hi",
      provider: "gemini",
      model: "gemini-3.6-flash",
    });

    const result = await generateResponse(messages);

    expect(result.provider).toBe("gemini");
    expect(result.text).toBe("gemini says hi");
    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(1);
    expect(mockGenerateWithGroq).not.toHaveBeenCalled();
  });

  it("retries Gemini once on a transient failure, then returns Gemini's retried success", async () => {
    mockGenerateWithGemini
      .mockRejectedValueOnce(
        new AIProviderError("upstream 503", "gemini", true, 503),
      )
      .mockResolvedValueOnce({
        text: "gemini recovered",
        provider: "gemini",
        model: "gemini-3.6-flash",
      });

    const result = await generateResponse(messages);

    expect(result.provider).toBe("gemini");
    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(2);
    expect(mockGenerateWithGroq).not.toHaveBeenCalled();
  });

  it("fails over to Groq once both Gemini attempts are exhausted", async () => {
    mockGenerateWithGemini.mockRejectedValue(
      new AIProviderError("rate limited", "gemini", true, 429),
    );
    mockGenerateWithGroq.mockResolvedValue({
      text: "groq covers it",
      provider: "groq",
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
    });

    const result = await generateResponse(messages);

    expect(result.provider).toBe("groq");
    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(2);
    expect(mockGenerateWithGroq).toHaveBeenCalledTimes(1);
  });

  it("does not fail over to Groq on a non-retryable client error", async () => {
    mockGenerateWithGemini.mockRejectedValue(
      new AIProviderError("bad request", "gemini", false, 400),
    );

    await expect(generateResponse(messages)).rejects.toThrow(AIServiceError);

    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(1);
    expect(mockGenerateWithGroq).not.toHaveBeenCalled();
  });

  it("throws a safe AIServiceError when both providers fail", async () => {
    mockGenerateWithGemini.mockRejectedValue(
      new AIProviderError("timeout", "gemini", true),
    );
    mockGenerateWithGroq.mockRejectedValue(
      new AIProviderError("groq down", "groq", false, 500),
    );

    await expect(generateResponse(messages)).rejects.toThrow(AIServiceError);

    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(2);
    expect(mockGenerateWithGroq).toHaveBeenCalledTimes(1);
  });

  it("never makes more than 3 upstream calls total", async () => {
    mockGenerateWithGemini.mockRejectedValue(
      new AIProviderError("timeout", "gemini", true),
    );
    mockGenerateWithGroq.mockRejectedValue(
      new AIProviderError("groq down", "groq", true, 500),
    );

    await expect(generateResponse(messages)).rejects.toThrow(AIServiceError);

    const totalCalls =
      mockGenerateWithGroq.mock.calls.length +
      mockGenerateWithGemini.mock.calls.length;
    expect(totalCalls).toBeLessThanOrEqual(3);
  });
});
