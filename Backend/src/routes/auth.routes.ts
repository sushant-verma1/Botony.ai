import Express from "express";
import {
  registerController,
  loginController,
  logoutController,
  refreshController,
} from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {createUserSchema , loginSchema} from "../validation/validate.js";
import { protect } from "../middleware/auth.middleware.js";

const authRouter = Express.Router();

authRouter.post("/login", validate(loginSchema), loginController);
authRouter.post("/register", validate(createUserSchema), registerController);
authRouter.post("/logout", protect, logoutController);
authRouter.post("/refresh" , refreshController);
export default authRouter;
