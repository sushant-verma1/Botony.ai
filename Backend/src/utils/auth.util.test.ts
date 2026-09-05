import { describe, it, expect } from "vitest";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./auth.util.js";

describe("hashPassword / comparePassword", () => {
  it("hashes a password and verifies the correct password against it", async () => {
    const hashed = await hashPassword("correct-password");
    expect(hashed).not.toBe("correct-password");
    await expect(comparePassword("correct-password", hashed)).resolves.toBe(
      true,
    );
  });

  it("rejects an incorrect password", async () => {
    const hashed = await hashPassword("correct-password");
    await expect(comparePassword("wrong-password", hashed)).resolves.toBe(
      false,
    );
  });
});

describe("access token", () => {
  it("round-trips a userId through generate and verify", () => {
    const token = generateAccessToken("user-123");
    const payload = verifyAccessToken(token);
    expect(payload?.userId).toBe("user-123");
  });

  it("returns null for a garbage token", () => {
    expect(verifyAccessToken("not-a-real-token")).toBeNull();
  });

  it("returns null when verified as a refresh token (different secret)", () => {
    const accessToken = generateAccessToken("user-123");
    expect(verifyRefreshToken(accessToken)).toBeNull();
  });
});

describe("refresh token", () => {
  it("round-trips a userId through generate and verify", () => {
    const token = generateRefreshToken("user-456");
    const payload = verifyRefreshToken(token);
    expect(payload?.userId).toBe("user-456");
  });

  it("returns null for a garbage token", () => {
    expect(verifyRefreshToken("not-a-real-token")).toBeNull();
  });

  it("returns null when verified as an access token (different secret)", () => {
    const refreshToken = generateRefreshToken("user-456");
    expect(verifyAccessToken(refreshToken)).toBeNull();
  });
});
