import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockGenerateWithGrok, mockGenerateWithGemini } = vi.hoisted(() => ({
  mockGenerateWithGrok: vi.fn(),
  mockGenerateWithGemini: vi.fn(),
}));

vi.mock("./grok.provider.js", () => ({
  generateWithGrok: mockGenerateWithGrok,
}));

vi.mock("./gemini.provider.js", () => ({
  generateWithGemini: mockGenerateWithGemini,
}));

import { generateResponse, AIServiceError } from "./index.js";
import { AIProviderError } from "./types.js";

const messages = [{ role: "user" as const, content: "I have a headache" }];

beforeEach(() => {
  mockGenerateWithGrok.mockReset();
  mockGenerateWithGemini.mockReset();
  vi.useRealTimers();
});

describe("generateResponse failover", () => {
  it("returns the Grok response on success without calling Gemini", async () => {
    mockGenerateWithGrok.mockResolvedValue({
      text: "grok says hi",
      provider: "grok",
      model: "grok-4.6",
    });

    const result = await generateResponse(messages);

    expect(result.provider).toBe("grok");
    expect(result.text).toBe("grok says hi");
    expect(mockGenerateWithGrok).toHaveBeenCalledTimes(1);
    expect(mockGenerateWithGemini).not.toHaveBeenCalled();
  });

  it("retries Grok once on a transient failure, then returns Grok's retried success", async () => {
    mockGenerateWithGrok
      .mockRejectedValueOnce(
        new AIProviderError("upstream 503", "grok", true, 503),
      )
      .mockResolvedValueOnce({
        text: "grok recovered",
        provider: "grok",
        model: "grok-4.6",
      });

    const result = await generateResponse(messages);

    expect(result.provider).toBe("grok");
    expect(mockGenerateWithGrok).toHaveBeenCalledTimes(2);
    expect(mockGenerateWithGemini).not.toHaveBeenCalled();
  });

  it("fails over to Gemini once both Grok attempts are exhausted", async () => {
    mockGenerateWithGrok.mockRejectedValue(
      new AIProviderError("rate limited", "grok", true, 429),
    );
    mockGenerateWithGemini.mockResolvedValue({
      text: "gemini covers it",
      provider: "gemini",
      model: "gemini-3.6-flash",
    });

    const result = await generateResponse(messages);

    expect(result.provider).toBe("gemini");
    expect(mockGenerateWithGrok).toHaveBeenCalledTimes(2);
    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(1);
  });

  it("does not fail over to Gemini on a non-retryable client error", async () => {
    mockGenerateWithGrok.mockRejectedValue(
      new AIProviderError("bad request", "grok", false, 400),
    );

    await expect(generateResponse(messages)).rejects.toThrow(AIServiceError);

    expect(mockGenerateWithGrok).toHaveBeenCalledTimes(1);
    expect(mockGenerateWithGemini).not.toHaveBeenCalled();
  });

  it("throws a safe AIServiceError when both providers fail", async () => {
    mockGenerateWithGrok.mockRejectedValue(
      new AIProviderError("timeout", "grok", true),
    );
    mockGenerateWithGemini.mockRejectedValue(
      new AIProviderError("gemini down", "gemini", false, 500),
    );

    await expect(generateResponse(messages)).rejects.toThrow(AIServiceError);

    expect(mockGenerateWithGrok).toHaveBeenCalledTimes(2);
    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(1);
  });

  it("never makes more than 3 upstream calls total", async () => {
    mockGenerateWithGrok.mockRejectedValue(
      new AIProviderError("timeout", "grok", true),
    );
    mockGenerateWithGemini.mockRejectedValue(
      new AIProviderError("gemini down", "gemini", true, 500),
    );

    await expect(generateResponse(messages)).rejects.toThrow(AIServiceError);

    const totalCalls =
      mockGenerateWithGrok.mock.calls.length +
      mockGenerateWithGemini.mock.calls.length;
    expect(totalCalls).toBeLessThanOrEqual(3);
  });
});
