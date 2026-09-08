import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/node";
import {
  Sentry,
  scrub,
  redactText,
  beforeSend,
  beforeBreadcrumb,
} from "./instrument.js";

// The kind of thing a user actually types into this app. Nothing derived
// from it may appear in a Sentry payload.
const SYMPTOMS =
  "I have had crushing chest pain radiating to my left arm since Tuesday and my blood pressure reading was 180/110";
const REPORT_TEXT = "HbA1c 9.2% — poorly controlled type 2 diabetes mellitus";

function payload(event: ErrorEvent): string {
  return JSON.stringify(beforeSend(event));
}

describe("Sentry bootstrap", () => {
  it("does not throw when SENTRY_DSN is unset, and Sentry stays importable", () => {
    // vitest.config.ts does not set SENTRY_DSN, so Sentry.init() was never
    // called — the module must still load cleanly and export a usable SDK.
    expect(Sentry).toBeDefined();
    expect(typeof Sentry.captureException).toBe("function");
  });
});

describe("scrub", () => {
  it("redacts keys that look like secrets, tokens, or content", () => {
    const scrubbed = scrub({
      authorization: "Bearer abc123",
      apiKey: "sk-live-xyz",
      content: SYMPTOMS,
      password: "hunter2",
      safe: "this stays",
    }) as Record<string, unknown>;

    expect(scrubbed.authorization).toBe("[Filtered]");
    expect(scrubbed.apiKey).toBe("[Filtered]");
    expect(scrubbed.content).toBe("[Filtered]");
    expect(scrubbed.password).toBe("[Filtered]");
    expect(scrubbed.safe).toBe("this stays");
  });

  it("scrubs recursively through nested objects and arrays", () => {
    const scrubbed = scrub({
      headers: [{ cookie: "session=abc" }, { accept: "application/json" }],
    }) as { headers: Record<string, unknown>[] };

    expect(scrubbed.headers[0].cookie).toBe("[Filtered]");
    expect(scrubbed.headers[1].accept).toBe("application/json");
  });
});

describe("redactText", () => {
  it("redacts credentials embedded in free-text values", () => {
    expect(redactText("login failed for patient@example.com")).toBe(
      "login failed for [email]",
    );
    expect(redactText("Authorization: Bearer abc.def.ghi")).toContain(
      "[credential]",
    );
    expect(
      redactText(
        "token eyJhbGciOiJIUzI1NiIs.eyJ1c2VySWQiOiJ1LTEifQ.s1gnatureXYZ here",
      ),
    ).toContain("[jwt]");
  });

  it("keeps a Cloudinary URL debuggable while removing the signature", () => {
    const redacted = redactText(
      "GET https://res.cloudinary.com/demo/image/authenticated/s--Ab3xY9z--/medical/images/u1/abc.jpg",
    );
    expect(redacted).toContain("res.cloudinary.com");
    expect(redacted).not.toContain("s--Ab3xY9z--");
  });

  it("truncates long values so a whole symptom description cannot ride along", () => {
    const redacted = redactText(SYMPTOMS.repeat(20));
    expect(redacted.length).toBeLessThan(300);
    expect(redacted).toContain("[truncated]");
  });
});

describe("beforeSend does not let medical content or credentials leave", () => {
  it("drops the request body, cookies, and query string entirely", () => {
    const out = payload({
      request: {
        url: "https://api.botony.ai/api/chat/c-1/message?q=chest+pain",
        method: "POST",
        data: { content: SYMPTOMS, attachmentIds: ["att-1"] },
        cookies: { refreshToken: "eyJhbGciOi.payload.sig" },
        query_string: "q=chest+pain",
        headers: {
          authorization: "Bearer secret-access-token",
          cookie: "refreshToken=abc",
          "user-agent": "Mozilla/5.0",
        },
      },
    } as unknown as ErrorEvent);

    expect(out).not.toContain("chest pain");
    expect(out).not.toContain("secret-access-token");
    expect(out).not.toContain("refreshToken=abc");
    expect(out).not.toContain("q=chest+pain");
    // Non-sensitive request context survives, or the report is useless.
    expect(out).toContain("api/chat/c-1/message");
    expect(out).toContain("Mozilla/5.0");
  });

  it("reduces the user to an opaque id", () => {
    const event = beforeSend({
      user: {
        id: "user-1",
        email: "patient@example.com",
        ip_address: "203.0.113.9",
        username: "patient",
      },
    } as unknown as ErrorEvent);

    expect(event?.user).toEqual({ id: "user-1" });
  });

  it("redacts content that leaked into an exception message", () => {
    // ORM and validation errors routinely quote the offending value.
    const out = payload({
      exception: {
        values: [
          {
            type: "PrismaClientKnownRequestError",
            value: `Unique constraint failed on ("email") for patient@example.com while inserting "${REPORT_TEXT}"`,
          },
        ],
      },
    } as unknown as ErrorEvent);

    expect(out).not.toContain("patient@example.com");
    expect(out).toContain("[email]");
  });

  it("scrubs extra and contexts", () => {
    const out = payload({
      extra: { prompt: SYMPTOMS, conversationId: "c-1" },
      contexts: { upload: { attachmentUrl: "https://res.cloudinary.com/x" } },
    } as unknown as ErrorEvent);

    expect(out).not.toContain("chest pain");
    expect(out).toContain("c-1");
  });

  it("strips breadcrumbs attached to the event, not just live ones", () => {
    const out = payload({
      breadcrumbs: [
        { category: "console", level: "info", message: `logged: ${SYMPTOMS}` },
        {
          category: "http",
          data: {
            url: "https://api.botony.ai/api/chat/c-1/message?content=chest+pain",
            body: SYMPTOMS,
            status_code: 500,
          },
        },
      ],
    } as unknown as ErrorEvent);

    expect(out).not.toContain("chest pain");
    expect(out).toContain("status_code");
  });
});

describe("beforeBreadcrumb", () => {
  it("drops console breadcrumbs, which mirror every logged line", () => {
    expect(
      beforeBreadcrumb({ category: "console", message: `logged: ${SYMPTOMS}` }),
    ).toBeNull();
  });

  it("drops any category outside the allowlist", () => {
    // A breadcrumb message is free text — a query with values inlined, a
    // logger line — and redactText cannot recognise symptom prose. Unknown
    // categories are dropped rather than redacted.
    expect(
      beforeBreadcrumb({
        category: "query",
        message: `INSERT INTO Message (content) VALUES ('${SYMPTOMS}')`,
      }),
    ).toBeNull();
    expect(beforeBreadcrumb({ message: SYMPTOMS })).toBeNull();
  });

  it("keeps http breadcrumbs but removes bodies and query strings", () => {
    const crumb = beforeBreadcrumb({
      category: "http",
      data: {
        url: "https://api.x.ai/v1/chat/completions?key=sk-live-abcdefghijkl",
        body: SYMPTOMS,
        status_code: 502,
      },
    });

    const serialized = JSON.stringify(crumb);
    expect(serialized).not.toContain("chest pain");
    expect(serialized).not.toContain("sk-live-abcdefghijkl");
    expect(serialized).toContain("502");
  });
});
