import Express from "express";
import {
  registerController,
  loginController,
  logoutController,
} from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import {createUserSchema , loginSchema} from "../validation/validate.js";
import { protect } from "../middleware/auth.middleware.js";

const authRouter = Express.Router();

authRouter.post("/login", validate(loginSchema), loginController);
authRouter.post("/register", validate(createUserSchema), registerController);
authRouter.post("/logout", protect, logoutController);
// authRouter.get("/protected",protect ,(req, res) => {
//   res.json({ message: "This is a protected route" });
// })

export default authRouter;
