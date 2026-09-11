import { vi } from "vitest";
import type { Response } from "express";

/** One decoded SSE frame, as the browser would see it. */
export interface SseFrame {
  event: string;
  data: Record<string, unknown>;
}

interface MockResState {
  chunks: string[];
  listeners: Map<string, Array<(...args: unknown[]) => void>>;
  ended: boolean;
  headersSent: boolean;
}

const state = new WeakMap<Response, MockResState>();

export function createMockRes(): Response {
  const res = {} as Response;
  const own: MockResState = {
    chunks: [],
    listeners: new Map(),
    ended: false,
    headersSent: false,
  };
  state.set(res, own);

  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockImplementation(() => {
    own.headersSent = true;
    return res;
  });
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);

  // Streaming surface: enough of ServerResponse for the SSE writer.
  res.setHeader = vi.fn().mockReturnValue(res);
  res.flushHeaders = vi.fn().mockImplementation(() => {
    own.headersSent = true;
  });
  res.write = vi.fn().mockImplementation((chunk: string) => {
    own.headersSent = true;
    own.chunks.push(chunk);
    return true;
  });
  res.end = vi.fn().mockImplementation(() => {
    own.ended = true;
    return res;
  });
  res.on = vi.fn().mockImplementation((event: string, cb: () => void) => {
    const list = own.listeners.get(event) ?? [];
    list.push(cb);
    own.listeners.set(event, list);
    return res;
  });

  Object.defineProperty(res, "writableEnded", { get: () => own.ended });
  Object.defineProperty(res, "headersSent", { get: () => own.headersSent });

  return res;
}

/** Every SSE frame written to the response, in order. */
export function sseFrames(res: Response): SseFrame[] {
  const raw = (state.get(res)?.chunks ?? []).join("");

  return raw
    .split("\n\n")
    .filter((frame) => frame.trim().length > 0)
    .map((frame) => {
      const eventLine = frame.match(/^event: (.*)$/m);
      const dataLine = frame.match(/^data: (.*)$/m);

      return {
        event: eventLine?.[1] ?? "",
        data: dataLine ? JSON.parse(dataLine[1]) : {},
      };
    });
}

/** The last frame written — usually the done or error frame. */
export function lastSseFrame(res: Response): SseFrame | undefined {
  const frames = sseFrames(res);
  return frames[frames.length - 1];
}

/** Raw bytes written, for asserting the wire format itself. */
export function sseBody(res: Response): string {
  return (state.get(res)?.chunks ?? []).join("");
}

/** Simulates the browser going away mid-response. */
export function emitClose(res: Response): void {
  for (const cb of state.get(res)?.listeners.get("close") ?? []) {
    cb();
  }
}

export function createMockNext() {
  return vi.fn();
}
