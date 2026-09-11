import Express from "express";
import {
  registerController,
  loginController,
  logoutController,
  refreshController,
  updateProfileController,
} from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createUserSchema,
  loginSchema,
  updateProfileSchema,
} from "../validation/validate.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  loginLimiter,
  registerLimiter,
} from "../middleware/rateLImit.middleware.js";

const authRouter = Express.Router();

authRouter.post("/login", loginLimiter, validate(loginSchema), loginController);
authRouter.post(
  "/register",
  registerLimiter,
  validate(createUserSchema),
  registerController,
);
authRouter.patch(
  "/profile",
  protect,
  validate(updateProfileSchema),
  updateProfileController,
);
authRouter.post("/logout", protect, logoutController);
authRouter.post("/refresh", refreshController);
export default authRouter;
