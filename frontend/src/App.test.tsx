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
  it("redirects an authenticated user from / to the chat dashboard", async () => {
    mockUseAuth.mockReturnValue({
      user: { name: "Test User", email: "test@example.com" },
      logout: vi.fn(),
      loading: false,
      isLoggedIn: true,
    });

    renderAt("/");

    await waitFor(() =>
      expect(screen.getByText(/medical ai/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /new chat/i }),
    ).toBeInTheDocument();
  });

  it("shows the login form (not a redirect) for an unauthenticated visitor at /", () => {
    mockUseAuth.mockReturnValue({ isLoggedIn: false });

    renderAt("/");

    expect(
      screen.getByRole("heading", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("still serves the plain login card at /login", () => {
    mockUseAuth.mockReturnValue({ isLoggedIn: false });

    renderAt("/login");

    expect(
      screen.getByRole("heading", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("renders the not-found page for an unknown route", () => {
    mockUseAuth.mockReturnValue({ isLoggedIn: false });

    renderAt("/some/unknown/route");

    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
