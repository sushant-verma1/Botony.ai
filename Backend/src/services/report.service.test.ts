import { describe, expect, it } from "vitest";
import { ReportError, parseReportAnalysis } from "./report.service.js";

describe("parseReportAnalysis", () => {
  it("keeps only document-supported structured fields", () => {
    const analysis = parseReportAnalysis(
      JSON.stringify({
        explanation: "This report lists one result outside its printed range.",
        questions: ["What does this result mean in my situation?"],
        uncertainties: ["The report does not state why the test was ordered."],
        observations: [
          {
            name: "Hemoglobin",
            value: "10.2",
            unit: "g/dL",
            referenceRange: "12-16",
            flag: "LOW",
            sourcePage: 1,
          },
        ],
      }),
    );

    expect(analysis.observations).toEqual([
      {
        name: "Hemoglobin",
        value: "10.2",
        unit: "g/dL",
        referenceRange: "12-16",
        flag: "LOW",
        sourcePage: 1,
      },
    ]);
  });

  it("fails closed when the model returns prose instead of a report shape", () => {
    expect(() => parseReportAnalysis("This looks fine.")).toThrow(ReportError);
    expect(() => parseReportAnalysis("{}")).toThrow(ReportError);
  });

  it("marks unfamiliar flags as unknown rather than inferring a clinical meaning", () => {
    const analysis = parseReportAnalysis(
      '{"explanation":"Summary","questions":[],"uncertainties":[],"observations":[{"name":"Test","value":"1","flag":"ABNORMAL"}]}',
    );

    expect(analysis.observations[0].flag).toBe("UNKNOWN");
  });
});
