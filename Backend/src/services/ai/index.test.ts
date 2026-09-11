import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  mockGenerateWithGroq,
  mockGenerateWithGemini,
  mockStreamWithGroq,
  mockStreamWithGemini,
} = vi.hoisted(() => ({
  mockGenerateWithGroq: vi.fn(),
  mockGenerateWithGemini: vi.fn(),
  mockStreamWithGroq: vi.fn(),
  mockStreamWithGemini: vi.fn(),
}));

vi.mock("./groq.provider.js", () => ({
  generateWithGroq: mockGenerateWithGroq,
  streamWithGroq: mockStreamWithGroq,
}));

vi.mock("./gemini.provider.js", () => ({
  generateWithGemini: mockGenerateWithGemini,
  streamWithGemini: mockStreamWithGemini,
}));

import {
  generateResponse,
  streamResponse,
  AIServiceError,
  AIStreamInterruptedError,
} from "./index.js";
import { AIProviderError } from "./types.js";

const messages = [{ role: "user" as const, content: "I have a headache" }];

beforeEach(() => {
  mockGenerateWithGroq.mockReset();
  mockGenerateWithGemini.mockReset();
  mockStreamWithGroq.mockReset();
  mockStreamWithGemini.mockReset();
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

// --- streaming ---------------------------------------------------------

/** A provider stream that yields the given deltas, then optionally throws. */
function providerStream(deltas: string[], failWith?: unknown) {
  return () =>
    (async function* () {
      for (const delta of deltas) {
        yield delta;
      }
      if (failWith) throw failWith;
    })();
}

async function collectEvents(stream: AsyncGenerator<unknown>) {
  const events: any[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function visibleText(events: any[]): string {
  return events
    .filter((e) => e.type === "delta")
    .map((e) => e.text)
    .join("");
}

describe("streamResponse", () => {
  it("streams Gemini start/delta/done and never touches Groq", async () => {
    mockStreamWithGemini.mockImplementation(providerStream(["Hel", "lo"]));

    const events = await collectEvents(streamResponse(messages));

    expect(events.map((e) => e.type)).toEqual([
      "start",
      "delta",
      "delta",
      "done",
    ]);
    expect(events[0].provider).toBe("gemini");
    expect(events[events.length - 1]).toMatchObject({
      text: "Hello",
      provider: "gemini",
      retries: 0,
      chunks: 2,
    });
    expect(mockStreamWithGroq).not.toHaveBeenCalled();
  });

  it("streams Groq successfully when it is the provider that runs", async () => {
    mockStreamWithGemini.mockImplementation(
      providerStream([], new AIProviderError("429", "gemini", true, 429)),
    );
    mockStreamWithGroq.mockImplementation(providerStream(["groq ", "answer"]));

    const events = await collectEvents(streamResponse(messages));

    expect(visibleText(events)).toBe("groq answer");
    expect(events[events.length - 1]).toMatchObject({ provider: "groq", retries: 2 });
  });

  it("retries Gemini before the first chunk without duplicating output", async () => {
    mockStreamWithGemini
      .mockImplementationOnce(
        providerStream([], new AIProviderError("503", "gemini", true, 503)),
      )
      .mockImplementationOnce(providerStream(["recovered"]));

    const events = await collectEvents(streamResponse(messages));

    expect(visibleText(events)).toBe("recovered");
    expect(events.filter((e) => e.type === "start")).toHaveLength(1);
    expect(mockStreamWithGemini).toHaveBeenCalledTimes(2);
    expect(mockStreamWithGroq).not.toHaveBeenCalled();
  });

  it("falls back to Groq when Gemini fails before emitting anything", async () => {
    mockStreamWithGemini.mockImplementation(
      providerStream([], new AIProviderError("timeout", "gemini", true)),
    );
    mockStreamWithGroq.mockImplementation(providerStream(["groq covers it"]));

    const events = await collectEvents(streamResponse(messages));

    expect(events[0]).toMatchObject({ type: "start", provider: "groq" });
    expect(visibleText(events)).toBe("groq covers it");
    expect(mockStreamWithGemini).toHaveBeenCalledTimes(2);
    expect(mockStreamWithGroq).toHaveBeenCalledTimes(1);
  });

  it("ends the stream rather than mixing providers once Gemini has emitted text", async () => {
    mockStreamWithGemini.mockImplementation(
      providerStream(
        ["This appears to be "],
        new AIProviderError("connection reset", "gemini", true),
      ),
    );
    mockStreamWithGroq.mockImplementation(providerStream(["GROQ CONTINUES"]));

    const events: any[] = [];
    await expect(
      (async () => {
        for await (const event of streamResponse(messages)) events.push(event);
      })(),
    ).rejects.toThrow(AIStreamInterruptedError);

    expect(visibleText(events)).toBe("This appears to be ");
    expect(mockStreamWithGroq).not.toHaveBeenCalled();
    expect(mockStreamWithGemini).toHaveBeenCalledTimes(1);
  });

  it("does not fail over on a non-retryable first failure", async () => {
    mockStreamWithGemini.mockImplementation(
      providerStream([], new AIProviderError("bad request", "gemini", false, 400)),
    );

    await expect(collectEvents(streamResponse(messages))).rejects.toThrow(
      AIServiceError,
    );
    expect(mockStreamWithGemini).toHaveBeenCalledTimes(1);
    expect(mockStreamWithGroq).not.toHaveBeenCalled();
  });

  it("raises a safe AIServiceError when Groq also fails", async () => {
    mockStreamWithGemini.mockImplementation(
      providerStream([], new AIProviderError("timeout", "gemini", true)),
    );
    mockStreamWithGroq.mockImplementation(
      providerStream([], new AIProviderError("groq down", "groq", true, 500)),
    );

    await expect(collectEvents(streamResponse(messages))).rejects.toThrow(
      AIServiceError,
    );
  });

  it("stops silently when the client aborts, with no fallback attempt", async () => {
    const controller = new AbortController();
    mockStreamWithGemini.mockImplementation((_m, _a, signal?: AbortSignal) =>
      (async function* () {
        yield "partial answer";
        controller.abort();
        throw new Error("The operation was aborted");
      })(),
    );

    const events = await collectEvents(
      streamResponse(messages, [], controller.signal),
    );

    expect(visibleText(events)).toBe("partial answer");
    expect(events.some((e) => e.type === "done")).toBe(false);
    expect(mockStreamWithGroq).not.toHaveBeenCalled();
  });

  it("passes the abort signal down to the provider", async () => {
    const controller = new AbortController();
    mockStreamWithGemini.mockImplementation(providerStream(["ok"]));

    await collectEvents(streamResponse(messages, [], controller.signal));

    expect(mockStreamWithGemini).toHaveBeenCalledWith(
      messages,
      [],
      controller.signal,
    );
  });
});
