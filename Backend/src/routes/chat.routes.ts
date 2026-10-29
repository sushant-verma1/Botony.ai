import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  messageController,
  newChatController,
  getHistoryController,
  listConversationsController,
  deleteConversationController,
  renameConversationController,
} from "../controllers/chat.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createConversationSchema,
  createMessageSchema,
  createFirstMessageSchema,
  renameConversationSchema,
} from "../validation/validate.js";
import { chatLimiter } from "../middleware/rateLImit.middleware.js";

const chatRouter = Express.Router();

chatRouter.post(
  "/newchat",
  protect,
  validate(createConversationSchema),
  newChatController,
);
// No :chatid yet — the frontend has only a local draft. messageController
// detects this from the missing param and creates the Conversation and this
// first Message together, keyed by body.draftId.
chatRouter.post(
  "/message",
  chatLimiter,
  protect,
  validate(createFirstMessageSchema),
  messageController,
);
chatRouter.post(
  "/:chatid/message",
  chatLimiter,
  protect,
  validate(createMessageSchema),
  messageController,
);
chatRouter.get("/conversations", protect, listConversationsController);
chatRouter.get("/:chatid/history", protect, getHistoryController);
chatRouter.patch(
  "/:chatid",
  protect,
  validate(renameConversationSchema),
  renameConversationController,
);
chatRouter.delete("/:chatid", protect, deleteConversationController);

export default chatRouter;
