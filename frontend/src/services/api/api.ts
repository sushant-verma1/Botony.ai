import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import type {
  AuthResponse,
  ProfileResponse,
  RefreshResponse,
} from "../../types/auth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
  withCredentials: true,
});

// Relative to baseURL, so it matches config.url as Axios records it.
const REFRESH_PATH = "/auth/refresh";

// The access token lives here as well as in AuthContext state. Interceptors
// need it synchronously — React state only lands a render later — so this is
// the same accessTokenRef trick, moved next to the interceptors that read it.
// AuthContext owns the lifecycle and registers the handlers below; api.ts
// never imports AuthContext, which is what keeps the dependency one-way.
let accessToken: string | null = null;

type SessionHandlers = {
  onRefreshed: (data: RefreshResponse) => void;
  onAuthFailure: () => void;
};

let handlers: SessionHandlers | null = null;

// Held across concurrent 401s so they share one /auth/refresh instead of
// each firing their own. Cleared once it settles, so the next expiry
// starts a fresh one.
let refreshRequest: Promise<RefreshResponse> | null = null;

function refresh(): Promise<RefreshResponse> {
  refreshRequest ??= api
    .post<RefreshResponse>(REFRESH_PATH)
    .then(({ data }) => {
      accessToken = data.accessToken;
      handlers?.onRefreshed(data);
      return data;
    })
    .finally(() => {
      refreshRequest = null;
    });

  return refreshRequest;
}

/**
 * The streaming chat endpoint answers with an event stream, which Axios
 * cannot expose incrementally — so it goes out through fetch instead. It
 * still belongs here: this is where the access token and the single-flight
 * refresh live, so a streaming request joins the same auth session as every
 * Axios call rather than running a second, competing one.
 */
async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetch(`${api.defaults.baseURL}${path}`, {
      ...init,
      // Sends the HttpOnly refresh cookie, exactly like withCredentials above.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  const response = await send(accessToken);
  if (response.status !== 401) {
    return response;
  }

  try {
    // Shares refreshRequest with the interceptor, so a 401 here and a 401 on
    // an Axios call still produce one /auth/refresh between them.
    const { accessToken: token } = await refresh();

    return await send(token);
  } catch {
    accessToken = null;
    handlers?.onAuthFailure();

    // The caller sees the original 401, not the refresh failure.
    return response;
  }
}

export const authSession = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },

  getAccessToken() {
    return accessToken;
  },

  // The refresh token is an HttpOnly cookie; withCredentials above is the
  // only reason this works, and JS never sees the token itself.
  refresh,

  fetch: authFetch,

  // Returns an unsubscribe so AuthProvider can detach on unmount.
  register(next: SessionHandlers) {
    handlers = next;

    return () => {
      if (handlers === next) {
        handlers = null;
      }
    };
  },
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetriableConfig | undefined;

    // Anything that isn't a fresh 401 on a retriable request is left exactly
    // as it was — including the refresh call itself, which must never be able
    // to trigger another refresh.
    if (
      error.response?.status !== 401 ||
      !config ||
      config._retry ||
      config.url === REFRESH_PATH
    ) {
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      const { accessToken: token } = await refresh();
      config.headers.Authorization = `Bearer ${token}`;

      return await api(config);
    } catch {
      accessToken = null;
      handlers?.onAuthFailure();

      // The caller sees the original 401, not the refresh failure.
      return Promise.reject(error);
    }
  },
);

export const authAPI = {
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    age: string
  ) =>
    api.post<AuthResponse>("/auth/register", {
      email,
      password,
      firstName,
      lastName,
      age
    }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>("/auth/login", {
      email,
      password,
    }),

  // The backend column is firstName; the app only ever shows one name, so
  // that is the field the profile form edits.
  updateProfile: (firstName: string) =>
    api.patch<ProfileResponse>("/auth/profile", { firstName }),

  logout: () =>
    api.post<{ message: string }>("/auth/logout"),
};

export default api;
