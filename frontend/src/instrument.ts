// Imported first in main.tsx. If VITE_SENTRY_DSN is unset, Sentry is never
// initialised — the app must keep working with no error monitoring at all.
import * as Sentry from "@sentry/react";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

// The browser holds the same medical content the backend does: what the user
// typed, what the assistant replied, and signed attachment URLs. The same
// scrubbing rules apply here.
const SENSITIVE_KEY_PATTERN =
  /pass|token|secret|key|dsn|content|message|body|prompt|symptom|text|email|authorization|cookie|attachment|signature/i;

const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b(?:Bearer|Basic)\s+[\w\-._~+/]+=*/gi, "[credential]"],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, "[jwt]"],
  [/\/s--[\w-]+--\//g, "/s--[signature]--/"],
];

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

function stripQuery(url: string): string {
  const cut = url.indexOf("?");
  return cut === -1 ? url : `${url.slice(0, cut)}?[Filtered]`;
}

// Breadcrumbs are kept by allowlist, not denylist. A breadcrumb message is
// free text and redactText only matches known patterns — nothing can
// recognise symptom prose. ui.* breadcrumbs are excluded deliberately: the
// DOM breadcrumb message is built from the clicked element, including its
// aria-label and title, which in this UI describe medical content.
const SAFE_BREADCRUMB_CATEGORY = /^(xhr|fetch|navigation|sentry\.)/;

/**
 * Drops console breadcrumbs (they mirror anything the app logged, including
 * API payloads) and anything else outside the allowlist, then strips
 * request/response bodies from the network breadcrumbs that remain.
 */
function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!SAFE_BREADCRUMB_CATEGORY.test(breadcrumb.category ?? "")) return null;

  if (breadcrumb.data) {
    const data = { ...breadcrumb.data } as Record<string, unknown>;
    delete data.body;
    delete data.input;
    if (typeof data.url === "string") data.url = stripQuery(data.url);
    breadcrumb.data = scrub(data) as Breadcrumb["data"];
  }
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = redactText(breadcrumb.message);
  }
  return breadcrumb;
}

function beforeSend(event: ErrorEvent): ErrorEvent | null {
  if (event.request) {
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

  if (event.user) event.user = { id: event.user.id };
  if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
  if (event.contexts) {
    event.contexts = scrub(event.contexts) as typeof event.contexts;
  }
  if (event.message) event.message = redactText(event.message);

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
  }

  event.breadcrumbs = (event.breadcrumbs ?? [])
    .map(beforeBreadcrumb)
    .filter((crumb): crumb is Breadcrumb => crumb !== null);

  return event;
}

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    sendDefaultPii: false,
    maxValueLength: MAX_STRING_LENGTH,
    // No session replay on a medical chat app — recording the screen is
    // exactly the wrong default here.
    beforeSend,
    beforeBreadcrumb,
  });
}

export { Sentry, scrub, redactText, beforeSend, beforeBreadcrumb };
