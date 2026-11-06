import { describe, expect, it } from "vitest";
import {
  createTemporalContext,
  resolveScheduleDateExpression,
  TemporalResolutionError,
} from "./temporal-context.service.js";

describe("temporal context and schedule-date resolution", () => {
  const reference = new Date("2026-11-05T20:30:00.000Z");

  it("captures UTC and a user's local datetime from a valid IANA timezone", () => {
    expect(createTemporalContext("Asia/Kolkata", reference)).toEqual({
      referenceUtc: "2026-11-05T20:30:00.000Z",
      localDateTime: "2026-11-06T02:00:00+05:30",
      timezone: "Asia/Kolkata",
    });
  });

  it("does not trust an invalid timezone supplied by a client", () => {
    const context = createTemporalContext("not/a-timezone", reference);
    expect(context.timezone).toBeNull();
    expect(context.localDateTime).toBeNull();
  });

  it("resolves relative dates against the captured local calendar", () => {
    const context = createTemporalContext("Asia/Kolkata", reference);
    expect(resolveScheduleDateExpression("today", context)).toBe("2026-11-06");
    expect(resolveScheduleDateExpression("tomorrow", context)).toBe("2026-11-07");
    expect(resolveScheduleDateExpression("in 2 hours", context)).toBe("2026-11-06");
    expect(resolveScheduleDateExpression("next monday", context)).toBe("2026-11-09");
  });

  it("asks for clarification for an unsupported or timezone-less expression", () => {
    expect(() => resolveScheduleDateExpression("Monday", createTemporalContext("Asia/Kolkata", reference)))
      .toThrow(TemporalResolutionError);
    expect(() => resolveScheduleDateExpression("tomorrow", createTemporalContext(undefined, reference)))
      .toThrow("IANA timezone");
  });
});
