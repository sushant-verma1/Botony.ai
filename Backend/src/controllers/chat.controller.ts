import Express from "express";
import { prisma } from "../config/db.js";
import {
  detectEmergency,
  getEmergencyResponse,
} from "../utils/safety.util.js";
import { generateResponse, AIServiceError } from "../services/ai/index.js";
import type { AIMessage, AIAttachmentContent } from "../services/ai/index.js";
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
  req: Express.Request<{ chatid: string }>,
  res: Express.Response,
) => {
  const conversationId = req.params.chatid;
  const { content, attachmentIds = [] } = req.body;
  const handlerStartedAt = Date.now();
  logger.info("Message received", {
    userId: req.user.userId,
    conversationId,
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

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    logger.warn("Conversation not found", { conversationId });
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.userId !== req.user.userId) {
    logger.warn("Unauthorized access attempt", {
      userId: req.user.userId,
      conversationId,
    });
    return res.status(403).json({ message: "Not allowed" });
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

  if (isEmergency) {
    logger.warn("Emergency detected", {
      userId: req.user.userId,
      conversationId,
    });
    const emergencyResponse = getEmergencyResponse();

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

      return { userMessage, assistantMessage, emergencyResponse };
    });

    // Patient safety first: the emergency response must reach the user even
    // if attaching their files fails, so this is logged rather than thrown.
    try {
      await bindAttachmentsToMessage(attachmentIds, result.userMessage.id);
    } catch (error) {
      logger.warn("Could not bind attachments to an emergency message", {
        conversationId,
        userId: req.user.userId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    logger.info("Emergency response sent", {
      conversationId,
    });
    return res.json({
      messageId: result.userMessage.id,
      assistantMessageId: result.assistantMessage.id,
      type: "emergency",
      response: result.emergencyResponse,
    });
  }

  try {
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        content,
        role: "user",
        userId: req.user.userId,
        emergencyDetected: false,
      },
    });

    await bindAttachmentsToMessage(attachmentIds, userMessage.id);

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

    // Split the handler into "before the AI call" (attachments, history, DB)
    // / "the AI call" / "after it returns", so a slow reply can be attributed
    // to the right stage.
    const aiStartedAt = Date.now();
    const aiResult = await generateResponse(messagesForClaude, aiAttachments);
    const aiMs = Date.now() - aiStartedAt;
    // No blanket disclaimer is appended: the composer carries a permanent one
    // and the system prompt decides per answer whether a referral is warranted,
    // so a simple educational question is not buried under a warning block.
    const claudeResponse = aiResult.text;

    const persistStartedAt = Date.now();
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        content: claudeResponse,
        role: "assistant",
        userId: req.user.userId,
        emergencyDetected: false,
      },
    });
    const persistMs = Date.now() - persistStartedAt;

    logger.info("Message handled", {
      conversationId,
      provider: aiResult.provider,
      model: aiResult.model,
      beforeAiMs: aiStartedAt - handlerStartedAt,
      aiMs,
      persistMs,
      totalMs: Date.now() - handlerStartedAt,
      attachmentCount: aiAttachments.length,
      inputTokens: aiResult.usage?.inputTokens,
      outputTokens: aiResult.usage?.outputTokens,
    });

    return res.json({
      messageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      type: "normal",
      response: claudeResponse,
    });
  } catch (error: any) {
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
