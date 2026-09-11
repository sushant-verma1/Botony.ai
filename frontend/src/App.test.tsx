import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./App";
import { chatAPI } from "./services/api/chatApi";

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock("./context/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("./services/api/chatApi", () => ({
  chatAPI: {
    getConversations: vi.fn(),
    createConversation: vi.fn(),
    getHistory: vi.fn(),
    sendMessage: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(chatAPI.getConversations).mockResolvedValue({
    data: { conversations: [] },
  } as never);
  vi.mocked(chatAPI.createConversation).mockResolvedValue({
    data: { conversationId: "conv-1", message: "ok" },
  } as never);
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  // "/" is the landing for everyone since the landing page landed; the chat
  // has its own route rather than taking over the root.
  it("renders the chat dashboard at /chat for an authenticated user", async () => {
    mockUseAuth.mockReturnValue({
      user: { name: "Test User", email: "test@example.com" },
      logout: vi.fn(),
      loading: false,
      isLoggedIn: true,
    });

    renderAt("/chat");

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/describe your symptoms/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /new conversation/i }),
    ).toBeInTheDocument();
  });

  it("shows the landing hero (not a redirect) for an unauthenticated visitor at /", () => {
    mockUseAuth.mockReturnValue({ isLoggedIn: false });

    renderAt("/");

    expect(screen.getByText(/tell it where it hurts/i)).toBeInTheDocument();
  });

  it("serves the login form, on the character, at /login", async () => {
    mockUseAuth.mockReturnValue({ isLoggedIn: false });

    renderAt("/login");

    // The character springs up from below the fold before the form mounts
    // (see AuthScene) — jsdom has no layout, so the spring still runs, just
    // over nothing worth measuring.
    await waitFor(
      () => expect(screen.getByLabelText(/email/i)).toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("serves the register form, on the character, at /register", async () => {
    mockUseAuth.mockReturnValue({ isLoggedIn: false });

    renderAt("/register");

    await waitFor(
      () => expect(screen.getByLabelText(/first name/i)).toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
  });

  it("renders the not-found page for an unknown route", () => {
    mockUseAuth.mockReturnValue({ isLoggedIn: false });

    renderAt("/some/unknown/route");

    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
