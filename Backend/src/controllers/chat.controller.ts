import Express from "express";
import type { Conversation, Message } from "@prisma/client";
import { prisma } from "../config/db.js";
import {
  detectEmergency,
  getEmergencyResponse,
} from "../utils/safety.util.js";
import {
  startConversationWithFirstMessage,
  DraftConflictError,
} from "../services/conversation.service.js";
import {
  streamResponse,
  AIServiceError,
  AIStreamInterruptedError,
} from "../services/ai/index.js";
import type {
  AIMessage,
  AIAttachmentContent,
  AIStreamEvent,
} from "../services/ai/index.js";
import { openEventStream, sendEvent } from "../utils/sse.util.js";
import {
  validateAttachmentsForMessage,
  bindAttachmentsToMessage,
  isDocumentAttachment,
  getAiImageUrl,
  extractPdfText,
  AttachmentError,
} from "../services/attachment.service.js";
import logger from "../services/logger.js";

export const newChatController = async (
  req: Express.Request,
  res: Express.Response,
) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }
  logger.info("New chat requested", { userId: user.userId });

  const conversation = await prisma.conversation.create({
    data: {
      userId: user.userId,
      title: "New chat",
    },
  });

  logger.info("Conversation created", {
    conversationId: conversation.id,
    userId: user.userId,
  });

  return res.json({
    conversationId: conversation.id,
    message: "New chat created successfully",
  });
};

export const listConversationsController = async (
  req: Express.Request,
  res: Express.Response,
) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.user.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return res.json({ conversations });
};

export const renameConversationController = async (
  req: Express.Request<{ chatid: string }>,
  res: Express.Response,
) => {
  const conversationId = req.params.chatid;
  const { title } = req.body;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.userId !== req.user.userId) {
    logger.warn("Unauthorized rename attempt", {
      userId: req.user.userId,
      conversationId,
    });
    return res.status(403).json({ message: "Not allowed" });
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { title },
    select: { id: true, title: true },
  });

  logger.info("Conversation renamed", {
    userId: req.user.userId,
    conversationId,
  });

  return res.json({ conversationId: updated.id, title: updated.title });
};

export const deleteConversationController = async (
  req: Express.Request<{ chatid: string }>,
  res: Express.Response,
) => {
  const conversationId = req.params.chatid;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.userId !== req.user.userId) {
    logger.warn("Unauthorized delete attempt", {
      userId: req.user.userId,
      conversationId,
    });
    return res.status(403).json({ message: "Not allowed" });
  }

  await prisma.conversation.delete({ where: { id: conversationId } });

  logger.info("Conversation deleted", {
    userId: req.user.userId,
    conversationId,
  });

  return res.json({ message: "Conversation deleted successfully" });
};

export const messageController = async (
  req: Express.Request<{ chatid?: string }>,
  res: Express.Response,
) => {
  // Present for POST /:chatid/message, absent for POST /message — the
  // no-conversation-yet path, where body.draftId stands in for it.
  const paramConversationId = req.params.chatid;
  const { content, attachmentIds = [], draftId } = req.body;
  const handlerStartedAt = Date.now();
  logger.info("Message received", {
    userId: req.user.userId,
    conversationId: paramConversationId,
    contentLength: content?.length,
  });

  if (!content || !content.trim()) {
    logger.warn("Empty message rejected", { userId: req.user.userId });
    return res.status(400).json({ message: "content is required" });
  }

  if (content.length > 3000) {
    logger.warn("Message too long", {
      userId: req.user.userId,
      length: content.length,
    });
    return res
      .status(400)
      .json({ message: "Message too long (max 3000 chars)" });
  }

  let conversation: Conversation | undefined;

  if (paramConversationId) {
    const found = await prisma.conversation.findUnique({
      where: { id: paramConversationId },
    });

    if (!found) {
      logger.warn("Conversation not found", {
        conversationId: paramConversationId,
      });
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (found.userId !== req.user.userId) {
      logger.warn("Unauthorized access attempt", {
        userId: req.user.userId,
        conversationId: paramConversationId,
      });
      return res.status(403).json({ message: "Not allowed" });
    }

    conversation = found;
  }

  let validatedAttachments;
  try {
    validatedAttachments = await validateAttachmentsForMessage(
      req.user.userId,
      attachmentIds,
    );
  } catch (error) {
    if (error instanceof AttachmentError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }

  const isEmergency = detectEmergency(content);

  // Set only on the draft path: the first message of a brand-new
  // conversation, already persisted (and its attachments already bound) by
  // the time this line finishes.
  let draftUserMessage: Message | undefined;
  let replayed = false;

  if (!conversation) {
    try {
      const result = await startConversationWithFirstMessage({
        userId: req.user.userId,
        content,
        attachmentIds,
        emergencyDetected: isEmergency,
        draftId,
      });
      conversation = result.conversation;
      draftUserMessage = result.userMessage;
      replayed = result.replayed;
    } catch (error) {
      if (error instanceof DraftConflictError) {
        return res.status(409).json({ message: error.message });
      }
      if (error instanceof AttachmentError) {
        return res.status(error.status).json({ message: error.message });
      }
      throw error;
    }
  }

  // The existing-conversation path keeps using the route param exactly as
  // before; only the draft path's freshly created id is new.
  const conversationId = paramConversationId ?? conversation.id;

  if (replayed) {
    // The draftId was already used. If it already produced a reply, this is
    // a plain retry of a request that already succeeded — send the same
    // answer back rather than asking the model again. If it has not (the
    // original request is still streaming, or died before persisting a
    // reply), fall through and produce one now using the message that
    // already exists.
    const existingAssistantMessage = await prisma.message.findFirst({
      where: { conversationId, role: "assistant" },
      orderBy: { createdAt: "asc" },
    });

    if (existingAssistantMessage && draftUserMessage) {
      openEventStream(res);
      sendEvent(res, "start", {
        provider: draftUserMessage.emergencyDetected ? "safety" : "cache",
      });
      sendEvent(res, "delta", { text: existingAssistantMessage.content });
      sendEvent(res, "done", {
        conversationId,
        messageId: draftUserMessage.id,
        assistantMessageId: existingAssistantMessage.id,
        type: draftUserMessage.emergencyDetected ? "emergency" : "normal",
      });
      return res.end();
    }
  }

  if (isEmergency) {
    logger.warn("Emergency detected", {
      userId: req.user.userId,
      conversationId,
    });
    const emergencyResponse = getEmergencyResponse();

    let userMessage: Message;
    let assistantMessage: Message;

    if (draftUserMessage) {
      // The draft path already created and bound the user message; only the
      // canned reply and the conversation status are still needed.
      userMessage = draftUserMessage;
      assistantMessage = await prisma.$transaction(async (tx) => {
        const assistantMessage = await tx.message.create({
          data: {
            conversationId,
            content: emergencyResponse,
            role: "assistant",
            userId: req.user.userId,
            emergencyDetected: true,
          },
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: { status: "emergency" },
        });

        return assistantMessage;
      });
    } else {
      const result = await prisma.$transaction(async (tx) => {
        const userMessage = await tx.message.create({
          data: {
            conversationId,
            content,
            role: "user",
            userId: req.user.userId,
            emergencyDetected: true,
          },
        });

        const assistantMessage = await tx.message.create({
          data: {
            conversationId,
            content: emergencyResponse,
            role: "assistant",
            userId: req.user.userId,
            emergencyDetected: true,
          },
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: { status: "emergency" },
        });

        return { userMessage, assistantMessage };
      });

      userMessage = result.userMessage;
      assistantMessage = result.assistantMessage;

      // Patient safety first: the emergency response must reach the user
      // even if attaching their files fails, so this is logged rather than
      // thrown.
      try {
        await bindAttachmentsToMessage(attachmentIds, userMessage.id);
      } catch (error) {
        logger.warn("Could not bind attachments to an emergency message", {
          conversationId,
          userId: req.user.userId,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    logger.info("Emergency response sent", {
      conversationId,
    });

    // Sent over the same SSE contract as a model answer so the client has a
    // single path. The text is canned, so it is one delta.
    openEventStream(res);
    sendEvent(res, "start", { provider: "safety" });
    sendEvent(res, "delta", { text: emergencyResponse });
    sendEvent(res, "done", {
      conversationId,
      messageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      type: "emergency",
    });
    return res.end();
  }

  try {
    const userMessage =
      draftUserMessage ??
      (await prisma.message.create({
        data: {
          conversationId,
          content,
          role: "user",
          userId: req.user.userId,
          emergencyDetected: false,
        },
      }));

    if (!draftUserMessage) {
      await bindAttachmentsToMessage(attachmentIds, userMessage.id);
    }

    const previousMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    const conversationUpdate: { status?: string; title?: string } = {};

    if (conversation.status === "emergency") {
      conversationUpdate.status = "ongoing";
    }

    if (previousMessages.length === 1) {
      conversationUpdate.title =
        content.length > 60 ? `${content.slice(0, 60).trim()}…` : content.trim();
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: conversationUpdate,
    });

    const messagesForClaude: AIMessage[] = previousMessages
      .reverse()
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    let totalTokens = 0;

    totalTokens += Math.ceil(messagesForClaude.length / 4);

    messagesForClaude.forEach((msg) => {
      totalTokens += Math.ceil(msg.content.length / 4);
    });

    logger.info("Token estimation", {
      conversationId,
      totalTokens,
    });

    if (totalTokens > 50000) {
      return res.status(400).json({
        message:
          "Message exceeds token limit. Please start a new conversation.",
        totalTokens,
      });
    }

    // Only attachments explicitly attached to *this* message are sent —
    // history is never re-sent with old attachments included.
    const aiAttachments: AIAttachmentContent[] = await Promise.all(
      validatedAttachments.map(async (attachment) => {
        if (isDocumentAttachment(attachment)) {
          const text = await extractPdfText(attachment);
          return {
            type: "text" as const,
            label: "attached document",
            text,
          };
        }
        return { type: "image" as const, url: getAiImageUrl(attachment) };
      }),
    );

    // The browser can close mid-answer; when it does the provider call is
    // aborted rather than left generating tokens nobody will read.
    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    // Split the handler into "before the AI call" (attachments, history, DB)
    // / "the stream" / "persist", so a slow reply can be attributed to the
    // right stage.
    const aiStartedAt = Date.now();
    let finalText = "";
    let completed: Extract<AIStreamEvent, { type: "done" }> | null = null;

    openEventStream(res);

    try {
      for await (const event of streamResponse(
        messagesForClaude,
        aiAttachments,
        abortController.signal,
      )) {
        if (event.type === "start") {
          sendEvent(res, "start", { provider: event.provider });
        } else if (event.type === "delta") {
          sendEvent(res, "delta", { text: event.text });
        } else {
          // Assembled in memory across the whole stream — nothing is written
          // to the database until the provider has finished.
          finalText = event.text;
          completed = event;
        }
      }
    } catch (error) {
      // Only a code and a vetted sentence cross the wire: never the provider
      // message, the prompt, a URL or a stack.
      if (error instanceof AIStreamInterruptedError) {
        logger.error("AI stream interrupted after visible output", {
          conversationId,
          userId: req.user.userId,
          provider: error.provider,
          originalMessage: error.originalMessage,
        });
        sendEvent(res, "error", {
          code: "AI_INTERRUPTED",
          message: error.userMessage,
        });
        return res.end();
      }

      if (error instanceof AIServiceError) {
        logger.error("AI service unavailable", {
          originalMessage: error.originalMessage,
          conversationId,
          userId: req.user.userId,
        });
        sendEvent(res, "error", {
          code: "AI_UNAVAILABLE",
          message: error.userMessage,
        });
        return res.end();
      }

      throw error;
    }

    const aiMs = Date.now() - aiStartedAt;

    if (!completed) {
      // The client disconnected. A half-finished answer is not part of the
      // record, so nothing is persisted.
      logger.info("Message stream ended without completing", {
        conversationId,
        userId: req.user.userId,
        aiMs,
      });
      return res.end();
    }

    // No blanket disclaimer is appended: the composer carries a permanent one
    // and the system prompt decides per answer whether a referral is
    // warranted, so a simple educational question is not buried under a
    // warning block.
    const persistStartedAt = Date.now();
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        content: finalText,
        role: "assistant",
        userId: req.user.userId,
        emergencyDetected: false,
      },
    });
    const persistMs = Date.now() - persistStartedAt;

    logger.info("Message handled", {
      conversationId,
      provider: completed.provider,
      model: completed.model,
      beforeAiMs: aiStartedAt - handlerStartedAt,
      aiMs,
      firstChunkMs: completed.firstChunkMs,
      chunks: completed.chunks,
      outputChars: finalText.length,
      retries: completed.retries,
      persistMs,
      totalMs: Date.now() - handlerStartedAt,
      attachmentCount: aiAttachments.length,
    });

    sendEvent(res, "done", {
      conversationId,
      messageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      type: "normal",
    });
    return res.end();
  } catch (error: any) {
    // Past the point where the SSE headers went out there is no status code
    // left to send, so failures finish the stream instead.
    if (res.headersSent) {
      logger.error("Message stream failed after headers were sent", {
        conversationId,
        userId: req.user.userId,
        message: error?.message,
      });
      sendEvent(res, "error", {
        code: "AI_UNAVAILABLE",
        message:
          "Something went wrong while answering. Please try again shortly.",
      });
      return res.end();
    }

    if (error instanceof AttachmentError) {
      logger.warn("Attachment processing failed for message", {
        conversationId,
        userId: req.user.userId,
        message: error.message,
      });
      return res.status(error.status).json({ message: error.message });
    }

    if (error instanceof AIServiceError) {
      logger.error("AI service unavailable", {
        originalMessage: error.originalMessage,
        conversationId,
        userId: req.user.userId,
      });

      return res.status(error.status).json({ message: error.userMessage });
    }

    logger.error("AI error", {
      message: error.message,
      stack: error.stack,
      conversationId,
      userId: req.user.userId,
    });

    return res.status(500).json({
      message: "Failed to generate response",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const HISTORY_PAGE_SIZE = 30;
const HISTORY_PAGE_SIZE_MAX = 100;

export const getHistoryController = async (
  req: Express.Request<{ chatid: string }>,
  res: Express.Response,
) => {
  const conversationId = req.params.chatid;
  const before = req.query.before as string | undefined;
  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, HISTORY_PAGE_SIZE_MAX)
      : HISTORY_PAGE_SIZE;

  logger.info("Fetching chat history", {
    userId: req.user.userId,
    conversationId,
    before,
    limit,
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });

  if (!conversation) {
    logger.warn("History fetch failed - not found", { conversationId });
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.userId !== req.user.userId) {
    return res.status(403).json({ message: "Not allowed" });
  }

  if (before) {
    const cursorMessage = await prisma.message.findFirst({
      where: { id: before, conversationId },
      select: { id: true },
    });

    if (!cursorMessage) {
      return res.status(400).json({ message: "Invalid pagination cursor" });
    }
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: {
      id: true,
      content: true,
      role: true,
      emergencyDetected: true,
      createdAt: true,
    },
  });

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse();

  return res.json({
    conversationId,
    messages: page,
    hasMore,
    nextCursor: hasMore ? page[0].id : null,
  });
};
