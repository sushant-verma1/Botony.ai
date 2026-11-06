import { describe, expect, it } from "vitest";
import {
  hasDeterministicMedicationScheduleIntent,
  parseAgentToolDecision,
} from "./tool-router.service.js";

describe("agent tool router", () => {
  it("accepts only the declared medication scheduling tool", () => {
    expect(parseAgentToolDecision('{"toolName":"draft_medication_schedule"}'))
      .toEqual({ toolName: "draft_medication_schedule" });
    expect(parseAgentToolDecision('{"toolName":"diagnose_condition"}'))
      .toEqual({ toolName: "none" });
  });

  it("fails closed when the model does not return JSON", () => {
    expect(parseAgentToolDecision("Use the scheduling tool."))
      .toEqual({ toolName: "none" });
  });

  it("recognizes explicit medication scheduling requests without an LLM", () => {
    expect(hasDeterministicMedicationScheduleIntent("schedule vitamin D tablets daily at 3:00 pm"))
      .toBe(true);
    expect(hasDeterministicMedicationScheduleIntent("schedule the vitamin B tablet"))
      .toBe(true);
    expect(hasDeterministicMedicationScheduleIntent("schedle vitamin D"))
      .toBe(true);
    expect(hasDeterministicMedicationScheduleIntent("scehdul vitamin D"))
      .toBe(true);
    expect(hasDeterministicMedicationScheduleIntent("schedule a dentist appointment tomorrow"))
      .toBe(false);
  });
});
