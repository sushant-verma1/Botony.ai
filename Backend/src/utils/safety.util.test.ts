import { describe, it, expect } from "vitest";
import {
  detectEmergency,
  getEmergencyResponse,
  getMedicalDisclaimer,
} from "./safety.util.js";

describe("detectEmergency", () => {
  it("returns true for a direct emergency keyword match", () => {
    expect(detectEmergency("chest pain")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(detectEmergency("CHEST PAIN")).toBe(true);
    expect(detectEmergency("Chest Pain")).toBe(true);
  });

  it("matches when the keyword is embedded mid-sentence", () => {
    expect(
      detectEmergency("I've had chest pain since this morning"),
    ).toBe(true);
  });

  it.each([
    "difficulty breathing",
    "severe bleeding",
    "loss of consciousness",
    "severe allergic reaction",
    "poisoning",
    "suspected stroke",
    "severe abdominal pain",
    "suicidal",
    "anaphylaxis",
    "facial drooping",
    "arm weakness",
    "speech difficulty",
  ])("matches the emergency keyword '%s'", (symptom) => {
    expect(detectEmergency(`I am experiencing ${symptom}`)).toBe(true);
  });

  it("returns false for non-emergency text", () => {
    expect(detectEmergency("I have a mild headache and a runny nose")).toBe(
      false,
    );
  });

  it("returns false for empty input", () => {
    expect(detectEmergency("")).toBe(false);
  });
});

describe("getEmergencyResponse", () => {
  it("returns a fixed warning that tells the user to call emergency services", () => {
    const response = getEmergencyResponse();
    expect(response).toMatch(/EMERGENCY WARNING/i);
    expect(response).toMatch(/911/);
    expect(response).toMatch(/immediate/i);
  });
});

describe("getMedicalDisclaimer", () => {
  it("returns a disclaimer stating it is not a licensed physician", () => {
    const disclaimer = getMedicalDisclaimer();
    expect(disclaimer).toMatch(/not.*licensed physician/i);
    expect(disclaimer).toMatch(/911/);
  });
});
