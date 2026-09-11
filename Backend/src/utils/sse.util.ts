import type { Response } from "express";

/**
 * Minimal server-sent events writer. The chat endpoint is the only producer,
 * so this stays a formatter — deciding *what* is safe to send is the
 * controller's job, and only vetted fields ever reach `data`.
 */
export function openEventStream(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Without this nginx buffers the whole response and the stream arrives as
  // one lump, which defeats the point.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

export function sendEvent(
  res: Response,
  event: string,
  data: Record<string, unknown>,
): void {
  if (res.writableEnded) return;
  // JSON.stringify keeps the payload on one line, so a newline in generated
  // text can never be read as a frame boundary.
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
