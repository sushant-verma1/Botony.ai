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
