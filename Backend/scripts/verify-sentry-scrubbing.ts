/**
 * Item 8 — pushes synthetic sensitive data through every Sentry channel and
 * inspects the envelope that would have gone over the wire.
 *
 *   npm run verify:sentry
 *
 * This deliberately does not call beforeSend directly the way the unit tests
 * do. It initialises the real @sentry/node SDK with the real hooks from
 * instrument.ts and a transport that captures the outgoing envelope, so
 * anything the SDK attaches *after* the hook runs is inspected too.
 */
import "dotenv/config";

// instrument.ts only wires the hooks up when a DSN is present.
const FAKE_DSN = "https://examplekey@o0.ingest.sentry.io/0";
process.env["SENTRY_DSN"] = FAKE_DSN;

// instrument.ts imports config.ts, which throws on any missing variable. This
// script talks to nothing, so stub whatever the environment does not provide.
for (const name of [
  "DATABASE_URL",
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "XAI_API_KEY",
  "GEMINI_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
]) {
  process.env[name] ||= "verification-stub";
}

let passed = 0;
const failures: string[] = [];
const notes: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  const line = `${label}${detail ? ` — ${detail}` : ""}`;
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${line}`);
  } else {
    failures.push(line);
    console.log(`  FAIL  ${line}`);
  }
}

/** Synthetic values. None of these is real. */
const SECRET = {
  symptoms: "crushing chest pain radiating to my left arm since Tuesday",
  report: "HbA1c 9.2 percent, diagnosis pending review",
  reply: "Based on your symptoms you should seek urgent care",
  email: "patient.name@example.com",
  bearer:
    "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1XzEyMyJ9.c2lnbmF0dXJlX2hlcmU",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1XzQ1NiJ9.YW5vdGhlcl9zaWduYXR1cmU",
  apiKey: "sk-live-abcdefghijklmnop1234",
  cloudinarySig: "s--Ab3xY9zQ--",
  cookie: "refreshToken=eyJhbGciOiJIUzI1NiJ9.abcdefgh.ijklmnop",
  password: "hunter2-correct-horse",
};

const ALL_SECRETS = Object.entries(SECRET);

/**
 * Every secret string still reachable from a value, by JSON round trip.
 *
 * Stack frames carry `pre_context`/`context_line`/`post_context`: Sentry's
 * contextLines integration reads the source file around each frame and
 * attaches it. That is application source, never runtime data, and it is what
 * makes a stack trace readable — but in *this* script the synthetic values are
 * literals a few lines from the throw site, so they appear there and would
 * report a leak that cannot happen in the app. Source context is excluded.
 */
const SOURCE_CONTEXT_KEYS = new Set(["pre_context", "context_line", "post_context"]);

function leaks(value: unknown): string[] {
  const text = JSON.stringify(value ?? null, (key, v) =>
    SOURCE_CONTEXT_KEYS.has(key) ? undefined : v,
  );
  return ALL_SECRETS.filter(([, s]) => text.includes(s)).map(([k]) => k);
}

type SentryEvent = Record<string, any>;

async function main() {
  const events: SentryEvent[] = [];

  const { Sentry } = await import("../instrument.js");
  const options = Sentry.getClient()?.getOptions();
  if (!options?.beforeSend || !options.beforeBreadcrumb) {
    throw new Error(
      "instrument.ts did not install beforeSend/beforeBreadcrumb — check the SENTRY_DSN guard",
    );
  }

  // Same hooks the app runs with, plus a transport that keeps the payload.
  Sentry.init({
    dsn: FAKE_DSN,
    environment: "verification",
    sendDefaultPii: false,
    maxValueLength: options.maxValueLength,
    beforeSend: options.beforeSend,
    beforeBreadcrumb: options.beforeBreadcrumb,
    transport: () => ({
      send: async (envelope: any) => {
        for (const [header, payload] of envelope[1] ?? []) {
          if (header?.type === "event") events.push(payload as SentryEvent);
        }
        return {};
      },
      flush: async () => true,
    }),
  });

  // --- feed the secrets in through every channel the SDK can carry them on
  Sentry.addBreadcrumb({
    category: "console",
    level: "log",
    message: `assistant replied: ${SECRET.reply}`,
  });
  Sentry.addBreadcrumb({
    category: "http",
    type: "http",
    data: {
      method: "POST",
      url: `https://api.botony.test/api/chat/c_1/message?email=${SECRET.email}`,
      body: JSON.stringify({ content: SECRET.symptoms }),
      status_code: 500,
    },
  });
  Sentry.addBreadcrumb({
    category: "query",
    message: `INSERT INTO Message (content) VALUES ('${SECRET.symptoms}')`,
  });

  Sentry.withScope((scope) => {
    scope.setUser({
      id: "user_123",
      email: SECRET.email,
      username: "patient.name",
      ip_address: "203.0.113.9",
    });
    scope.setExtra("requestBody", { content: SECRET.symptoms });
    scope.setExtra("pdfText", SECRET.report);
    scope.setExtra(
      "attachmentUrl",
      `https://res.cloudinary.com/demo/image/authenticated/${SECRET.cloudinarySig}/medical/images/u1/a.jpg`,
    );
    scope.setExtra("apiKey", SECRET.apiKey);
    scope.setExtra("password", SECRET.password);
    scope.setTag("provider", "grok");
    scope.setContext("request", {
      url: `https://api.botony.test/api/chat/c_1/message?token=${SECRET.jwt}`,
      headers: {
        authorization: SECRET.bearer,
        cookie: SECRET.cookie,
        "user-agent": "verification",
      },
      data: { content: SECRET.symptoms },
      cookies: { refreshToken: SECRET.jwt },
      query_string: `email=${SECRET.email}`,
    });
    Sentry.captureException(new Error("Provider call failed"));
  });

  // A second event whose *exception message* is built from user input and
  // credentials — the case beforeSend can only pattern-redact, never drop.
  Sentry.captureException(
    new Error(
      `AI request rejected for prompt "${SECRET.symptoms}" using ${SECRET.bearer} / ${SECRET.apiKey} (user ${SECRET.email})`,
    ),
  );

  await Sentry.flush(5000);

  console.log(
    "\n=== Item 8 — Sentry scrubbing (real SDK, captured envelope) ===\n",
  );
  check(
    "the SDK produced envelopes to inspect",
    events.length >= 2,
    `${events.length} events`,
  );
  const event = events[0];
  const freeTextEvent = events[1];
  if (!event || !freeTextEvent) {
    console.log("\nnothing captured — aborting");
    process.exit(1);
  }

  if (process.env["DUMP_EVENT"]) {
    console.log(JSON.stringify(events, null, 2));
  }

  console.log("\n-- channels the scrubbers are responsible for --");
  const channels: Array<[string, unknown]> = [
    ["request", event["request"]],
    ["contexts", event["contexts"]],
    ["extra", event["extra"]],
    ["user", event["user"]],
    ["tags", event["tags"]],
    ["breadcrumbs", event["breadcrumbs"]],
    ["exception", event["exception"]],
  ];
  for (const [name, value] of channels) {
    const found = leaks(value);
    check(
      `${name}: no synthetic secret survives`,
      found.length === 0,
      found.join(", "),
    );
  }
  check(
    "whole event: no synthetic secret survives",
    leaks(event).length === 0,
    leaks(event).join(", "),
  );

  console.log("\n-- the event is still useful for debugging --");
  const wire = JSON.stringify(event);
  check("exception value retained", wire.includes("Provider call failed"));
  check("stack trace retained", wire.includes("stacktrace"));
  check("non-sensitive tag retained", event["tags"]?.provider === "grok");
  check(
    "opaque user id retained for correlation",
    event["user"]?.id === "user_123",
  );
  check(
    "user email / username / ip dropped",
    JSON.stringify(event["user"]) === JSON.stringify({ id: "user_123" }),
    JSON.stringify(event["user"]),
  );
  check(
    "console breadcrumbs dropped entirely",
    !(event["breadcrumbs"] ?? []).some((b: any) => b.category === "console"),
  );
  check(
    "http breadcrumb kept but query string stripped",
    (event["breadcrumbs"] ?? []).some(
      (b: any) => b.category === "http" && b.data?.url?.endsWith("?[Filtered]"),
    ),
  );

  console.log(
    "\n-- exception messages built from user input (pattern redaction only) --",
  );
  const value: string = freeTextEvent["exception"]?.values?.[0]?.value ?? "";
  const credentialLeaks = leaks(value).filter((k) =>
    ["email", "bearer", "jwt", "apiKey", "cloudinarySig", "cookie"].includes(k),
  );
  check(
    "credentials in an exception message are redacted",
    credentialLeaks.length === 0,
    credentialLeaks.join(", "),
  );
  if (value.includes(SECRET.symptoms)) {
    notes.push(
      "Free text embedded in an exception message is NOT removed. redactText is " +
        "pattern-based and\n    no pattern recognises arbitrary symptom text; dropping " +
        "exception values outright would\n    leave errors unreadable. The control is that " +
        "application code must not build Error\n    messages from user content: the only " +
        "capture site is reportProviderFailure() in\n    src/services/ai/index.ts, which " +
        "sends tags only, and no `new Error(...)` in src/\n    interpolates request data.",
    );
  }
  console.log(`  observed exception value: ${JSON.stringify(value)}`);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  if (notes.length) {
    console.log("\nNotes:");
    for (const n of notes) console.log(`  ! ${n}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
