import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TokenPayload } from "../types/auth.js";
import {accessTokenSecret, refreshTokenSecret} from "../config/config.js";

export const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};
export const comparePassword = async (
  password: string,
  hashedPassword: string,
) => {
  return await bcrypt.compare(password, hashedPassword);
};

export const generateAccessToken = (userId: string) => {
  return jwt.sign({ userId }, accessTokenSecret, {
    expiresIn: "15m",
  });
};

export const generateRefreshToken = (userId: string) => {
  return jwt.sign({ userId }, refreshTokenSecret, {
    expiresIn: "7d",
  });
};
export const verifyAccessToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, accessTokenSecret) as TokenPayload;
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (token: string) => {
  try {
    return jwt.verify(token, refreshTokenSecret) as TokenPayload;
  } catch {
    return null;
  }
};
