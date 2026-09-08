import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/react";
import { Sentry, scrub, redactText, beforeSend, beforeBreadcrumb } from "./instrument";

// The browser holds the same content the backend does — what the user typed
// and what the assistant replied. None of it may reach Sentry.
const SYMPTOMS =
  "I have had crushing chest pain radiating to my left arm since Tuesday";

describe("frontend Sentry bootstrap", () => {
  it("loads without a DSN and leaves Sentry usable", () => {
    // VITE_SENTRY_DSN is unset under test, so init() never ran.
    expect(typeof Sentry.captureException).toBe("function");
  });
});

describe("frontend scrubbing", () => {
  it("filters content-bearing and credential-bearing keys", () => {
    const scrubbed = scrub({
      content: SYMPTOMS,
      accessToken: "abc",
      conversationId: "c-1",
    }) as Record<string, unknown>;

    expect(scrubbed.content).toBe("[Filtered]");
    expect(scrubbed.accessToken).toBe("[Filtered]");
    expect(scrubbed.conversationId).toBe("c-1");
  });

  it("redacts emails and access tokens embedded in strings", () => {
    expect(redactText("failed for patient@example.com")).toBe(
      "failed for [email]",
    );
    expect(redactText("Bearer abc.def.ghi expired")).toContain("[credential]");
  });
});

describe("frontend beforeSend", () => {
  it("removes the request body, cookies, and query string", () => {
    const out = JSON.stringify(
      beforeSend({
        request: {
          url: "https://botony.ai/chat/c-1?draft=chest+pain",
          data: { content: SYMPTOMS },
          cookies: { refreshToken: "abc" },
          query_string: "draft=chest+pain",
        },
      } as unknown as ErrorEvent),
    );

    expect(out).not.toContain("chest pain");
    expect(out).not.toContain("draft=chest+pain");
    expect(out).toContain("botony.ai/chat/c-1");
  });

  it("reduces the user to an id and redacts exception messages", () => {
    const event = beforeSend({
      user: { id: "user-1", email: "patient@example.com" },
      exception: {
        values: [{ type: "Error", value: `render failed: ${SYMPTOMS}` }],
      },
    } as unknown as ErrorEvent);

    expect(event?.user).toEqual({ id: "user-1" });
    expect(JSON.stringify(event)).not.toContain("patient@example.com");
  });
});

describe("frontend beforeBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(
      beforeBreadcrumb({ category: "console", message: SYMPTOMS }),
    ).toBeNull();
  });

  it("drops ui.* breadcrumbs, whose message is built from the clicked element", () => {
    expect(
      beforeBreadcrumb({
        category: "ui.click",
        message: `button[aria-label="resend ${SYMPTOMS}"]`,
      }),
    ).toBeNull();
    expect(beforeBreadcrumb({ message: SYMPTOMS })).toBeNull();
  });

  it("keeps xhr breadcrumbs without their payloads", () => {
    const crumb = beforeBreadcrumb({
      category: "xhr",
      data: {
        url: "https://api.botony.ai/api/chat/c-1/message?q=chest+pain",
        body: SYMPTOMS,
        status_code: 500,
      },
    });

    const serialized = JSON.stringify(crumb);
    expect(serialized).not.toContain("chest pain");
    expect(serialized).toContain("500");
  });
});

// The blocks above call the hooks directly. This one runs the real
// @sentry/react client with those same hooks and a transport that keeps the
// envelope, so anything the SDK attaches *after* the hook runs is inspected
// too — which is what actually leaves the browser.
describe("frontend Sentry, end to end through a real client", () => {
  const SECRETS = {
    symptoms: SYMPTOMS,
    reply: "Based on your symptoms you should seek urgent care",
    email: "patient.name@example.com",
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1XzQ1NiJ9.YW5vdGhlcl9zaWduYXR1cmU",
    cloudinarySig: "s--Ab3xY9zQ--",
  };

  it("emits an envelope containing none of the synthetic sensitive data", async () => {
    const events: Record<string, unknown>[] = [];

    Sentry.init({
      dsn: "https://examplekey@o0.ingest.sentry.io/0",
      sendDefaultPii: false,
      integrations: [],
      beforeSend,
      beforeBreadcrumb,
      transport: () => ({
        send: async (envelope: never) => {
          for (const [header, payload] of (envelope as [unknown, [{ type: string }, unknown][]])[1]) {
            if (header.type === "event") {
              events.push(payload as Record<string, unknown>);
            }
          }
          return {};
        },
        flush: async () => true,
      }),
    });

    Sentry.addBreadcrumb({ category: "console", message: SECRETS.reply });
    Sentry.addBreadcrumb({
      category: "ui.click",
      message: `button[aria-label="resend ${SECRETS.symptoms}"]`,
    });
    Sentry.addBreadcrumb({
      category: "xhr",
      data: {
        url: `https://api.botony.ai/api/chat/c-1/message?email=${SECRETS.email}`,
        body: JSON.stringify({ content: SECRETS.symptoms }),
        input: SECRETS.reply,
        status_code: 500,
      },
    });

    Sentry.withScope((scope) => {
      scope.setUser({ id: "user-1", email: SECRETS.email, username: "patient.name" });
      scope.setExtra("messageContent", SECRETS.symptoms);
      scope.setExtra("attachmentUrl",
        `https://res.cloudinary.com/demo/image/authenticated/${SECRETS.cloudinarySig}/a.jpg`);
      scope.setExtra("accessToken", SECRETS.jwt);
      scope.setTag("route", "/chat");
      Sentry.captureException(new Error("Chat render failed"));
    });

    await Sentry.flush(2000);
    Sentry.getClient()?.close();

    expect(events).toHaveLength(1);
    const wire = JSON.stringify(events[0]);
    for (const [name, secret] of Object.entries(SECRETS)) {
      expect(wire, `${name} leaked`).not.toContain(secret);
    }

    // Still useful: the error and the correlation id survive.
    expect(wire).toContain("Chat render failed");
    expect(events[0].user).toEqual({ id: "user-1" });
    expect(events[0].tags).toMatchObject({ route: "/chat" });
  });
});
