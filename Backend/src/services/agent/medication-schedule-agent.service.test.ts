import { describe, expect, it } from "vitest";
import {
  AgentActionError,
  parseMedicationScheduleDraft,
  parseMedicationSchedulePlannerResult,
  plannerPrompt,
} from "./medication-schedule-agent.service.js";

describe("medication schedule agent draft parser", () => {
  it("instructs the planner to interpret natural language but clarify genuinely ambiguous times", () => {
    const prompt = plannerPrompt("schedule calcium", [], {
      referenceUtc: "2026-11-06T12:00:00.000Z",
      localDateTime: "2026-11-06T17:30:00+05:30",
      timezone: "Asia/Kolkata",
    });
    expect(prompt).toContain('"9 34 pm" and "9:34 pm" mean 21:34');
    expect(prompt).toContain('"tonight at 9" can confidently mean 21:00');
    expect(prompt).toContain('"today at 9" is ambiguous');
    expect(prompt).toContain('reply of only "am" or "pm" resolves');
  });

  it.each([
    ["9 34 pm", "21:34"],
    ["9:34 pm", "21:34"],
    ["tonight at 9", "21:00"],
    ["clarification followed by pm", "21:00"],
    ["clarification followed by am", "09:00"],
  ])("accepts LLM structured output for %s", (_scenario, time) => {
    expect(parseMedicationScheduleDraft(
      `{"medicationId":"med-1","times":["${time}"],"timezone":"Asia/Kolkata","startsOn":"today"}`,
    )).toMatchObject({ times: [time], startsOn: "today" });
  });

  it("accepts the LLM clarification for ambiguous today at 9", () => {
    expect(parseMedicationSchedulePlannerResult(
      '{"kind":"clarification","question":"Do you mean 9 AM or 9 PM?","missingFields":["time meridiem"]}',
    )).toMatchObject({ kind: "clarification", missingFields: ["time meridiem"] });
  });
  it("accepts a planner clarification for an incomplete request", () => {
    expect(parseMedicationSchedulePlannerResult(
      '{"kind":"clarification","question":"What reminder time should I use?"}',
    )).toEqual({
      kind: "clarification",
      question: "What reminder time should I use?",
    });
  });

  it("accepts a constrained existing-medication schedule", () => {
    expect(parseMedicationScheduleDraft(
      '{"kind":"proposal","medicationId":"med-1","times":["08:00","20:00"],"timezone":"Asia/Kolkata","startsOn":"2026-11-02"}',
    )).toEqual({
      medicationId: "med-1",
      times: ["08:00", "20:00"],
      timezone: "Asia/Kolkata",
      startsOn: "2026-11-02",
    });
  });

  it("accepts a new user-named medication with a schedule", () => {
    expect(parseMedicationScheduleDraft(
      '{"kind":"proposal","newMedication":{"name":"Paracetamol","strength":"500 mg","form":"tablet"},"times":["08:00"],"timezone":"Asia/Kolkata","startsOn":"2026-11-02"}',
    )).toEqual({
      newMedication: { name: "Paracetamol", strength: "500 mg", form: "tablet" },
      times: ["08:00"],
      timezone: "Asia/Kolkata",
      startsOn: "2026-11-02",
    });
  });

  it("rejects prose, incomplete output, and mixed medication targets", () => {
    expect(() => parseMedicationScheduleDraft("I need more details.")).toThrow(AgentActionError);
    expect(() => parseMedicationScheduleDraft("{}")).toThrow(AgentActionError);
    expect(() => parseMedicationScheduleDraft(
      '{"kind":"proposal","medicationId":"med-1","newMedication":{"name":"Paracetamol"},"times":["08:00"],"timezone":"UTC","startsOn":"2026-11-02"}',
    )).toThrow(AgentActionError);
  });

  it("accepts a constrained clarification instead of guessed data", () => {
    expect(parseMedicationSchedulePlannerResult(
      '{"kind":"clarification","question":"What medicine, exact time, timezone, and start date should I use?"}',
    )).toMatchObject({ kind: "clarification" });
  });

  it("accepts JSON wrapped in a code fence", () => {
    expect(parseMedicationScheduleDraft(
      '```json\n{"kind":"proposal","medicationId":"med-1","times":["09:00"],"timezone":"UTC","startsOn":"2026-11-02"}\n```',
    )).toMatchObject({ medicationId: "med-1", timezone: "UTC" });
  });
});
