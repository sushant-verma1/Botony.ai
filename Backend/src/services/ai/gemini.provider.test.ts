import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => {
  function GoogleGenAI(this: Record<string, unknown>) {
    this.models = { generateContent: mockGenerateContent };
  }
  return { GoogleGenAI, ThinkingLevel: { MINIMAL: "MINIMAL" } };
});

import { generateWithGemini } from "./gemini.provider.js";
import { AIProviderError } from "./types.js";

const messages = [{ role: "user" as const, content: "I have a rash" }];

const REASONING = "The user reports a rash. Consider contact dermatitis...";
const ANSWER = "A mild rash is often irritation. Watch for spreading.";

function geminiResponse(text: string, parts?: unknown[]) {
  return {
    text,
    candidates: [{ content: { parts: parts ?? [{ text }] }, finishReason: "STOP" }],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      thoughtsTokenCount: 40,
      totalTokenCount: 70,
    },
  };
}

function mockImageFetch(mimeType = "image/jpeg", body = "imagebytes") {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": mimeType }),
    arrayBuffer: async () => Buffer.from(body),
  } as unknown as Response);
}

beforeEach(() => {
  mockGenerateContent.mockReset();
  vi.restoreAllMocks();
});

describe("generateWithGemini reasoning separation", () => {
  it("returns the answer alone and no reasoning for an ordinary reply", async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(ANSWER));

    const result = await generateWithGemini(messages);

    expect(result.text).toBe(ANSWER);
    expect(result.reasoning).toBeUndefined();
    expect(result.provider).toBe("gemini");
  });

  it("excludes thought parts — the SDK's .text getter skips part.thought", async () => {
    // Mirrors a real payload: a thought part is present on the candidate but
    // the SDK getter omits it from .text.
    mockGenerateContent.mockResolvedValue(
      geminiResponse(ANSWER, [
        { text: REASONING, thought: true },
        { text: ANSWER },
      ]),
    );

    const result = await generateWithGemini(messages);

    expect(result.text).toBe(ANSWER);
    expect(result.text).not.toContain("contact dermatitis");
  });

  it("strips an inline <think> block if one ever appears in text", async () => {
    mockGenerateContent.mockResolvedValue(
      geminiResponse(`<think>${REASONING}</think>\n${ANSWER}`),
    );

    const result = await generateWithGemini(messages);

    expect(result.text).toBe(ANSWER);
    expect(result.text).not.toContain("<think>");
    expect(result.reasoning).toContain(REASONING);
  });

  it("hides reasoning on image + text requests too", async () => {
    mockImageFetch();
    mockGenerateContent.mockResolvedValue(
      geminiResponse(`<think>${REASONING}</think>${ANSWER}`),
    );

    const result = await generateWithGemini(messages, [
      { type: "image", url: "https://cdn.example/signed.jpg" },
    ]);

    expect(result.text).toBe(ANSWER);
    expect(result.text).not.toContain("<think>");
    expect(result.reasoning).toContain(REASONING);
  });

  it("never writes reasoning content to the logger", async () => {
    const logger = (await import("../logger.js")).default;
    mockGenerateContent.mockResolvedValue(
      geminiResponse(`<think>${REASONING}</think>${ANSWER}`),
    );

    await generateWithGemini(messages);

    const logged = JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ]);
    expect(logged).not.toContain("contact dermatitis");
    expect(logged).not.toContain("<think>");
    expect(logged).toContain("reasoningChars");
  });

  it("fails rather than answering when the reply was only reasoning", async () => {
    mockGenerateContent.mockResolvedValue(
      geminiResponse(`<think>${REASONING}</think>`),
    );

    await expect(generateWithGemini(messages)).rejects.toBeInstanceOf(
      AIProviderError,
    );
  });
});
