import { describe, expect, it } from "vitest";
import { MEDICAL_SYSTEM_PROMPT, getSystemPrompt } from "./prompt.js";

describe("getSystemPrompt", () => {
  it("keeps the existing prompt unchanged when no verified memory exists", () => {
    expect(getSystemPrompt()).toBe(MEDICAL_SYSTEM_PROMPT);
  });

  it("labels memory as data and repeats the safety boundary after it", () => {
    const prompt = getSystemPrompt(
      'VERIFIED_PATIENT_CONTEXT_START\n{"category":"ALLERGY","value":"Penicillin"}\nVERIFIED_PATIENT_CONTEXT_END',
    );

    expect(prompt).toContain("SERVER-SUPPLIED PATIENT CONTEXT");
    expect(prompt).toContain("Penicillin");
    expect(prompt.lastIndexOf("FINAL CONTEXT SAFETY CHECK")).toBeGreaterThan(
      prompt.indexOf("Penicillin"),
    );
  });

  it("adds request-scoped temporal context without changing the base prompt", () => {
    const prompt = getSystemPrompt(undefined, {
      referenceUtc: "2026-11-05T10:00:00.000Z",
      localDateTime: "2026-11-05T15:30:00+05:30",
      timezone: "Asia/Kolkata",
    });

    expect(prompt).toContain("Reference UTC datetime: 2026-11-05T10:00:00.000Z");
    expect(prompt).toContain("User local datetime: 2026-11-05T15:30:00+05:30");
    expect(prompt).toContain("User IANA timezone: Asia/Kolkata");
  });

  it("permits only direct replies to an active medical workflow to use conversation context", () => {
    expect(MEDICAL_SYSTEM_PROMPT).toContain("CONVERSATION-AWARE TOPIC CHECK");
    expect(MEDICAL_SYSTEM_PROMPT).toContain("medication-reminder time or start date");
    expect(MEDICAL_SYSTEM_PROMPT).toContain("standalone time, date, or other ambiguous fragment remains");
  });
});
