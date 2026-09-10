import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/auth.util.js";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Token not found",
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "token not found" });
    }
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      // Top-level `message` mirrors the other 401s here so clients reading
      // `data.message` get real text instead of undefined.
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please log in again.",
        error: { message: "Invalid or expired token" },
      });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      message: "Authentication failed",
      error: { message: "Authentication failed" },
    });
  }
};
