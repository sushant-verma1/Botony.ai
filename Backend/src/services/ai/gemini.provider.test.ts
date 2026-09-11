import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockGenerateContent, mockGenerateContentStream } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockGenerateContentStream: vi.fn(),
}));

vi.mock("@google/genai", () => {
  function GoogleGenAI(this: Record<string, unknown>) {
    this.models = {
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    };
  }
  return { GoogleGenAI, ThinkingLevel: { MINIMAL: "MINIMAL" } };
});

import { generateWithGemini, streamWithGemini } from "./gemini.provider.js";
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
  mockGenerateContentStream.mockReset();
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

// --- streaming ---------------------------------------------------------

interface ChunkPart {
  text: string;
  thought?: boolean;
}

function geminiStream(...chunks: ChunkPart[][]) {
  return Promise.resolve(
    (async function* () {
      for (const parts of chunks) {
        yield { candidates: [{ content: { parts } }] };
      }
    })(),
  );
}

async function collect(stream: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of stream) out.push(delta);
  return out;
}

describe("streamWithGemini", () => {
  it("yields user-visible text chunk by chunk", async () => {
    mockGenerateContentStream.mockReturnValue(
      geminiStream([{ text: "A mild" }], [{ text: " rash" }]),
    );

    expect(await collect(streamWithGemini(messages))).toEqual([
      "A mild",
      " rash",
    ]);

    const sent = mockGenerateContentStream.mock.calls[0][0];
    expect(sent.config.maxOutputTokens).toBe(1000);
    expect(sent.config.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
  });

  it("never yields thought parts", async () => {
    mockGenerateContentStream.mockReturnValue(
      geminiStream(
        [{ text: REASONING, thought: true }],
        [{ text: ANSWER }],
      ),
    );

    const deltas = await collect(streamWithGemini(messages));

    expect(deltas.join("")).toBe(ANSWER);
    expect(deltas.join("")).not.toContain(REASONING);
  });

  it("withholds an inline <think> block even when it is split across chunks", async () => {
    mockGenerateContentStream.mockReturnValue(
      geminiStream(
        [{ text: "Before <thi" }],
        [{ text: "nk>secret reason" }],
        [{ text: "ing</think> after" }],
      ),
    );

    const text = (await collect(streamWithGemini(messages))).join("");

    expect(text).toBe("Before  after");
    expect(text).not.toContain("secret");
  });

  it("inlines an attached image as bytes and keeps its MIME type", async () => {
    const fetchSpy = mockImageFetch("image/png");
    mockGenerateContentStream.mockReturnValue(geminiStream([{ text: ANSWER }]));

    await collect(
      streamWithGemini(messages, [
        { type: "image", url: "https://signed.example/image" },
      ]),
    );

    expect(fetchSpy).toHaveBeenCalledWith("https://signed.example/image");
    const parts = mockGenerateContentStream.mock.calls[0][0].contents.at(-1)
      .parts;
    expect(parts.at(-1).inlineData.mimeType).toBe("image/png");
    expect(parts.at(-1).inlineData.data).toBe(
      Buffer.from("imagebytes").toString("base64"),
    );
    // The signed URL itself never reaches the model.
    expect(JSON.stringify(parts)).not.toContain("signed.example");
  });

  it("passes extracted document text alongside the question", async () => {
    mockGenerateContentStream.mockReturnValue(geminiStream([{ text: ANSWER }]));

    await collect(
      streamWithGemini(messages, [
        { type: "text", label: "attached document", text: "HbA1c 5.4%" },
      ]),
    );

    const parts = mockGenerateContentStream.mock.calls[0][0].contents.at(-1)
      .parts;
    expect(parts[0].text).toContain("I have a rash");
    expect(parts[0].text).toContain("HbA1c 5.4%");
  });

  it("forwards the abort signal to the SDK", async () => {
    const controller = new AbortController();
    mockGenerateContentStream.mockReturnValue(geminiStream([{ text: ANSWER }]));

    await collect(streamWithGemini(messages, [], controller.signal));

    expect(mockGenerateContentStream.mock.calls[0][0].config.abortSignal).toBe(
      controller.signal,
    );
  });

  it("fails non-retryably when the stream carries no visible text", async () => {
    mockGenerateContentStream.mockReturnValue(
      geminiStream([{ text: REASONING, thought: true }]),
    );

    await expect(collect(streamWithGemini(messages))).rejects.toMatchObject({
      name: "AIProviderError",
      retryable: false,
    });
  });

  it("marks an upstream 503 mid-stream as retryable", async () => {
    mockGenerateContentStream.mockReturnValue(
      Promise.resolve(
        (async function* () {
          yield { candidates: [{ content: { parts: [{ text: "partial" }] } }] };
          throw new Error("upstream 503");
        })(),
      ),
    );

    await expect(collect(streamWithGemini(messages))).rejects.toMatchObject({
      name: "AIProviderError",
      retryable: true,
    });
  });
});
