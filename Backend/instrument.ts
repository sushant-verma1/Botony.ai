// Must be imported before any other module (see server.ts) so Sentry's
// auto-instrumentation can patch things before they're required elsewhere.
// If SENTRY_DSN is unset, Sentry is not initialised at all — the app must
// keep working with no error monitoring configured, and Sentry must never
// become a point of failure for the app itself.
import * as Sentry from "@sentry/node";
import type { Breadcrumb, ErrorEvent } from "@sentry/node";
import { sentryDsn, sentryEnvironment } from "./src/config/config.js";

const SENSITIVE_KEY_PATTERN =
  /pass|token|secret|key|dsn|content|message|body|prompt|symptom|text|email|authorization|cookie|attachment|signature/i;

// Patterns for sensitive values that can end up embedded in a string we do
// keep — a database error quoting a row, an exception message built from user
// input. Key-based scrubbing cannot catch those, so the strings themselves
// are redacted too.
const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b(?:Bearer|Basic)\s+[\w\-._~+/]+=*/gi, "[credential]"],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, "[jwt]"],
  [/\bsk-[A-Za-z0-9-_]{12,}\b/g, "[api-key]"],
  // Cloudinary signed-delivery segment: keep the host and path for
  // debugging, drop the signature that makes the URL usable.
  [/\/s--[\w-]+--\//g, "/s--[signature]--/"],
];

// Even after redaction, no single captured string should be able to carry a
// paragraph of symptom description out of the app.
const MAX_STRING_LENGTH = 250;

function redactText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out.length > MAX_STRING_LENGTH
    ? `${out.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : out;
}

function scrub(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "[Filtered]" : scrub(v);
    }
    return out;
  }
  return value;
}

/** Strips the query string, which can carry ids and free text. */
function stripQuery(url: string): string {
  const cut = url.indexOf("?");
  return cut === -1 ? url : `${url.slice(0, cut)}?[Filtered]`;
}

// Breadcrumbs are kept by allowlist, not denylist. A breadcrumb message is
// free text — a logged line, a SQL statement with values inlined — and
// redactText only matches known patterns; nothing can recognise symptom prose.
// So only categories whose shape has been reasoned about survive. In practice
// that leaves http, which is all @sentry/node emits besides console.
const SAFE_BREADCRUMB_CATEGORY = /^(http|sentry\.)/;

/**
 * Breadcrumbs are the quietest leak path: console breadcrumbs mirror every
 * logger call, and http breadcrumbs carry request bodies and URLs. Console
 * breadcrumbs are dropped entirely (Winston already writes those to disk), as
 * is anything outside the allowlist, and what remains is stripped down to
 * what is useful for debugging.
 */
function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!SAFE_BREADCRUMB_CATEGORY.test(breadcrumb.category ?? "")) return null;

  if (breadcrumb.data) {
    const data = { ...breadcrumb.data } as Record<string, unknown>;
    delete data.body;
    delete data.response_body_size;
    if (typeof data.url === "string") data.url = stripQuery(data.url);
    breadcrumb.data = scrub(data) as Breadcrumb["data"];
  }
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = redactText(breadcrumb.message);
  }
  return breadcrumb;
}

/**
 * Symptom text, uploaded report content, message bodies, credentials, and
 * signed attachment URLs must never leave the app via error monitoring.
 */
function beforeSend(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
    // This is where symptom text and message content live.
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    if (event.request.headers) {
      event.request.headers = scrub(event.request.headers) as Record<
        string,
        string
      >;
    }
  }

  // Never the email or IP — an opaque user id is enough to correlate.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
  if (event.contexts) {
    event.contexts = scrub(event.contexts) as typeof event.contexts;
  }
  if (event.message) event.message = redactText(event.message);

  // Exception messages get built from user input more often than anyone
  // intends (ORM errors quote parameter values, validators echo the input).
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
  }

  event.breadcrumbs = (event.breadcrumbs ?? [])
    .map(beforeBreadcrumb)
    .filter((crumb): crumb is Breadcrumb => crumb !== null);

  return event;
}

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnvironment,
    tracesSampleRate: sentryEnvironment === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    maxValueLength: MAX_STRING_LENGTH,
    beforeSend,
    beforeBreadcrumb,
  });
} else {
  console.warn(
    "SENTRY_DSN not set — error monitoring is disabled. The app will continue to run normally.",
  );
}

export { Sentry, scrub, redactText, beforeSend, beforeBreadcrumb };
