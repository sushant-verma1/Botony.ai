import Express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createMemoryFactSchema } from "../validation/validate.js";
import {
  createMemoryFactController,
  deleteMemoryFactController,
  listMemoryFactsController,
} from "../controllers/memory.controller.js";

const memoryRouter = Express.Router();

memoryRouter.get("/", protect, listMemoryFactsController);
memoryRouter.post(
  "/",
  protect,
  validate(createMemoryFactSchema),
  createMemoryFactController,
);
memoryRouter.delete("/:id", protect, deleteMemoryFactController);

export default memoryRouter;
