import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { createMockRes } from "../test/mockExpress.js";
import { hashPassword } from "../utils/auth.util.js";

vi.mock("../services/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../config/db.js", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../config/db.js";
import {
  registerController,
  loginController,
  refreshController,
  logoutController,
} from "./auth.controller.js";

function buildReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, cookies: {}, ...overrides } as unknown as Request;
}

beforeEach(() => {
  vi.mocked(prisma.user.findFirst).mockReset();
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.user.create).mockReset();
});

describe("registerController", () => {
  const body = {
    email: "jane@example.com",
    password: "password123",
    firstName: "Jane",
    lastName: "Doe",
    age: 20,
  };

  it("creates a user, sets the refresh cookie, and returns 201", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-1",
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      password: "hashed",
      age: body.age,
    } as never);

    const req = buildReq({ body });
    const res = createMockRes();

    await registerController(req, res);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: body.email }),
      }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        user: { name: "Jane", email: body.email },
        accessToken: expect.any(String),
      }),
    );
  });

  it("returns 400 when the user already exists", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "existing-user",
    } as never);

    const req = buildReq({ body });
    const res = createMockRes();

    await registerController(req, res);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "User already exists" });
  });

  it("returns 500 when a database error occurs", async () => {
    vi.mocked(prisma.user.findFirst).mockRejectedValue(new Error("DB down"));

    const req = buildReq({ body });
    const res = createMockRes();

    await registerController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
  });
});

describe("loginController", () => {
  it("returns 200 with an access token for valid credentials", async () => {
    const hashed = await hashPassword("password123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      firstName: "Jane",
      password: hashed,
    } as never);

    const req = buildReq({
      body: { email: "jane@example.com", password: "password123" },
    });
    const res = createMockRes();

    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Login successful",
        user: { name: "Jane", email: "jane@example.com" },
        accessToken: expect.any(String),
      }),
    );
  });

  it("returns 404 when the user does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const req = buildReq({
      body: { email: "nobody@example.com", password: "password123" },
    });
    const res = createMockRes();

    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "user not found" });
  });

  it("returns 401 for an incorrect password", async () => {
    const hashed = await hashPassword("password123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      firstName: "Jane",
      password: hashed,
    } as never);

    const req = buildReq({
      body: { email: "jane@example.com", password: "wrong-password" },
    });
    const res = createMockRes();

    await loginController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
  });
});

describe("refreshController", () => {
  it("returns 401 when no refresh token cookie is present", async () => {
    const req = buildReq({ cookies: {} });
    const res = createMockRes();

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Refresh token missing",
    });
  });

  it("returns 401 for an invalid refresh token", async () => {
    const req = buildReq({ cookies: { refreshToken: "garbage-token" } });
    const res = createMockRes();

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 404 when the user no longer exists", async () => {
    const { generateRefreshToken } = await import("../utils/auth.util.js");
    const refreshToken = generateRefreshToken("deleted-user");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const req = buildReq({ cookies: { refreshToken } });
    const res = createMockRes();

    await refreshController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "User not found" });
  });

  it("returns a new access token for a valid refresh token", async () => {
    const { generateRefreshToken } = await import("../utils/auth.util.js");
    const refreshToken = generateRefreshToken("user-1");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      firstName: "Jane",
    } as never);

    const req = buildReq({ cookies: { refreshToken } });
    const res = createMockRes();

    await refreshController(req, res);

    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: expect.any(String),
        user: { name: "Jane", email: "jane@example.com" },
      }),
    );
  });
});

describe("logoutController", () => {
  it("clears the refresh cookie and returns 200", async () => {
    const req = buildReq();
    const res = createMockRes();

    await logoutController(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith("refreshToken");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "Logout successful" });
  });
});
