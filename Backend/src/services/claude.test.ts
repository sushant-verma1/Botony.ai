import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@anthropic-ai/sdk")>();
  const ActualAnthropic = actual.default;

  class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: unknown) {}
  }
  // Inherit static members (APIError, BadRequestError, etc.) from the real class.
  Object.setPrototypeOf(MockAnthropic, ActualAnthropic);

  return { ...actual, default: MockAnthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { getClaudeResponse, ClaudeServiceError } from "./claude.js";

beforeEach(() => {
  mockCreate.mockReset();
});

describe("getClaudeResponse", () => {
  it("returns the text content on success", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Some health info." }],
    });

    const result = await getClaudeResponse([{ role: "user", content: "hi" }]);
    expect(result).toBe("Some health info.");
  });

  it("throws ClaudeServiceError when the response has no text content", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "image" }] });

    await expect(
      getClaudeResponse([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(ClaudeServiceError);
  });

  it("wraps an Anthropic.APIError (e.g. low credit balance) into a safe ClaudeServiceError", async () => {
    const apiError = new Anthropic.BadRequestError(
      400,
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        },
      },
      "Bad Request",
      new Headers(),
    );
    mockCreate.mockRejectedValue(apiError);

    let caught: unknown;
    try {
      await getClaudeResponse([{ role: "user", content: "hi" }]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ClaudeServiceError);
    const serviceError = caught as InstanceType<typeof ClaudeServiceError>;
    expect(serviceError.status).toBe(503);
    expect(serviceError.userMessage).toMatch(/temporarily unavailable/i);
    expect(serviceError.userMessage).not.toMatch(/credit balance/i);
    expect(serviceError.originalMessage).toMatch(/credit balance/i);
  });

  it("wraps a non-Anthropic error (e.g. network failure) into a graceful ClaudeServiceError", async () => {
    mockCreate.mockRejectedValue(new Error("ECONNRESET"));

    let caught: unknown;
    try {
      await getClaudeResponse([{ role: "user", content: "hi" }]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ClaudeServiceError);
    const serviceError = caught as InstanceType<typeof ClaudeServiceError>;
    expect(serviceError.status).toBe(503);
  });
});
