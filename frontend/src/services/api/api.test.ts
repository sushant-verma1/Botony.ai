import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import api, { authSession } from "./api";

// Stubbing the adapter rather than fetch/XHR keeps the real interceptor chain
// in play — that chain is the thing under test.
type Handler = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

let handle: Handler;

api.defaults.adapter = (config) => handle(config);

function ok(config: InternalAxiosRequestConfig, data: unknown): Promise<AxiosResponse> {
  return Promise.resolve({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  } as AxiosResponse);
}

function unauthorized(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  return Promise.reject(
    new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, {}, {
      data: { message: "Your session has expired. Please log in again." },
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      config,
    } as AxiosResponse),
  );
}

function bearer(config: InternalAxiosRequestConfig) {
  return config.headers.Authorization;
}

const onRefreshed = vi.fn();
const onAuthFailure = vi.fn();
let unregister: () => void;

beforeEach(() => {
  onRefreshed.mockReset();
  onAuthFailure.mockReset();
  unregister?.();
  unregister = authSession.register({ onRefreshed, onAuthFailure });
  authSession.setAccessToken("old-token");
});

describe("api response interceptor", () => {
  it("A. sends an authenticated request through untouched", async () => {
    const seen: unknown[] = [];
    handle = (config) => {
      seen.push(bearer(config));
      return ok(config, { ok: true });
    };

    const { data } = await api.get("/chat/conversations");

    expect(data).toEqual({ ok: true });
    expect(seen).toEqual(["Bearer old-token"]);
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("B. refreshes on 401 and the original request then succeeds", async () => {
    const calls: string[] = [];
    handle = (config) => {
      calls.push(`${config.url}:${bearer(config)}`);

      if (config.url === "/auth/refresh") {
        return ok(config, { accessToken: "new-token", user: { name: "A", email: "a@b.c" } });
      }

      return bearer(config) === "Bearer new-token"
        ? ok(config, { response: "hello" })
        : unauthorized(config);
    };

    const { data } = await api.post("/chat/c1/message", { content: "hi" });

    expect(data).toEqual({ response: "hello" });
    expect(calls).toEqual([
      "/chat/c1/message:Bearer old-token",
      "/auth/refresh:Bearer old-token",
      "/chat/c1/message:Bearer new-token",
    ]);
    expect(authSession.getAccessToken()).toBe("new-token");
    expect(onRefreshed).toHaveBeenCalledWith({
      accessToken: "new-token",
      user: { name: "A", email: "a@b.c" },
    });
  });

  it("C. surfaces the original 401 when the refresh itself fails", async () => {
    handle = (config) => unauthorized(config);

    const error = await api
      .post("/chat/c1/message", { content: "hi" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(AxiosError);
    expect(error.response.status).toBe(401);
    // Requirement 14: Chat.tsx reads this and must not get undefined.
    expect(error.response.data.message).toBe(
      "Your session has expired. Please log in again.",
    );
  });

  it("D. retries the original request at most once", async () => {
    let originalCalls = 0;
    handle = (config) => {
      if (config.url === "/auth/refresh") {
        return ok(config, { accessToken: "new-token" });
      }

      originalCalls += 1;
      // Still 401 even with the new token — must not loop.
      return unauthorized(config);
    };

    await api.get("/chat/conversations").catch(() => {});

    expect(originalCalls).toBe(2);
  });

  it("E. never lets the refresh endpoint trigger a refresh", async () => {
    let refreshCalls = 0;
    handle = (config) => {
      refreshCalls += 1;
      return unauthorized(config);
    };

    await api.post("/auth/refresh").catch(() => {});

    expect(refreshCalls).toBe(1);
  });

  it("F+G. collapses concurrent 401s into one refresh and retries each", async () => {
    let refreshCalls = 0;
    const retried: string[] = [];

    handle = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        // Deferred a tick so all three 401s land while it is still in flight.
        return new Promise((resolve) =>
          setTimeout(() => resolve(ok(config, { accessToken: "new-token" })), 10),
        );
      }

      if (bearer(config) === "Bearer new-token") {
        retried.push(config.url!);
        return ok(config, { url: config.url });
      }

      return unauthorized(config);
    };

    const results = await Promise.all([
      api.get("/chat/a"),
      api.get("/chat/b"),
      api.get("/chat/c"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(retried.sort()).toEqual(["/chat/a", "/chat/b", "/chat/c"]);
    expect(results.map((r) => r.data.url).sort()).toEqual([
      "/chat/a",
      "/chat/b",
      "/chat/c",
    ]);
  });

  it("H. clears the access token and signals auth failure when refresh fails", async () => {
    handle = (config) => unauthorized(config);

    await api.get("/chat/conversations").catch(() => {});

    expect(authSession.getAccessToken()).toBeNull();
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("I. keeps working on the same client after a refresh — no reload needed", async () => {
    let refreshCalls = 0;
    handle = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        return ok(config, { accessToken: "new-token" });
      }

      return bearer(config) === "Bearer new-token"
        ? ok(config, { ok: true })
        : unauthorized(config);
    };

    await api.get("/chat/first");
    const second = await api.get("/chat/second");

    expect(second.data).toEqual({ ok: true });
    // The second request already carries the refreshed token.
    expect(refreshCalls).toBe(1);
  });
});

describe("authSession.fetch (streaming requests)", () => {
  const calls: { url: string; auth: unknown; credentials?: string }[] = [];

  function respond(status: number): Response {
    return { status, ok: status < 400 } as Response;
  }

  /** Answers with 401 until the refreshed token shows up. */
  function stubFetch(tokenThatWorks = "new-token") {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const auth = (init.headers as Record<string, string>).Authorization;
        calls.push({
          url,
          auth,
          credentials: init.credentials,
        });

        return respond(auth === `Bearer ${tokenThatWorks}` ? 200 : 401);
      }),
    );
  }

  beforeEach(() => {
    calls.length = 0;
    vi.unstubAllGlobals();
  });

  it("13. sends the access token as a bearer header, never the refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200)));

    const response = await authSession.fetch("/chat/c1/message", {
      method: "POST",
      body: JSON.stringify({ content: "hi" }),
    });

    expect(response.status).toBe(200);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${api.defaults.baseURL}/chat/c1/message`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer old-token",
    );
    // The refresh token stays an HttpOnly cookie carried by credentials alone.
    expect(init.credentials).toBe("include");
    expect(JSON.stringify(init.headers)).not.toContain("refresh");
    expect(String(init.body)).not.toContain("refresh");
  });

  it("14. refreshes on 401 and replays the streaming request with the new token", async () => {
    let refreshCalls = 0;
    handle = (config) => {
      refreshCalls += 1;
      return ok(config, { accessToken: "new-token" });
    };
    stubFetch();

    const response = await authSession.fetch("/chat/c1/message", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(calls.map((c) => c.auth)).toEqual([
      "Bearer old-token",
      "Bearer new-token",
    ]);
    expect(authSession.getAccessToken()).toBe("new-token");
  });

  it("14b. reports the original 401 and signals auth failure when the refresh fails", async () => {
    handle = (config) => unauthorized(config);
    stubFetch();

    const response = await authSession.fetch("/chat/c1/message");

    expect(response.status).toBe(401);
    expect(authSession.getAccessToken()).toBeNull();
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("15. shares one refresh between concurrent streaming and Axios 401s", async () => {
    let refreshCalls = 0;
    handle = (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        // Deferred so every 401 lands while the refresh is still in flight.
        return new Promise((resolve) =>
          setTimeout(() => resolve(ok(config, { accessToken: "new-token" })), 10),
        );
      }

      return bearer(config) === "Bearer new-token"
        ? ok(config, { ok: true })
        : unauthorized(config);
    };
    stubFetch();

    const [first, second] = await Promise.all([
      authSession.fetch("/chat/a/message"),
      authSession.fetch("/chat/b/message"),
      api.get("/chat/conversations"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(calls.filter((c) => c.auth === "Bearer new-token")).toHaveLength(2);
  });
});
