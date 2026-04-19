import { prisma } from "../config/db.js";
import { Request, Response } from "express";
import {
  hashPassword,
  comparePassword,
  generateToken,
} from "../utils/auth.util.js";

export const registerController = async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: email }],
      },
    });

    if (existingUser) {
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
    const token = await generateToken(newUser.id);
    res
      .status(201)
      .json({
        message: "user registered successfully",
        id: newUser.id,
        user: { name: newUser.firstName, email: newUser.email },
        token: token,
      });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const loginController = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = await generateToken(user.id);
    res
      .status(201)
      .json({
        message: "Login successful",
        id: user.id,
        user: { name: user.firstName, email: user.email },
        token: token,
      });
    
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const logoutController = async (req: Request, res: Response) => {
  // Add logout logic here (clear session/token)
  res.status(200).json({ message: "Logout successful" });
};
