import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("./logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../config/db.js", () => ({
  prisma: {
    conversation: { create: vi.fn() },
    message: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { mockBindAttachmentsToMessage } = vi.hoisted(() => ({
  mockBindAttachmentsToMessage: vi.fn(),
}));

vi.mock("./attachment.service.js", () => ({
  bindAttachmentsToMessage: mockBindAttachmentsToMessage,
}));

import { prisma } from "../config/db.js";
import {
  startConversationWithFirstMessage,
  DraftConflictError,
} from "./conversation.service.js";

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

beforeEach(() => {
  vi.mocked(prisma.conversation.create).mockReset();
  vi.mocked(prisma.message.findUnique).mockReset().mockResolvedValue(null);
  vi.mocked(prisma.$transaction).mockReset();
  mockBindAttachmentsToMessage.mockReset().mockResolvedValue(undefined);
});

const params = {
  userId: "user-1",
  content: "hello",
  attachmentIds: [] as string[],
  emergencyDetected: false,
  draftId: "11111111-1111-4111-8111-111111111111",
};

describe("startConversationWithFirstMessage", () => {
  it("creates the conversation and first message together, keyed by draftId", async () => {
    vi.mocked(prisma.$transaction).mockImplementation((async (cb: any) => {
      const tx = {
        conversation: {
          create: vi.fn().mockResolvedValue({ id: "conv-1", userId: "user-1" }),
        },
        message: {
          create: vi
            .fn()
            .mockResolvedValue({ id: "msg-1", conversationId: "conv-1" }),
        },
      };
      return cb(tx);
    }) as never);

    const result = await startConversationWithFirstMessage(params);

    expect(result.replayed).toBe(false);
    expect(result.conversation.id).toBe("conv-1");
    expect(result.userMessage.id).toBe("msg-1");
    expect(mockBindAttachmentsToMessage).toHaveBeenCalledWith(
      [],
      "msg-1",
      expect.anything(),
    );
  });

  it("never touches the database when a message with this clientKey already exists", async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({
      id: "msg-1",
      userId: "user-1",
      conversation: { id: "conv-1", userId: "user-1" },
    } as never);

    const result = await startConversationWithFirstMessage(params);

    expect(result.replayed).toBe(true);
    expect(result.conversation.id).toBe("conv-1");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("refuses a draftId that already belongs to a different user", async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({
      id: "msg-1",
      userId: "someone-else",
      conversation: { id: "conv-1", userId: "someone-else" },
    } as never);

    await expect(startConversationWithFirstMessage(params)).rejects.toThrow(
      DraftConflictError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("resolves a concurrent retry (unique constraint race) to the winner's row instead of throwing", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(p2002(["clientKey"]));
    vi.mocked(prisma.message.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "msg-1",
      userId: "user-1",
      conversation: { id: "conv-1", userId: "user-1" },
    } as never);

    const result = await startConversationWithFirstMessage(params);

    expect(result.replayed).toBe(true);
    expect(result.conversation.id).toBe("conv-1");
  });

  it("re-throws a unique constraint error on an unrelated column", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(p2002(["id"]));

    await expect(startConversationWithFirstMessage(params)).rejects.toThrow();
  });

  it("rolls back the whole transaction when a non-emergency first message's attachments fail to bind", async () => {
    mockBindAttachmentsToMessage.mockRejectedValue(new Error("not ready"));
    vi.mocked(prisma.$transaction).mockImplementation((async (cb: any) => {
      const tx = {
        conversation: {
          create: vi.fn().mockResolvedValue({ id: "conv-1", userId: "user-1" }),
        },
        message: {
          create: vi.fn().mockResolvedValue({ id: "msg-1" }),
        },
      };
      return cb(tx);
    }) as never);

    await expect(
      startConversationWithFirstMessage({
        ...params,
        attachmentIds: ["att-1"],
      }),
    ).rejects.toThrow("not ready");
  });

  it("keeps an emergency conversation's message even if attachment binding fails", async () => {
    mockBindAttachmentsToMessage.mockRejectedValue(new Error("not ready"));
    vi.mocked(prisma.$transaction).mockImplementation((async (cb: any) => {
      const tx = {
        conversation: {
          create: vi.fn().mockResolvedValue({ id: "conv-1", userId: "user-1" }),
        },
        message: {
          create: vi.fn().mockResolvedValue({ id: "msg-1" }),
        },
      };
      return cb(tx);
    }) as never);

    const result = await startConversationWithFirstMessage({
      ...params,
      attachmentIds: ["att-1"],
      emergencyDetected: true,
    });

    expect(result.userMessage.id).toBe("msg-1");
  });
});
