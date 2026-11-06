import type { Request, Response } from "express";
import {
  MemoryFactError,
  createMemoryFact,
  deleteMemoryFact,
  listMemoryFacts,
} from "../services/memory.service.js";
import logger from "../services/logger.js";

export async function listMemoryFactsController(req: Request, res: Response) {
  const facts = await listMemoryFacts(req.user.userId);
  return res.json({ facts });
}

export async function createMemoryFactController(req: Request, res: Response) {
  try {
    const fact = await createMemoryFact(req.user.userId, req.body);
    logger.info("User memory fact created", {
      userId: req.user.userId,
      memoryFactId: fact.id,
      category: fact.category,
    });
    return res.status(201).json({ fact });
  } catch (error) {
    if (error instanceof MemoryFactError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}

export async function deleteMemoryFactController(
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    await deleteMemoryFact(req.user.userId, req.params.id);
    logger.info("User memory fact deleted", {
      userId: req.user.userId,
      memoryFactId: req.params.id,
    });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof MemoryFactError) {
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}
