import { prisma } from "../config/db.js";
import { Request, Response } from "express";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/auth.util.js";
import logger from "../services/logger.js";

export const registerController = async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body;

  logger.info("Register request received", { email });

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }],
      },
    });

    if (existingUser) {
      logger.warn("Register failed - user already exists", { email });

      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: hashedPassword,
      },
    });

    const accessToken = generateAccessToken(newUser.id);
    const refreshToken = generateRefreshToken(newUser.id);

    logger.info("User registered successfully", {
      userId: newUser.id,
      email,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: "user registered successfully",
      id: newUser.id,
      user: { name: newUser.firstName, email: newUser.email },
      accessToken,
    });
  } catch (error: any) {
    logger.error("Register error", {
      message: error.message,
      stack: error.stack,
      email,
    });

    res.status(500).json({ message: "Server error" });
  }
};

export const loginController = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  logger.info("Login attempt", { email });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      logger.warn("Login failed - user not found", { email });

      return res.status(404).json({ message: "user not found" });
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      logger.warn("Login failed - invalid password", {
        userId: user.id,
        email,
      });

      return res.status(401).json({ message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    logger.info("Login successful", {
      userId: user.id,
      email,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({
      message: "Login successful",
      id: user.id,
      user: {
        name: user.firstName,
        email: user.email,
      },
      accessToken,
    });
  } catch (error: any) {
    logger.error("Login error", {
      message: error.message,
      stack: error.stack,
      email,
    });

    res.status(500).json({ message: "Server error" });
  }
};

export const refreshController = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      message: "Refresh token missing",
    });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      return res.status(401).json({
        message: "Invalid refresh token",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: payload.userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const accessToken = generateAccessToken(user.id);

    return res.json({
      accessToken,
      user: {
        name: user.firstName,
        email: user.email,
      },
    });
  } catch {
    return res.status(401).json({
      message: "Invalid refresh token",
    });
  }
};

export const logoutController = async (req: Request, res: Response) => {
  logger.info("User logged out");

  res.clearCookie("refreshToken");

  return res.status(200).json({
    message: "Logout successful",
  });
};
