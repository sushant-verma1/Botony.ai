import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { protect } from "./auth.middleware.js";
import { generateAccessToken } from "../utils/auth.util.js";
import { createMockRes, createMockNext } from "../test/mockExpress.js";

function buildReq(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe("protect middleware", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const req = buildReq(undefined);
    const res = createMockRes();
    const next = createMockNext();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Token not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the header does not start with 'Bearer '", async () => {
    const req = buildReq("Basic something");
    const res = createMockRes();
    const next = createMockNext();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no token follows 'Bearer '", async () => {
    const req = buildReq("Bearer ");
    const res = createMockRes();
    const next = createMockNext();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "token not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid or expired token", async () => {
    const req = buildReq("Bearer not-a-real-token");
    const res = createMockRes();
    const next = createMockNext();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Your session has expired. Please log in again.",
      error: { message: "Invalid or expired token" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.user and calls next() for a valid token", async () => {
    const token = generateAccessToken("user-123");
    const req = buildReq(`Bearer ${token}`);
    const res = createMockRes();
    const next = createMockNext();

    await protect(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.userId).toBe("user-123");
    expect(res.status).not.toHaveBeenCalled();
  });
});
