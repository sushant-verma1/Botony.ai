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

const { mockGetClaudeResponse } = vi.hoisted(() => ({
  mockGetClaudeResponse: vi.fn(),
}));

vi.mock("../services/claude.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/claude.js")>();
  return { ...actual, getClaudeResponse: mockGetClaudeResponse };
});

import { prisma } from "../config/db.js";
import { ClaudeServiceError } from "../services/claude.js";
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
  mockGetClaudeResponse.mockReset();
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
    expect(mockGetClaudeResponse).not.toHaveBeenCalled();
  });

  describe("emergency detection (patient safety)", () => {
    it("short-circuits to the canned emergency response and never calls Claude", async () => {
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

      expect(mockGetClaudeResponse).not.toHaveBeenCalled();
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
      mockGetClaudeResponse.mockResolvedValue("Here is some health info.");
    }

    it("calls Claude and appends the medical disclaimer", async () => {
      mockNormalFlow();

      const req = buildReq({
        params: { chatid: "conv-1" },
        body: { content: "I have a mild headache" },
      } as never);
      const res = createMockRes();

      await messageController(req, res);

      expect(mockGetClaudeResponse).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "normal",
          response: expect.stringContaining("Here is some health info."),
        }),
      );
      const jsonArg = vi.mocked(res.json).mock.calls[0][0] as {
        response: string;
      };
      expect(jsonArg.response).toMatch(/IMPORTANT DISCLAIMER/i);
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

  describe("token limit", () => {
    it("returns 400 without calling Claude when the token estimate is exceeded", async () => {
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

      expect(mockGetClaudeResponse).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Message exceeds token limit. Please start a new conversation.",
        }),
      );
      expect(prisma.message.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("Claude service failures", () => {
    it("returns the ClaudeServiceError's status and safe message", async () => {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: "ongoing",
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: "user-msg-1",
      } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([] as never);
      mockGetClaudeResponse.mockRejectedValue(
        new ClaudeServiceError(
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

    it("returns a generic 500 for an unexpected non-Claude error", async () => {
      vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
        userId: "user-1",
        status: "ongoing",
      } as never);
      vi.mocked(prisma.message.create).mockResolvedValue({
        id: "user-msg-1",
      } as never);
      vi.mocked(prisma.message.findMany).mockResolvedValue([] as never);
      mockGetClaudeResponse.mockRejectedValue(new Error("Unexpected"));

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
    expect(mockGetClaudeResponse).not.toHaveBeenCalled();
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
