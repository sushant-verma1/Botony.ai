import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  createMockRes,
  emitClose,
  lastSseFrame,
  sseBody,
  sseFrames,
} from "../test/mockExpress.js";

vi.mock("../services/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../config/db.js", () => ({
  prisma: {
    conversation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { mockStreamResponse } = vi.hoisted(() => ({
  mockStreamResponse: vi.fn(),
}));

vi.mock("../services/ai/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/ai/index.js")>();
  return { ...actual, streamResponse: mockStreamResponse };
});

const {
  mockValidateAttachmentsForMessage,
  mockBindAttachmentsToMessage,
} = vi.hoisted(() => ({
  mockValidateAttachmentsForMessage: vi.fn(),
  mockBindAttachmentsToMessage: vi.fn(),
}));

vi.mock("../services/attachment.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/attachment.service.js")>();
  return {
    ...actual,
    validateAttachmentsForMessage: mockValidateAttachmentsForMessage,
    bindAttachmentsToMessage: mockBindAttachmentsToMessage,
  };
});

import { prisma } from "../config/db.js";
import {
  AIServiceError,
  AIStreamInterruptedError,
} from "../services/ai/index.js";
import { AttachmentError } from "../services/attachment.service.js";
import {
  newChatController,
  listConversationsController,
  renameConversationController,
  deleteConversationController,
  messageController,
  getHistoryController,
} from "./chat.controller.js";

// Replays a finished answer as the event sequence streamResponse emits.
// `extra` is spread into the done event so a test can simulate a provider
// leaking a field the controller must not forward.
function aiStream(text: string, extra: Record<string, unknown> = {}) {
  return (async function* () {
    yield { type: "start", provider: "groq", model: "qwen/qwen3.6-27b" };
    for (const part of text.match(/[\s\S]{1,8}/g) ?? []) {
      yield { type: "delta", text: part };
    }
    yield {
      type: "done",
      text,
      provider: "groq",
      model: "qwen/qwen3.6-27b",
      retries: 0,
      chunks: 1,
      firstChunkMs: 1,
      totalMs: 2,
      ...extra,
    };
  })();
}

// Fails before the first delta, i.e. before anything is visible to the client.
function failingStream(error: unknown) {
  return (async function* () {
    throw error;
    // eslint-disable-next-line no-unreachable
    yield { type: "delta", text: "" };
  })();
}

// Loosely typed so a single helper can satisfy every controller's
// differently-parameterized Express.Request<> signature in this file.
function buildReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    user: { userId: "user-1" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.conversation.create).mockReset();
  vi.mocked(prisma.conversation.findMany).mockReset();
  vi.mocked(prisma.conversation.findUnique).mockReset();
  vi.mocked(prisma.conversation.update).mockReset();
  vi.mocked(prisma.conversation.delete).mockReset();
  vi.mocked(prisma.message.create).mockReset();
  vi.mocked(prisma.message.findMany).mockReset();
  vi.mocked(prisma.message.findFirst).mockReset();
  vi.mocked(prisma.$transaction).mockReset();
  vi.mocked(prisma.$transaction).mockImplementation(((cb: any) =>
    cb(prisma)) as never);
  mockStreamResponse.mockReset();
  mockValidateAttachmentsForMessage.mockReset().mockResolvedValue([]);
  mockBindAttachmentsToMessage.mockReset().mockResolvedValue(undefined);
});

describe("newChatController", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const req = buildReq({ user: undefined } as never);
    const res = createMockRes();

    await newChatController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("creates a conversation titled 'New chat'", async () => {
    vi.mocked(prisma.conversation.create).mockResolvedValue({
      id: "conv-1",
    } as never);

    const req = buildReq();
    const res = createMockRes();

    await newChatController(req, res);

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { userId: "user-1", title: "New chat" },
    });
    expect(res.json).toHaveBeenCalledWith({
      conversationId: "conv-1",
      message: "New chat created successfully",
    });
  });
});

describe("listConversationsController", () => {
  it("returns only the authenticated user's conversations", async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      { id: "conv-1", title: "A" },
    ] as never);

    const req = buildReq();
    const res = createMockRes();

    await listConversationsController(req, res);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
    expect(res.json).toHaveBeenCalledWith({
      conversations: [{ id: "conv-1", title: "A" }],
    });
  });
});

describe("renameConversationController", () => {
  it("returns 404 when the conversation does not exist", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null as never);

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { title: "New title" },
    } as never);
    const res = createMockRes();

    await renameConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when the conversation belongs to another user", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "someone-else",
    } as never);

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { title: "New title" },
    } as never);
    const res = createMockRes();

    await renameConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("updates the title and returns it on success", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
    } as never);
    vi.mocked(prisma.conversation.update).mockResolvedValue({
      id: "conv-1",
      title: "New title",
    } as never);

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { title: "New title" },
    } as never);
    const res = createMockRes();

    await renameConversationController(req, res);

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv-1" },
        data: { title: "New title" },
      }),
    );
    expect(res.json).toHaveBeenCalledWith({
      conversationId: "conv-1",
      title: "New title",
    });
  });
});

describe("deleteConversationController", () => {
  it("returns 404 when the conversation does not exist", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null as never);

    const req = buildReq({ params: { chatid: "conv-1" } } as never);
    const res = createMockRes();

    await deleteConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when the conversation belongs to another user", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "someone-else",
    } as never);

    const req = buildReq({ params: { chatid: "conv-1" } } as never);
    const res = createMockRes();

    await deleteConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
  });

  it("deletes the conversation on success", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
    } as never);

    const req = buildReq({ params: { chatid: "conv-1" } } as never);
    const res = createMockRes();

    await deleteConversationController(req, res);

    expect(prisma.conversation.delete).toHaveBeenCalledWith({
      where: { id: "conv-1" },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "Conversation deleted successfully",
    });
  });
});

describe("messageController", () => {
  it("returns 400 when content is missing", async () => {
    const req = buildReq({
      params: { chatid: "conv-1" },
      body: {},
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "content is required" });
  });

  it("returns 400 when content is only whitespace", async () => {
    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "   " },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when content exceeds 3000 characters", async () => {
    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "a".repeat(3001) },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Message too long (max 3000 chars)",
    });
  });

  it("returns 404 when the conversation does not exist", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null as never);

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "Hello" },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when the conversation belongs to another user", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "someone-else",
      status: "ongoing",
    } as never);

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "Hello" },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Not allowed" });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(mockStreamResponse).not.toHaveBeenCalled();
  });

  describe("emergency detection (patient safety)", () => {
    it("short-circuits to the canned emergency response and never calls the AI service", async () => {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: "ongoing",
      } as never);
      vi.mocked(prisma.message.create)
        .mockResolvedValueOnce({ id: "user-msg-1" } as never)
        .mockResolvedValueOnce({ id: "assistant-msg-1" } as never);

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "I am having chest pain" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(mockStreamResponse).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            role: "user",
            emergencyDetected: true,
          }),
        }),
      );
      expect(prisma.message.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            role: "assistant",
            emergencyDetected: true,
          }),
        }),
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: "conv-1" },
        data: { status: "emergency" },
      });
      const frames = sseFrames(res);
      expect(frames.map((f) => f.event)).toEqual(["start", "delta", "done"]);
      expect(frames[1].data.text).toContain("EMERGENCY");
      expect(frames[2].data).toEqual({
        type: "emergency",
        messageId: "user-msg-1",
        assistantMessageId: "assistant-msg-1",
      });
    });
  });

  describe("normal message flow", () => {
    function mockNormalFlow(options: {
      conversationStatus?: string;
      previousMessagesCount?: number;
    } = {}) {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: options.conversationStatus ?? "ongoing",
      } as never);
      vi.mocked(prisma.message.create)
        .mockResolvedValueOnce({ id: "user-msg-1" } as never)
        .mockResolvedValueOnce({ id: "assistant-msg-1" } as never);
      const count = options.previousMessagesCount ?? 1;
      vi.mocked(prisma.message.findMany).mockResolvedValue(
        Array.from({ length: count }, (_, i) => ({
          role: i === 0 ? "user" : "assistant",
          content: `message ${i}`,
        })) as never,
      );
      mockStreamResponse.mockImplementation(() =>
        aiStream("Here is some health info."),
      );
    }

    it("returns the AI answer unchanged, with no blanket disclaimer", async () => {
      mockNormalFlow();

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "I have a mild headache" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(mockStreamResponse).toHaveBeenCalled();

      const frames = sseFrames(res);
      const streamed = frames
        .filter((f) => f.event === "delta")
        .map((f) => f.data.text)
        .join("");
      expect(streamed).toBe("Here is some health info.");
      expect(frames[frames.length - 1]).toEqual({
        event: "done",
        data: {
          type: "normal",
          messageId: "user-msg-1",
          assistantMessageId: "assistant-msg-1",
        },
      });

      // The assistant row is written once, with the assembled text.
      const assistantWrite = vi.mocked(prisma.message.create).mock.calls[1][0]
        .data as { content: string };
      expect(assistantWrite.content).toBe("Here is some health info.");
    });

    it("flips conversation status from 'emergency' back to 'ongoing'", async () => {
      mockNormalFlow({ conversationStatus: "emergency" });

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "Feeling better now, just a follow up" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "ongoing" }),
        }),
      );
    });

    it("sets the conversation title from the first message", async () => {
      mockNormalFlow({ previousMessagesCount: 1 });

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "I have a mild headache" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "I have a mild headache" }),
        }),
      );
    });

    it("truncates the title to 60 characters for long first messages", async () => {
      mockNormalFlow({ previousMessagesCount: 1 });
      const longContent = "a".repeat(80);

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: longContent },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: `${"a".repeat(60)}…`,
          }),
        }),
      );
    });

    it("does not set a title when this is not the first message", async () => {
      mockNormalFlow({ previousMessagesCount: 3 });

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "Another follow up" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      const updateArg = vi.mocked(prisma.conversation.update).mock
        .calls[0][0] as { data: Record<string, unknown> };
      expect(updateArg.data.title).toBeUndefined();
    });
  });

  describe("model reasoning is never exposed (patient safety)", () => {
    const REASONING = "Chain of thought: weigh meningitis vs tension headache.";
    const ANSWER = "Here is some health info.";

    function mockFlowReturning(aiResult: Record<string, unknown>) {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: "ongoing",
      } as never);
      vi.mocked(prisma.message.create)
        .mockResolvedValueOnce({ id: "user-msg-1" } as never)
        .mockResolvedValueOnce({ id: "assistant-msg-1" } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([
        { role: "user", content: "message 0" },
      ] as never);
      mockStreamResponse.mockImplementation(() =>
        aiStream(aiResult.text as string, { reasoning: aiResult.reasoning }),
      );
    }

    it("does not persist reasoning in Message.content or return it", async () => {
      mockFlowReturning({
        text: ANSWER,
        reasoning: REASONING,
        provider: "groq",
        model: "qwen/qwen3.6-27b",
      });

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "I have a mild headache" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      // Only aiResult.text reaches the assistant row.
      const assistantWrite = vi.mocked(prisma.message.create).mock.calls[1][0]
        .data as { content: string };
      expect(assistantWrite.content).toBe(ANSWER);
      expect(assistantWrite.content).not.toContain(REASONING);
      expect(JSON.stringify(assistantWrite)).not.toContain("Chain of thought");

      // ...and only the deltas reach the client: nothing the done event
      // happened to carry alongside them.
      const frames = sseFrames(res);
      const streamed = frames
        .filter((f) => f.event === "delta")
        .map((f) => f.data.text)
        .join("");
      expect(streamed).toBe(ANSWER);
      expect(JSON.stringify(frames)).not.toContain("Chain of thought");
      expect(JSON.stringify(frames)).not.toContain("reasoning");
    });

    it("keeps reasoning out of the logs", async () => {
      const logger = (await import("../services/logger.js")).default;
      mockFlowReturning({
        text: ANSWER,
        reasoning: REASONING,
        provider: "groq",
        model: "qwen/qwen3.6-27b",
      });

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "I have a mild headache" },
      } as never);

      await messageController(req, createMockRes());

      const logged = JSON.stringify([
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.warn).mock.calls,
        ...vi.mocked(logger.error).mock.calls,
      ]);
      expect(logged).not.toContain("Chain of thought");
    });
  });

  describe("token limit", () => {
    it("returns 400 without calling the AI service when the token estimate is exceeded", async () => {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: "ongoing",
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: "user-msg-1",
      } as never);
      // 3 previous messages, each ~200,000 chars -> well over the 50000 token estimate
      vi.mocked(prisma.message.findMany).mockResolvedValue(
        Array.from({ length: 3 }, () => ({
          role: "user",
          content: "a".repeat(200000),
        })) as never,
      );

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "One more message" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(mockStreamResponse).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Message exceeds token limit. Please start a new conversation.",
        }),
      );
      expect(prisma.message.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("AI service failures", () => {
    it("returns the AIServiceError's status and safe message", async () => {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: "ongoing",
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: "user-msg-1",
      } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([] as never);
      mockStreamResponse.mockImplementation(() =>
        failingStream(
          new AIServiceError(
            "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
            503,
          ),
        ),
      );

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "Hello" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      // The stream is open by then, so the failure arrives as an error event
      // carrying the safe message — never the provider's own.
      expect(sseFrames(res)).toEqual([
        {
          event: "error",
          data: {
            code: "AI_UNAVAILABLE",
            message:
              "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
          },
        },
      ]);
      expect(prisma.message.create).toHaveBeenCalledTimes(1);
    });

    it("returns a generic 500 for an unexpected non-AI error", async () => {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: "ongoing",
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: "user-msg-1",
      } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([] as never);
      mockStreamResponse.mockImplementation(() =>
        failingStream(new Error("Unexpected")),
      );

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "Hello" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      const frames = sseFrames(res);
      expect(frames).toHaveLength(1);
      expect(frames[0].event).toBe("error");
      expect(frames[0].data.code).toBe("AI_UNAVAILABLE");
      expect(JSON.stringify(frames)).not.toContain("Unexpected");
    });
  });
});

describe("messageController attachments", () => {
  function mockNormalFlow() {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
      status: "ongoing",
    } as never);
    vi.mocked(prisma.message.create)
      .mockResolvedValueOnce({ id: "user-msg-1" } as never)
      .mockResolvedValueOnce({ id: "assistant-msg-1" } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { role: "user", content: "message 0" },
    ] as never);
    mockStreamResponse.mockImplementation(() =>
      aiStream("Here is some health info."),
    );
  }

  it("rejects the message when attachment validation fails, without calling the AI", async () => {
    mockValidateAttachmentsForMessage.mockRejectedValue(
      new AttachmentError("One or more attachments were not found", 400),
    );

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "see attached", attachmentIds: ["someone-elses-attachment"] },
    } as never);
    const res = createMockRes();

    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
      status: "ongoing",
    } as never);

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "One or more attachments were not found",
    });
    expect(mockStreamResponse).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("binds validated attachments to the created message", async () => {
    mockNormalFlow();
    mockValidateAttachmentsForMessage.mockResolvedValue([
      {
        id: "att-1",
        userId: "user-1",
        kind: "IMAGE",
        mimeType: "image/jpeg",
        status: "READY",
        publicId: "medical/images/user-1/uuid",
      },
    ]);

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "see attached", attachmentIds: ["att-1"] },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(mockValidateAttachmentsForMessage).toHaveBeenCalledWith("user-1", [
      "att-1",
    ]);
    expect(mockBindAttachmentsToMessage).toHaveBeenCalledWith(
      ["att-1"],
      "user-msg-1",
    );
    expect(lastSseFrame(res)).toEqual(
      expect.objectContaining({
        event: "done",
        data: expect.objectContaining({ type: "normal" }),
      }),
    );
  });
});

describe("getHistoryController", () => {
  it("returns 404 when the conversation does not exist", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null as never);

    const req = buildReq({ params: { chatid: "conv-1" } } as never);
    const res = createMockRes();

    await getHistoryController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when the conversation belongs to another user", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "someone-else",
    } as never);

    const req = buildReq({ params: { chatid: "conv-1" } } as never);
    const res = createMockRes();

    await getHistoryController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Not allowed" });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for a cursor that does not belong to this conversation", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
    } as never);
    vi.mocked(prisma.message.findFirst).mockResolvedValue(null as never);

    const req = buildReq({
      params: { chatid: "conv-1" },
      query: { before: "msg-from-another-conversation" },
    } as never);
    const res = createMockRes();

    await getHistoryController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid pagination cursor",
    });
  });

  it("returns messages in chronological order with pagination info", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
    } as never);
    // 31 messages returned (limit 30 + 1) newest-first, to simulate hasMore
    vi.mocked(prisma.message.findMany).mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        id: `msg-${30 - i}`,
        content: `content ${30 - i}`,
      })) as never,
    );

    const req = buildReq({ params: { chatid: "conv-1" } } as never);
    const res = createMockRes();

    await getHistoryController(req, res);

    const jsonArg = vi.mocked(res.json).mock.calls[0][0] as {
      messages: { id: string }[];
      hasMore: boolean;
      nextCursor: string | null;
    };
    expect(jsonArg.hasMore).toBe(true);
    expect(jsonArg.messages).toHaveLength(30);
    // chronological order: oldest of the returned page first
    expect(jsonArg.messages[0].id).toBe("msg-1");
    expect(jsonArg.messages[29].id).toBe("msg-30");
    expect(jsonArg.nextCursor).toBe("msg-1");
  });

  it("reports hasMore false and nextCursor null when there is no more history", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { id: "msg-1", content: "hi" },
    ] as never);

    const req = buildReq({ params: { chatid: "conv-1" } } as never);
    const res = createMockRes();

    await getHistoryController(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ hasMore: false, nextCursor: null }),
    );
  });
});

describe("Cross-user data isolation (IDOR protection)", () => {
  const OWNER_ID = "owner-user";
  const ATTACKER_ID = "attacker-user";
  const CONVERSATION_ID = "owner-conv-1";

  function buildAttackerReq(overrides: Record<string, unknown> = {}) {
    return buildReq({
      params: { chatid: CONVERSATION_ID },
      user: { userId: ATTACKER_ID },
      ...overrides,
    });
  }

  it("blocks another user from renaming someone else's conversation", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: OWNER_ID,
    } as never);

    const req = buildAttackerReq({ body: { title: "Hijacked title" } });
    const res = createMockRes();

    await renameConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Not allowed" });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("blocks another user from deleting someone else's conversation", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: OWNER_ID,
    } as never);

    const req = buildAttackerReq();
    const res = createMockRes();

    await deleteConversationController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Not allowed" });
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
  });

  it("blocks another user from sending a message into someone else's conversation", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: OWNER_ID,
      status: "ongoing",
    } as never);

    const req = buildAttackerReq({ body: { content: "Injected message" } });
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Not allowed" });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(mockStreamResponse).not.toHaveBeenCalled();
  });

  it("blocks another user from reading someone else's conversation history", async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: OWNER_ID,
    } as never);

    const req = buildAttackerReq();
    const res = createMockRes();

    await getHistoryController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Not allowed" });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it("never lists another user's conversations in the caller's own list", async () => {
    // Simulate the database holding conversations for both users; the mock
    // asserts the controller filters by the caller's userId rather than
    // trusting whatever findMany happens to return.
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([
      { id: "attacker-conv-1", title: "Attacker's own chat" },
    ] as never);

    const req = buildReq({ user: { userId: ATTACKER_ID } });
    const res = createMockRes();

    await listConversationsController(req, res);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: ATTACKER_ID } }),
    );
    const jsonArg = vi.mocked(res.json).mock.calls[0][0] as {
      conversations: { id: string }[];
    };
    expect(
      jsonArg.conversations.some((c) => c.id === CONVERSATION_ID),
    ).toBe(false);
  });
});

describe("messageController attachment hardening", () => {
  function mockNormalFlow() {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
      status: "ongoing",
    } as never);
    vi.mocked(prisma.message.create)
      .mockResolvedValueOnce({ id: "user-msg-1" } as never)
      .mockResolvedValueOnce({ id: "assistant-msg-1" } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { role: "user", content: "message 0" },
    ] as never);
    mockStreamResponse.mockImplementation(() =>
      aiStream("Here is some health info."),
    );
  }

  it("refuses a message referencing an attachment that is not READY", async () => {
    // validateAttachmentsForMessage is what enforces READY; the controller
    // must surface that refusal rather than proceeding to the provider.
    mockValidateAttachmentsForMessage.mockRejectedValue(
      new AttachmentError("One or more attachments are not ready yet", 400),
    );
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
      status: "ongoing",
    } as never);

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "see attached", attachmentIds: ["pending-att"] },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockStreamResponse).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("fails the message if binding is refused at the last moment", async () => {
    mockNormalFlow();
    mockValidateAttachmentsForMessage.mockResolvedValue([
      {
        id: "att-1",
        userId: "user-1",
        kind: "IMAGE",
        mimeType: "image/jpeg",
        status: "READY",
        publicId: "medical/images/user-1/uuid",
      },
    ]);
    // Something changed between validation and binding — the binding query
    // filters on READY again and refuses.
    mockBindAttachmentsToMessage.mockRejectedValue(
      new AttachmentError("One or more attachments are unavailable", 409),
    );

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "see attached", attachmentIds: ["att-1"] },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockStreamResponse).not.toHaveBeenCalled();
  });

  it("still delivers the emergency response when binding fails", async () => {
    // Patient safety outranks attachments: a failed bind must not swallow
    // the emergency guidance.
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
      status: "ongoing",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation((async (fn: never) =>
      (fn as unknown as (tx: unknown) => unknown)({
        message: {
          create: vi
            .fn()
            .mockResolvedValueOnce({ id: "user-msg-1" })
            .mockResolvedValueOnce({ id: "assistant-msg-1" }),
        },
        conversation: { update: vi.fn() },
      })) as never);
    mockBindAttachmentsToMessage.mockRejectedValue(
      new AttachmentError("One or more attachments are unavailable", 409),
    );

    const req = buildReq({
      params: { chatid: "conv-1" },
      body: { content: "I have chest pain", attachmentIds: ["att-1"] },
    } as never);
    const res = createMockRes();

    await messageController(req, res);

    expect(lastSseFrame(res)).toEqual(
      expect.objectContaining({
        event: "done",
        data: expect.objectContaining({ type: "emergency" }),
      }),
    );
    expect(mockStreamResponse).not.toHaveBeenCalled();
  });
});

describe("messageController streaming", () => {
  function mockStreamingFlow() {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      userId: "user-1",
      status: "ongoing",
    } as never);
    vi.mocked(prisma.message.create)
      .mockResolvedValueOnce({ id: "user-msg-1" } as never)
      .mockResolvedValueOnce({ id: "assistant-msg-1" } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { role: "user", content: "message 0" },
    ] as never);
  }

  function buildMessageReq() {
    return buildReq({
      params: { chatid: "conv-1" },
      body: { content: "I have a mild headache" },
    } as never);
  }

  it("answers as an event stream, not JSON", async () => {
    mockStreamingFlow();
    mockStreamResponse.mockImplementation(() => aiStream("Some health info."));
    const res = createMockRes();

    await messageController(buildMessageReq(), res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream; charset=utf-8",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-cache, no-transform",
    );
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(res.json).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it("formats every frame as `event: <name>` + one JSON `data:` line", async () => {
    mockStreamingFlow();
    // A newline in the answer must not be readable as a frame boundary.
    mockStreamResponse.mockImplementation(() => aiStream("line one\n\nline two"));
    const res = createMockRes();

    await messageController(buildMessageReq(), res);

    const body = sseBody(res);
    expect(body.startsWith('event: start\ndata: {"provider":"groq"}\n\n')).toBe(
      true,
    );
    for (const frame of body.split("\n\n").filter(Boolean)) {
      const [eventLine, dataLine, ...rest] = frame.split("\n");
      expect(eventLine).toMatch(/^event: (start|delta|done)$/);
      expect(dataLine).toMatch(/^data: \{/);
      expect(rest).toEqual([]);
      expect(() => JSON.parse(dataLine.slice("data: ".length))).not.toThrow();
    }

    const streamed = sseFrames(res)
      .filter((f) => f.event === "delta")
      .map((f) => f.data.text)
      .join("");
    expect(streamed).toBe("line one\n\nline two");
  });

  it("persists the assembled answer once, after the stream completes", async () => {
    mockStreamingFlow();
    mockStreamResponse.mockImplementation(() =>
      aiStream("A headache like that is usually tension."),
    );
    const res = createMockRes();

    await messageController(buildMessageReq(), res);

    // One user row, one assistant row — never one write per delta.
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
    const assistantWrite = vi.mocked(prisma.message.create).mock.calls[1][0]
      .data as { content: string; role: string };
    expect(assistantWrite.role).toBe("assistant");
    expect(assistantWrite.content).toBe(
      "A headache like that is usually tension.",
    );
    expect(lastSseFrame(res)!.data.assistantMessageId).toBe(
      "assistant-msg-1",
    );
  });

  it("persists nothing when the stream is interrupted after visible output", async () => {
    mockStreamingFlow();
    mockStreamResponse.mockImplementation(() =>
      (async function* () {
        yield { type: "start", provider: "gemini", model: "gemini-3.6-flash" };
        yield { type: "delta", text: "This appears to be " };
        throw new AIStreamInterruptedError(
          "The answer was cut off before it finished. Please ask again.",
          "gemini",
          new Error("connection reset"),
        );
      })(),
    );
    const res = createMockRes();

    await messageController(buildMessageReq(), res);

    // Only the user message was written; no partial assistant row.
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const frames = sseFrames(res);
    expect(frames[frames.length - 1]!.event).toBe("error");
    expect(frames[frames.length - 1]!.data.code).toBe("AI_INTERRUPTED");
    expect(JSON.stringify(frames)).not.toContain("connection reset");
  });

  it("aborts the provider stream when the client disconnects, and persists nothing", async () => {
    mockStreamingFlow();
    const res = createMockRes();
    let abortedDuringStream = false;

    mockStreamResponse.mockImplementation(
      (_messages: unknown, _attachments: unknown, signal: AbortSignal) =>
        (async function* () {
          yield { type: "start", provider: "gemini", model: "gemini-3.6-flash" };
          yield { type: "delta", text: "partial" };
          // The browser goes away mid-answer.
          emitClose(res);
          abortedDuringStream = signal.aborted;
          // A real provider stream ends here rather than generating on.
        })(),
    );

    await messageController(buildMessageReq(), res);

    expect(abortedDuringStream).toBe(true);
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(sseFrames(res).some((f) => f.event === "done")).toBe(false);
    expect(res.end).toHaveBeenCalled();
  });
});
