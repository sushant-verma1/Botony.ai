import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { Request, Response } from "express";
const rateLimitHandler = (req: Request, res: Response): void => {
  res.status(429).json({
    error: "Too many requests. Please wait a moment and try again.",
  });
};


export const loginLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: rateLimitHandler,
  standardHeaders: true, 
  legacyHeaders: false,
});


export const registerLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});


export const chatLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});