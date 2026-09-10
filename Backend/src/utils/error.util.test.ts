import { describe, it, expect } from "vitest";
import { describeError, redactUrls } from "./error.util.js";

describe("describeError", () => {
  it("keeps detail from non-Error Cloudinary rejections", () => {
    expect(
      describeError({ message: "Invalid Signature", http_code: 401 }),
    ).toMatchObject({ message: "Invalid Signature", httpCode: 401 });
  });

  it("reads nested Cloudinary api error shapes", () => {
    expect(
      describeError({ error: { message: "Resource not found", http_code: 404 } }),
    ).toMatchObject({ message: "Resource not found", httpCode: 404 });
  });

  it("keeps name, message and stack from real Errors", () => {
    const details = describeError(new TypeError("boom"));
    expect(details.name).toBe("TypeError");
    expect(details.message).toBe("boom");
    expect(details.stack).toContain("TypeError: boom");
  });

  it("never leaks signatures or query tokens from URLs", () => {
    const message = redactUrls(
      "Error in loading https://res.cloudinary.com/demo/image/authenticated/s--AbC123--/v1/x.png?api_key=1&signature=deadbeef - 401",
    );
    expect(message).not.toContain("AbC123");
    expect(message).not.toContain("deadbeef");
    expect(message).toContain("s--REDACTED--");
    expect(message).toContain("<redacted>");
    expect(message).toContain("/demo/image/authenticated/");
  });
});
