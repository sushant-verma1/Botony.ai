import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chat from "./Chat";
import { chatAPI } from "../services/api/chatApi";
import toast from "react-hot-toast";
import type { ChatMessage, ConversationSummary } from "../types/chat";

const { mockNavigate, mockLogout } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLogout: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Test User", email: "test@example.com" },
    logout: mockLogout,
    loading: false,
    isLoggedIn: true,
  }),
}));

vi.mock("../services/api/chatApi", () => ({
  chatAPI: {
    getConversations: vi.fn(),
    createConversation: vi.fn(),
    getHistory: vi.fn(),
    sendMessage: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

function buildConversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id: "conv-1",
    title: "Conversation",
    status: "ongoing",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    content: "Hello",
    role: "user",
    emergencyDetected: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mockLogout.mockResolvedValue(undefined);

  vi.mocked(chatAPI.getConversations).mockResolvedValue({
    data: { conversations: [] },
  } as never);
  vi.mocked(chatAPI.createConversation).mockResolvedValue({
    data: { conversationId: "conv-1", message: "ok" },
  } as never);
});

async function renderChatAndWaitForReady() {
  render(<Chat />);

  const input = await screen.findByPlaceholderText(
    /describe your symptoms/i,
  );
  await waitFor(() => expect(input).not.toBeDisabled());

  return input;
}

describe("Chat logout", () => {
  it("redirects to the login page after logout is confirmed", async () => {
    const user = userEvent.setup();
    render(<Chat />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^logout$/i }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /^logout$/i }));
    await user.click(screen.getByRole("button", { name: /^log out$/i }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});

describe("Chat emergency detection", () => {
  it("shows the emergency warning when the message is flagged as an emergency", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockResolvedValue({
      data: {
        messageId: "user-msg-1",
        assistantMessageId: "assistant-msg-1",
        type: "emergency",
        response:
          "⚠️ EMERGENCY WARNING ⚠️\n\nThis symptom may require IMMEDIATE MEDICAL ATTENTION.",
      },
    } as never);

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I am having chest pain");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText(/emergency warning/i)).toBeInTheDocument();
    expect(screen.getByText("🚨")).toBeInTheDocument();
  });

  it("does not show the emergency warning for a normal message", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockResolvedValue({
      data: {
        messageId: "user-msg-2",
        assistantMessageId: "assistant-msg-2",
        type: "normal",
        response: "Drink plenty of fluids and get some rest.",
      },
    } as never);

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a mild headache");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(
      await screen.findByText(/drink plenty of fluids/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("🚨")).not.toBeInTheDocument();
  });
});

describe("Chat messaging", () => {
  it("renders both the user message and the assistant reply after sending", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockResolvedValue({
      data: {
        messageId: "u1",
        assistantMessageId: "a1",
        type: "normal",
        response: "Try resting and staying hydrated.",
      },
    } as never);

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a sore throat");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText("I have a sore throat")).toBeInTheDocument();
    expect(
      await screen.findByText("Try resting and staying hydrated."),
    ).toBeInTheDocument();
  });

  it("shows a generic error and rolls back the message when sending fails", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockRejectedValue(new Error("Network Error"));

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a sore throat");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to send message"),
    );
    expect(screen.queryByText("I have a sore throat")).not.toBeInTheDocument();
    expect(input).toHaveValue("I have a sore throat");
  });

  it("shows the backend's token-limit message gracefully when sending fails with that error", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          message: "Message exceeds token limit. Please start a new conversation.",
          totalTokens: 51000,
        },
      },
    });

    const input = await renderChatAndWaitForReady();
    await user.type(input, "Tell me a very long story");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Message exceeds token limit. Please start a new conversation.",
      ),
    );
  });

  it("shows a graceful message and preserves the input when Claude is unavailable (e.g. low credit balance)", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 503,
        data: {
          message:
            "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
        },
      },
    });

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a persistent cough");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
      ),
    );
    expect(screen.queryByText("I have a persistent cough")).not.toBeInTheDocument();
    expect(input).toHaveValue("I have a persistent cough");
  });
});

describe("Chat conversation management", () => {
  it("clears messages and starts a fresh conversation when New Chat is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockResolvedValue({
      data: {
        messageId: "u1",
        assistantMessageId: "a1",
        type: "normal",
        response: "Some reply",
      },
    } as never);
    vi.mocked(chatAPI.createConversation)
      .mockResolvedValueOnce({
        data: { conversationId: "conv-1", message: "ok" },
      } as never)
      .mockResolvedValueOnce({
        data: { conversationId: "conv-2", message: "ok" },
      } as never);

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a sore throat");
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    expect(await screen.findByText("I have a sore throat")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() =>
      expect(chatAPI.createConversation).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByText("I have a sore throat")).not.toBeInTheDocument();
  });

  it("loads the selected conversation's history when clicked in the sidebar", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.getConversations).mockResolvedValue({
      data: {
        conversations: [
          buildConversation({ id: "conv-a", title: "First chat" }),
          buildConversation({ id: "conv-b", title: "Second chat" }),
        ],
      },
    } as never);
    vi.mocked(chatAPI.getHistory).mockImplementation((async (
      conversationId: string,
    ) => {
      if (conversationId === "conv-a") {
        return {
          data: {
            conversationId: "conv-a",
            messages: [buildMessage({ id: "m1", content: "Hello from A" })],
            hasMore: false,
            nextCursor: null,
          },
        };
      }
      return {
        data: {
          conversationId: "conv-b",
          messages: [buildMessage({ id: "m2", content: "Hello from B" })],
          hasMore: false,
          nextCursor: null,
        },
      };
    }) as never);

    render(<Chat />);
    expect(await screen.findByText("Hello from A")).toBeInTheDocument();

    await user.click(screen.getByText("Second chat"));

    expect(await screen.findByText("Hello from B")).toBeInTheDocument();
    expect(screen.queryByText("Hello from A")).not.toBeInTheDocument();
  });

  it("deletes a conversation and switches to the next one", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.getConversations)
      .mockResolvedValueOnce({
        data: {
          conversations: [
            buildConversation({ id: "conv-a", title: "First chat" }),
            buildConversation({ id: "conv-b", title: "Second chat" }),
          ],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          conversations: [buildConversation({ id: "conv-b", title: "Second chat" })],
        },
      } as never);
    vi.mocked(chatAPI.getHistory).mockImplementation((async (
      conversationId: string,
    ) => {
      if (conversationId === "conv-a") {
        return {
          data: {
            conversationId: "conv-a",
            messages: [buildMessage({ id: "m1", content: "Hello from A" })],
            hasMore: false,
            nextCursor: null,
          },
        };
      }
      return {
        data: {
          conversationId: "conv-b",
          messages: [buildMessage({ id: "m2", content: "Hello from B" })],
          hasMore: false,
          nextCursor: null,
        },
      };
    }) as never);
    vi.mocked(chatAPI.deleteConversation).mockResolvedValue({
      data: { message: "deleted" },
    } as never);

    render(<Chat />);
    expect(await screen.findByText("Hello from A")).toBeInTheDocument();

    const firstRow = screen.getByText("First chat").closest("div")!;
    await user.click(
      within(firstRow).getByRole("button", { name: /delete conversation/i }),
    );
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(chatAPI.deleteConversation).toHaveBeenCalledWith("conv-a"),
    );
    expect(await screen.findByText("Hello from B")).toBeInTheDocument();
    expect(screen.queryByText("First chat")).not.toBeInTheDocument();
  });

  it("renames a conversation and updates the sidebar", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.getConversations).mockResolvedValue({
      data: {
        conversations: [buildConversation({ id: "conv-a", title: "Old title" })],
      },
    } as never);
    vi.mocked(chatAPI.getHistory).mockResolvedValue({
      data: {
        conversationId: "conv-a",
        messages: [],
        hasMore: false,
        nextCursor: null,
      },
    } as never);
    vi.mocked(chatAPI.renameConversation).mockResolvedValue({
      data: { conversationId: "conv-a", title: "New title" },
    } as never);

    render(<Chat />);
    await screen.findByText("Old title");

    await user.click(
      screen.getByRole("button", { name: /rename conversation/i }),
    );
    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "New title{enter}");

    await waitFor(() =>
      expect(chatAPI.renameConversation).toHaveBeenCalledWith(
        "conv-a",
        "New title",
      ),
    );
    expect(await screen.findByText("New title")).toBeInTheDocument();
    expect(screen.queryByText("Old title")).not.toBeInTheDocument();
  });
});

describe("Chat pagination", () => {
  it("loads older messages when scrolling to the top", async () => {
    vi.mocked(chatAPI.getConversations).mockResolvedValue({
      data: { conversations: [buildConversation({ id: "conv-a" })] },
    } as never);
    vi.mocked(chatAPI.getHistory)
      .mockResolvedValueOnce({
        data: {
          conversationId: "conv-a",
          messages: [buildMessage({ id: "m2", content: "Recent message" })],
          hasMore: true,
          nextCursor: "cursor-1",
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          conversationId: "conv-a",
          messages: [buildMessage({ id: "m1", content: "Older message" })],
          hasMore: false,
          nextCursor: null,
        },
      } as never);

    render(<Chat />);
    await screen.findByText("Recent message");

    const container = screen.getByTestId("messages-container");
    fireEvent.scroll(container);

    await waitFor(() =>
      expect(chatAPI.getHistory).toHaveBeenCalledWith("conv-a", {
        before: "cursor-1",
      }),
    );
    expect(await screen.findByText("Older message")).toBeInTheDocument();
  });
});

describe("Chat character counter", () => {
  it("shows a yellow counter once the message nears 1000 characters", async () => {
    const input = await renderChatAndWaitForReady();
    fireEvent.change(input, { target: { value: "a".repeat(1000) } });
    expect(screen.getByText("1000/3000")).toHaveClass("text-yellow-500");
  });

  it("shows a red counter once the message nears the 3000 character limit", async () => {
    const input = await renderChatAndWaitForReady();
    fireEvent.change(input, { target: { value: "a".repeat(2500) } });
    expect(screen.getByText("2500/3000")).toHaveClass("text-red-500");
  });
});

describe("Chat authorization (backend-enforced 403s are handled gracefully)", () => {
  it("does not switch conversations or leak state when loading another conversation is denied (403)", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.getConversations).mockResolvedValue({
      data: {
        conversations: [
          buildConversation({ id: "conv-a", title: "My chat" }),
          buildConversation({ id: "conv-b", title: "Someone else's chat" }),
        ],
      },
    } as never);
    vi.mocked(chatAPI.getHistory).mockImplementation((async (
      conversationId: string,
    ) => {
      if (conversationId === "conv-a") {
        return {
          data: {
            conversationId: "conv-a",
            messages: [buildMessage({ id: "m1", content: "Hello from A" })],
            hasMore: false,
            nextCursor: null,
          },
        };
      }
      const error: unknown = {
        isAxiosError: true,
        response: { status: 403, data: { message: "Not allowed" } },
      };
      throw error;
    }) as never);

    render(<Chat />);
    expect(await screen.findByText("Hello from A")).toBeInTheDocument();

    await user.click(screen.getByText("Someone else's chat"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not load conversation"),
    );
    // The view must not change or show any partial/leaked data from conv-b.
    expect(screen.getByText("Hello from A")).toBeInTheDocument();
  });

  it("leaves the title unchanged when renaming is denied (403)", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.getConversations).mockResolvedValue({
      data: { conversations: [buildConversation({ id: "conv-a", title: "Old title" })] },
    } as never);
    vi.mocked(chatAPI.getHistory).mockResolvedValue({
      data: { conversationId: "conv-a", messages: [], hasMore: false, nextCursor: null },
    } as never);
    vi.mocked(chatAPI.renameConversation).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "Not allowed" } },
    });

    render(<Chat />);
    await screen.findByText("Old title");

    await user.click(
      screen.getByRole("button", { name: /rename conversation/i }),
    );
    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "Hijacked title{enter}");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not rename conversation"),
    );
    expect(screen.getByText("Old title")).toBeInTheDocument();
    expect(screen.queryByText("Hijacked title")).not.toBeInTheDocument();
  });

  it("keeps the conversation in the list when deleting is denied (403)", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.getConversations).mockResolvedValue({
      data: { conversations: [buildConversation({ id: "conv-a", title: "My chat" })] },
    } as never);
    vi.mocked(chatAPI.getHistory).mockResolvedValue({
      data: { conversationId: "conv-a", messages: [], hasMore: false, nextCursor: null },
    } as never);
    vi.mocked(chatAPI.deleteConversation).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "Not allowed" } },
    });

    render(<Chat />);
    await screen.findByText("My chat");

    await user.click(
      screen.getByRole("button", { name: /delete conversation/i }),
    );
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not delete conversation"),
    );
    expect(screen.getByText("My chat")).toBeInTheDocument();
    expect(chatAPI.getConversations).toHaveBeenCalledTimes(1);
  });

  it("surfaces the backend's 'Not allowed' message and preserves the input when sending is denied (403)", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.sendMessage).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "Not allowed" } },
    });

    const input = await renderChatAndWaitForReady();
    await user.type(input, "Trying to post into someone else's chat");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Not allowed"),
    );
    expect(
      screen.queryByText("Trying to post into someone else's chat"),
    ).not.toBeInTheDocument();
    expect(input).toHaveValue("Trying to post into someone else's chat");
  });
});
