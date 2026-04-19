import bcrypt from "bcryptjs";
import { jwtSecret } from "../config/config.js";
import jwt from "jsonwebtoken";

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

export const generateToken = async (id: any) => {
  const token = await jwt.sign({ id: id }, jwtSecret, { expiresIn: "5m" });
  return token;
};
export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, jwtSecret);
  } catch (err) {
    return null;
  }
};
