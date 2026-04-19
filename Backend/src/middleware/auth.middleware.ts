import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/auth.util.js";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "token not found" });
    }
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: { message: "Invalid or expired token" },
      });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      error: { message: "Authentication failed" },
    });
  }
};
