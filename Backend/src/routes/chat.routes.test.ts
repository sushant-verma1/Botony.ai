import { describe, it, expect } from "vitest";
import chatRouter from "./chat.routes.js";

interface RouteLayer {
  route?: {
    path: string;
    stack: Array<{ name: string }>;
  };
}

function handlersFor(path: string): string[] {
  const layers = (chatRouter as unknown as { stack: RouteLayer[] }).stack;
  const layer = layers.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`No route registered for ${path}`);
  return layer.route.stack.map((handler) => handler.name);
}

describe("chat routes", () => {
  // The streaming endpoint writes SSE headers early, so there is no later
  // opportunity to reject an unauthenticated caller with a status code:
  // `protect` has to run before the controller, exactly as it did before.
  it("runs protect before the streaming message controller", () => {
    const handlers = handlersFor("/:chatid/message");

    expect(handlers).toContain("protect");
    expect(handlers.indexOf("protect")).toBeLessThan(
      handlers.indexOf("messageController"),
    );
  });

  it("keeps the endpoint URL, so the client contract is unchanged", () => {
    expect(() => handlersFor("/:chatid/message")).not.toThrow();
  });

  it("still protects every other chat route", () => {
    for (const path of [
      "/newchat",
      "/conversations",
      "/:chatid/history",
      "/:chatid",
    ]) {
      expect(handlersFor(path)).toContain("protect");
    }
  });

  // The no-:chatid path is the same messageController, reached before any
  // conversation exists — it needs the same guards as its sibling.
  it("runs the rate limiter and protect before the draft-conversation message controller", () => {
    const handlers = handlersFor("/message");

    // express-rate-limit's handler is anonymous at runtime, unlike protect
    // and messageController, so it is asserted by position instead of name.
    expect(handlers[0]).toBe("<anonymous>");
    expect(handlers).toContain("protect");
    expect(handlers.indexOf("protect")).toBeLessThan(
      handlers.indexOf("messageController"),
    );
  });
});
