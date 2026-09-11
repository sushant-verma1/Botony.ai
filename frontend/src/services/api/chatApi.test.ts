import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("./api", () => ({
  default: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  authSession: { fetch: mockFetch },
}));

import { chatAPI } from "./chatApi";

/**
 * A streamed response, deliberately cut into small pieces so a frame that
 * straddles two network chunks is exercised rather than assumed away.
 */
function sseResponse(body: string, pieceSize = 7): Response {
  const encoder = new TextEncoder();
  const pieces = body.match(new RegExp(`[\\s\\S]{1,${pieceSize}}`, "g")) ?? [];

  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    }),
  } as unknown as Response;
}

function frame(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const deltas: string[] = [];
const handlers = {
  onStart: vi.fn(),
  onDelta: (text: string) => deltas.push(text),
};

beforeEach(() => {
  mockFetch.mockReset();
  handlers.onStart.mockReset();
  deltas.length = 0;
});

describe("chatAPI.streamMessage", () => {
  it("posts the message and forwards the abort signal", async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValue(
      sseResponse(
        frame("start", { provider: "gemini" }) +
          frame("delta", { text: "hi" }) +
          frame("done", {
            messageId: "u1",
            assistantMessageId: "a1",
            type: "normal",
          }),
      ),
    );

    await chatAPI.streamMessage("conv-1", "hello", ["att-1"], {
      ...handlers,
      signal: controller.signal,
    });

    expect(mockFetch).toHaveBeenCalledWith("/chat/conv-1/message", {
      method: "POST",
      body: JSON.stringify({ content: "hello", attachmentIds: ["att-1"] }),
      signal: controller.signal,
    });
  });

  it("reports each delta in order and returns the done payload", async () => {
    mockFetch.mockResolvedValue(
      sseResponse(
        frame("start", { provider: "gemini" }) +
          frame("delta", { text: "This" }) +
          frame("delta", { text: " appears" }) +
          frame("delta", { text: " to be bacteria." }) +
          frame("done", {
            messageId: "u1",
            assistantMessageId: "a1",
            type: "normal",
          }),
      ),
    );

    const result = await chatAPI.streamMessage(
      "conv-1",
      "what is this?",
      undefined,
      handlers,
    );

    expect(handlers.onStart).toHaveBeenCalledWith("gemini");
    expect(deltas).toEqual(["This", " appears", " to be bacteria."]);
    expect(result).toEqual({
      messageId: "u1",
      assistantMessageId: "a1",
      type: "normal",
    });
  });

  it("keeps blank lines inside an answer out of the framing", async () => {
    mockFetch.mockResolvedValue(
      sseResponse(
        frame("start", { provider: "gemini" }) +
          frame("delta", { text: "line one\n\nline two" }) +
          frame("done", {
            messageId: "u1",
            assistantMessageId: "a1",
            type: "normal",
          }),
      ),
    );

    await chatAPI.streamMessage("conv-1", "hi", undefined, handlers);

    expect(deltas.join("")).toBe("line one\n\nline two");
  });

  it("rejects with the message from an error event", async () => {
    mockFetch.mockResolvedValue(
      sseResponse(
        frame("error", {
          code: "AI_UNAVAILABLE",
          message: "Our AI assistant is temporarily unavailable.",
        }),
      ),
    );

    await expect(
      chatAPI.streamMessage("conv-1", "hi", undefined, handlers),
    ).rejects.toThrow("Our AI assistant is temporarily unavailable.");
  });

  it("rejects when the stream ends without a done event", async () => {
    mockFetch.mockResolvedValue(
      sseResponse(
        frame("start", { provider: "gemini" }) +
          frame("delta", { text: "half an ans" }),
      ),
    );

    await expect(
      chatAPI.streamMessage("conv-1", "hi", undefined, handlers),
    ).rejects.toThrow(/cut off/i);
    expect(deltas).toEqual(["half an ans"]);
  });

  it("surfaces a JSON error raised before the stream opens", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      body: null,
      json: async () => ({ message: "Not allowed" }),
    } as unknown as Response);

    await expect(
      chatAPI.streamMessage("conv-1", "hi", undefined, handlers),
    ).rejects.toThrow("Not allowed");
  });
});
