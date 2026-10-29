import { Prisma, type Conversation, type Message } from "@prisma/client";
import { prisma } from "../config/db.js";
import { bindAttachmentsToMessage } from "./attachment.service.js";
import logger from "./logger.js";

export class DraftConflictError extends Error {
  constructor() {
    super("This draft belongs to a different account");
  }
}

interface StartConversationParams {
  userId: string;
  content: string;
  attachmentIds: string[];
  emergencyDetected: boolean;
  draftId: string;
}

interface StartConversationResult {
  conversation: Conversation;
  userMessage: Message;
  /** True when an earlier request with the same draftId already created the
   *  row and this call just found it again. */
  replayed: boolean;
}

/** Finds the message previously created for this draftId, if any. Used both
 *  for the replay fast-path and to resolve a P2002 raised by a concurrent
 *  request racing on the same clientKey. */
async function findByClientKey(
  userId: string,
  draftId: string,
): Promise<StartConversationResult | null> {
  const userMessage = await prisma.message.findUnique({
    where: { clientKey: draftId },
    include: { conversation: true },
  });

  if (!userMessage) return null;

  // clientKey is client-supplied. A guessed or replayed draftId belonging to
  // someone else must never resolve to their conversation.
  if (userMessage.userId !== userId) {
    throw new DraftConflictError();
  }

  const { conversation, ...message } = userMessage;
  return { conversation, userMessage: message, replayed: true };
}

/**
 * Creates the Conversation and its first Message together, keyed by the
 * frontend's draftId so a retried request resolves to the same pair instead
 * of creating a duplicate. Nothing is written until a message is actually
 * sent — see chat.controller.ts's use of this for a request with no
 * :chatid.
 */
export async function startConversationWithFirstMessage({
  userId,
  content,
  attachmentIds,
  emergencyDetected,
  draftId,
}: StartConversationParams): Promise<StartConversationResult> {
  const existing = await findByClientKey(userId, draftId);
  if (existing) return existing;

  try {
    const { conversation, userMessage } = await prisma.$transaction(
      async (tx) => {
        const conversation = await tx.conversation.create({
          data: { userId, title: "New chat" },
        });

        const userMessage = await tx.message.create({
          data: {
            conversationId: conversation.id,
            content,
            role: "user",
            userId,
            emergencyDetected,
            clientKey: draftId,
          },
        });

        try {
          await bindAttachmentsToMessage(attachmentIds, userMessage.id, tx);
        } catch (error) {
          // Patient safety first: an emergency reply must still reach the
          // user even if attaching their files failed, so this is logged
          // rather than allowed to roll back the conversation and message
          // that were just created. A non-emergency first message keeps the
          // stricter behaviour — the whole transaction rolls back so no
          // conversation is left with a message it can never actually send.
          if (!emergencyDetected) throw error;
          logger.warn("Could not bind attachments to a new emergency conversation's first message", {
            userId,
            message: error instanceof Error ? error.message : "unknown",
          });
        }

        return { conversation, userMessage };
      },
    );

    return { conversation, userMessage, replayed: false };
  } catch (error) {
    // Concurrent request won the race on the unique clientKey index: the
    // whole transaction above rolled back, so there is no orphan
    // Conversation here, and the winner's row is what this resolves to.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (error.meta?.target as string[] | undefined)?.includes("clientKey")
    ) {
      const winner = await findByClientKey(userId, draftId);
      if (winner) return winner;
    }

    logger.warn("Failed to start conversation from draft", {
      userId,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}
