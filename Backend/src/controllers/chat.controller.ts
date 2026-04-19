import Express from "express";
import { prisma } from "../config/db.js";
import { detectEmergency, getEmergencyResponse } from "../utils/safety.util.js";

export const newChatController = async (
  req: Express.Request,
  res: Express.Response,
) => {
  const user = req.user;

  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: "New chat",
    },
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

  if (!content) {
    return res.status(400).json({ message: "content is required" });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.userId !== req.user.id) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const isEmergency = detectEmergency(content);

  const result = await prisma.$transaction(async (tx) => {
    const userMessage = await tx.message.create({
      data: {
        conversationId,
        content,
        role: "user",
        userId: req.user.id,
        emergencyDetected: isEmergency,
      },
    });

    let assistantMessage = null;

    if (isEmergency) {
      const emergencyResponse = getEmergencyResponse();

      assistantMessage = await tx.message.create({
        data: {
          conversationId,
          content: emergencyResponse,
          role: "assistant",
          userId: req.user.id,
          emergencyDetected: true,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: "emergency" },
      });

      return { userMessage, assistantMessage, emergencyResponse };
    }

    return { userMessage, assistantMessage: null };
  });

  if (isEmergency) {
    return res.json({
      messageId: result.userMessage.id,
      assistantMessageId: result.assistantMessage?.id,
      type: "emergency",
      response: result.emergencyResponse,
    });
  }

  return res.json({
    messageId: result.userMessage.id,
    assistantMessageId: result.assistantMessage?.id,
    type: isEmergency ? "emergency" : "normal",
    response: result.assistantMessage?.content || null,
  });
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

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (conversation.userId !== req.user.id) {
    return res.status(403).json({ message: "Not allowed" });
  }

  return res.json({
    conversationId,
    messages: conversation.messages,
  });
};
