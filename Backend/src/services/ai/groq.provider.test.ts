import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => {
  class APIError extends Error {
    status: number | undefined;
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
    }
  }
  function OpenAI(this: Record<string, unknown>) {
    this.chat = { completions: { create: mockCreate } };
  }
  OpenAI.APIError = APIError;
  return { default: OpenAI };
});

import OpenAI from "openai";
import { generateWithGroq } from "./groq.provider.js";
import { AIProviderError } from "./types.js";
import { groqModel } from "../../config/config.js";

const messages = [{ role: "user" as const, content: "I have a rash" }];

const okResponse = {
  model: groqModel,
  choices: [{ message: { content: "groq says hi" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

// The signed URL is fetched by the backend, never handed to the provider.
function mockImageFetch(mimeType = "image/jpeg", body = "imagebytes") {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": mimeType }),
    arrayBuffer: async () => Buffer.from(body),
  } as unknown as Response);
}

beforeEach(() => {
  mockCreate.mockReset();
  vi.restoreAllMocks();
});

describe("generateWithGroq", () => {
  it("sends text-only requests as a plain string with the system prompt first", async () => {
    mockCreate.mockResolvedValue(okResponse);

    const result = await generateWithGroq(messages);

    const sent = mockCreate.mock.calls[0][0];
    expect(sent.model).toBe(groqModel);
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[1]).toEqual({ role: "user", content: "I have a rash" });
    expect(result.provider).toBe("groq");
    expect(result.text).toBe("groq says hi");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it("appends extracted PDF text to the user's turn", async () => {
    mockCreate.mockResolvedValue(okResponse);

    await generateWithGroq(messages, [
      { type: "text", label: "report.pdf", text: "Haemoglobin 11.2 g/dL" },
    ]);

    const sent = mockCreate.mock.calls[0][0];
    const last = sent.messages[sent.messages.length - 1];
    expect(typeof last.content).toBe("string");
    expect(last.content).toContain("I have a rash");
    expect(last.content).toContain("[Attached document: report.pdf]");
    expect(last.content).toContain("Haemoglobin 11.2 g/dL");
  });

  it("sends images as real image input, not as text or OCR", async () => {
    mockCreate.mockResolvedValue(okResponse);
    mockImageFetch();

    await generateWithGroq(messages, [
      { type: "image", url: "https://cdn.example/signed.jpg?sig=secret" },
    ]);

    const sent = mockCreate.mock.calls[0][0];
    const last = sent.messages[sent.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content[0]).toEqual({ type: "text", text: "I have a rash" });
    expect(last.content[1].type).toBe("image_url");
    // The signed URL must never reach the provider.
    expect(JSON.stringify(sent)).not.toContain("sig=secret");
  });

  it("preserves the image MIME type reported by the attachment URL", async () => {
    mockCreate.mockResolvedValue(okResponse);
    mockImageFetch("image/png");

    await generateWithGroq(messages, [
      { type: "image", url: "https://cdn.example/signed.png" },
    ]);

    const sent = mockCreate.mock.calls[0][0];
    const last = sent.messages[sent.messages.length - 1];
    expect(last.content[1].image_url.url).toBe(
      `data:image/png;base64,${Buffer.from("imagebytes").toString("base64")}`,
    );
  });

  it("marks 5xx and 429 as retryable and 4xx as not", async () => {
    const APIError = (OpenAI as unknown as { APIError: new (s: number, m: string) => Error })
      .APIError;

    mockCreate.mockRejectedValueOnce(new APIError(503, "upstream down"));
    await expect(generateWithGroq(messages)).rejects.toMatchObject({
      provider: "groq",
      retryable: true,
      status: 503,
    });

    mockCreate.mockRejectedValueOnce(new APIError(400, "bad request"));
    await expect(generateWithGroq(messages)).rejects.toMatchObject({
      provider: "groq",
      retryable: false,
      status: 400,
    });
  });

  it("surfaces an unreadable attachment as a provider error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    } as unknown as Response);

    await expect(
      generateWithGroq(messages, [
        { type: "image", url: "https://cdn.example/gone.jpg" },
      ]),
    ).rejects.toBeInstanceOf(AIProviderError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty completion instead of returning a blank answer", async () => {
    mockCreate.mockResolvedValue({
      model: groqModel,
      choices: [{ message: { content: "" }, finish_reason: "stop" }],
    });

    await expect(generateWithGroq(messages)).rejects.toMatchObject({
      provider: "groq",
      retryable: false,
    });
  });
});

// The leak this suite guards: with a reasoning model (GROQ_MODEL is
// env-configurable) Groq defaults to reasoning_format "raw" and returns the
// chain of thought inline in message.content wrapped in <think> tags.
describe("generateWithGroq reasoning separation", () => {
  const REASONING = "The user reports a rash. Consider contact dermatitis...";
  const ANSWER = "A mild rash is often irritation. Watch for spreading.";

  it("runs the model in non-thinking mode so max_tokens funds the answer", async () => {
    mockCreate.mockResolvedValue(okResponse);

    await generateWithGroq(messages);

    const sent = mockCreate.mock.calls[0][0];
    expect(sent.reasoning_effort).toBe("none");
    expect(sent.max_tokens).toBe(1000);
    // Dead config with reasoning_effort "none" — verified against the live API.
    expect(sent.reasoning_format).toBeUndefined();
  });

  it("keeps an explicit reasoning field out of text", async () => {
    mockCreate.mockResolvedValue({
      model: groqModel,
      choices: [
        {
          message: { content: ANSWER, reasoning: REASONING },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    const result = await generateWithGroq(messages);

    expect(result.text).toBe(ANSWER);
    expect(result.text).not.toContain(REASONING);
    expect(result.text).not.toContain("<think>");
    expect(result.reasoning).toBe(REASONING);
  });

  it("strips inline <think> content if reasoning_format is not honoured", async () => {
    mockCreate.mockResolvedValue({
      model: groqModel,
      choices: [
        {
          message: { content: `<think>${REASONING}</think>\n${ANSWER}` },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    const result = await generateWithGroq(messages);

    expect(result.text).toBe(ANSWER);
    expect(result.text).not.toContain("<think>");
    expect(result.text).not.toContain("Consider contact dermatitis");
    expect(result.reasoning).toContain(REASONING);
  });

  it("hides reasoning on image + text requests too", async () => {
    mockImageFetch();
    mockCreate.mockResolvedValue({
      model: groqModel,
      choices: [
        {
          message: { content: `<think>${REASONING}</think>${ANSWER}` },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    const result = await generateWithGroq(messages, [
      { type: "image", url: "https://cdn.example/signed.jpg" },
    ]);

    expect(result.text).toBe(ANSWER);
    expect(result.text).not.toContain("<think>");
    expect(result.reasoning).toContain(REASONING);
  });

  it("never writes reasoning content to the logger", async () => {
    const logger = (await import("../logger.js")).default;
    mockCreate.mockResolvedValue({
      model: groqModel,
      choices: [
        {
          message: { content: `<think>${REASONING}</think>${ANSWER}` },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    await generateWithGroq(messages);

    const logged = JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ]);
    expect(logged).not.toContain("contact dermatitis");
    expect(logged).not.toContain("<think>");
    // Length only.
    expect(logged).toContain("reasoningChars");
  });

  it("fails rather than answering when the reply was only reasoning", async () => {
    mockCreate.mockResolvedValue({
      model: groqModel,
      choices: [
        {
          message: { content: `<think>${REASONING}</think>` },
          finish_reason: "length",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    await expect(generateWithGroq(messages)).rejects.toBeInstanceOf(
      AIProviderError,
    );
  });
});
