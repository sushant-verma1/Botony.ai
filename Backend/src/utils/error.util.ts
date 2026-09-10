/**
 * Safe log fields for an unknown thrown value.
 *
 * Cloudinary rejects with plain objects (`{ message, http_code }`) rather than
 * Error instances, so `error instanceof Error ? error.message : "unknown"`
 * collapsed every SDK failure to the string "unknown" and hid the real cause.
 *
 * URLs are stripped of their query string and signature segment before they
 * reach a log line: a signed Cloudinary URL is a bearer credential for patient
 * content, and Cloudinary echoes the source URL back inside upload error
 * messages.
 */
export function redactUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (url) => {
    const [base] = url.split("?");
    const path = base.replace(/\/s--[^/]+--\//, "/s--REDACTED--/");
    return url.includes("?") ? `${path}?<redacted>` : path;
  });
}

export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  httpCode?: number;
}

export function describeError(error: unknown): ErrorDetails {
  if (typeof error !== "object" || error === null) {
    return { name: typeof error, message: redactUrls(String(error)) };
  }

  const e = error as Record<string, unknown>;
  const nested =
    typeof e.error === "object" && e.error !== null
      ? (e.error as Record<string, unknown>)
      : {};

  const httpCode = [e.http_code, e.statusCode, e.status, nested.http_code].find(
    (code) => typeof code === "number",
  ) as number | undefined;

  const rawMessage =
    typeof e.message === "string"
      ? e.message
      : typeof nested.message === "string"
        ? nested.message
        : JSON.stringify(e).slice(0, 500);

  return {
    name: typeof e.name === "string" ? e.name : "UnknownError",
    message: redactUrls(rawMessage),
    ...(typeof e.stack === "string" ? { stack: redactUrls(e.stack) } : {}),
    ...(httpCode !== undefined ? { httpCode } : {}),
  };
}
