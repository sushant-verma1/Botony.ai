import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { createMockRes } from "../test/mockExpress.js";

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

const { mockGenerateResponse } = vi.hoisted(() => ({
  mockGenerateResponse: vi.fn(),
}));

vi.mock("../services/ai/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/ai/index.js")>();
  return { ...actual, generateResponse: mockGenerateResponse };
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
import { AIServiceError } from "../services/ai/index.js";
import { AttachmentError } from "../services/attachment.service.js";
import {
  newChatController,
  listConversationsController,
  renameConversationController,
  deleteConversationController,
  messageController,
  getHistoryController,
} from "./chat.controller.js";

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
  mockGenerateResponse.mockReset();
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
    expect(mockGenerateResponse).not.toHaveBeenCalled();
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

      expect(mockGenerateResponse).not.toHaveBeenCalled();
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
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "emergency",
          messageId: "user-msg-1",
          assistantMessageId: "assistant-msg-1",
        }),
      );
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
      mockGenerateResponse.mockResolvedValue({ text: "Here is some health info.", provider: "groq", model: "meta-llama/llama-4-scout-17b-16e-instruct" });
    }

    it("returns the AI answer unchanged, with no blanket disclaimer", async () => {
      mockNormalFlow();

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "I have a mild headache" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(mockGenerateResponse).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "normal",
          response: expect.stringContaining("Here is some health info."),
        }),
      );
      const jsonArg = vi.mocked(res.json).mock.calls[0][0] as {
        response: string;
      };
      expect(jsonArg.response).toBe("Here is some health info.");
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
      mockGenerateResponse.mockResolvedValue(aiResult);
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

      // ...and only aiResult.text reaches the client.
      const body = vi.mocked(res.json).mock.calls[0][0] as Record<string, unknown>;
      expect(body.response).toBe(ANSWER);
      expect(JSON.stringify(body)).not.toContain("Chain of thought");
      expect(JSON.stringify(body)).not.toContain("reasoning");
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

      expect(mockGenerateResponse).not.toHaveBeenCalled();
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
      mockGenerateResponse.mockRejectedValue(
        new AIServiceError(
          "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
          503,
        ),
      );

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "Hello" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        message:
          "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
      });
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
      mockGenerateResponse.mockRejectedValue(new Error("Unexpected"));

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "Hello" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Failed to generate response" }),
      );
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
    mockGenerateResponse.mockResolvedValue({
      text: "Here is some health info.",
      provider: "groq",
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
    });
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
    expect(mockGenerateResponse).not.toHaveBeenCalled();
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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: "normal" }),
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
    expect(mockGenerateResponse).not.toHaveBeenCalled();
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
    mockGenerateResponse.mockResolvedValue({
      text: "Here is some health info.",
      provider: "groq",
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
    });
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
    expect(mockGenerateResponse).not.toHaveBeenCalled();
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
    expect(mockGenerateResponse).not.toHaveBeenCalled();
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

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: "emergency" }),
    );
    expect(mockGenerateResponse).not.toHaveBeenCalled();
  });
});
