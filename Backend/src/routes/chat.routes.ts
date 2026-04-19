import  Express  from "express";
import { protect } from "../middleware/auth.middleware.js";
import { messageController, newChatController, getHistoryController } from "../controllers/chat.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { createConversationSchema, createMessageSchema } from "../validation/validate.js";

const chatRouter = Express.Router();

chatRouter.post("/newchat",validate(createConversationSchema) ,protect , newChatController)
chatRouter.post("/:chatid/message", validate(createMessageSchema) ,protect , messageController)
chatRouter.get("/:chatid/history", protect , getHistoryController)

export default chatRouter;