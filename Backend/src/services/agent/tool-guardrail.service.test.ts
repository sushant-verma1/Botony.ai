import { describe, expect, it } from "vitest";
import { evaluateToolRequest } from "./tool-guardrail.service.js";

describe("evaluateToolRequest", () => {
  it("allows read-only context tools without confirmation", () => {
    expect(evaluateToolRequest("get_verified_memory")).toEqual({
      allowed: true,
      requiresConfirmation: false,
    });
  });

  it("requires explicit confirmation for a side-effecting health action", () => {
    expect(evaluateToolRequest("draft_medication_schedule")).toEqual({
      allowed: true,
      requiresConfirmation: true,
    });
  });

  it("blocks diagnosis and medication-change tools regardless of the prompt", () => {
    expect(evaluateToolRequest("diagnose_condition")).toEqual({
      allowed: false,
      reason: "This medical action is not available to the assistant",
    });
    expect(evaluateToolRequest("change_medication_dose")).toEqual({
      allowed: false,
      reason: "This medical action is not available to the assistant",
    });
  });

  it("fails closed for an undeclared tool", () => {
    expect(evaluateToolRequest("delete_all_records")).toEqual({
      allowed: false,
      reason: "Unknown agent tool",
    });
  });
});
