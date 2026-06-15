import Express from "express";
import { prisma } from "../config/db.js";
import { detectEmergency, getEmergencyResponse } from "../utils/safety.util.js";
import { getClaudeResponse, Message } from "../services/claude.js";
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

export const messageController = async (
  req: Express.Request<{ chatid: string }>,
  res: Express.Response,
) => {
  const conversationId = req.params.chatid;
  const { content } = req.body;
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

    if (conversation.status === "emergency") {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: "ongoing" },
      });
    }

    const previousMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    const messagesForClaude: Message[] = previousMessages
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

    const claudeResponse = await getClaudeResponse(messagesForClaude);

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        content: claudeResponse,
        role: "assistant",
        userId: req.user.userId,
        emergencyDetected: false,
      },
    });

    return res.json({
      messageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      type: "normal",
      response: claudeResponse,
    });
  } catch (error: any) {
    logger.error("Claude error", {
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

export const getHistoryController = async (
  req: Express.Request<{ chatid: string }>,
  res: Express.Response,
) => {
  const conversationId = req.params.chatid;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
          role: true,
          emergencyDetected: true,
          createdAt: true,
        },
      },
    },
  });

  logger.info("Fetching chat history", {
    userId: req.user.userId,
    conversationId,
  });

  if (!conversation) {
    logger.warn("History fetch failed - not found", { conversationId });
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.userId !== req.user.userId) {
    return res.status(403).json({ message: "Not allowed" });
  }

  return res.json({
    conversationId,
    messages: conversation.messages,
  });
};
