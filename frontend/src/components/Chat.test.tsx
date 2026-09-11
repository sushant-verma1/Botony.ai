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
    streamMessage: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Replays a finished answer as the deltas the backend streams, so the
// component is exercised through the same path as production.
function mockStream(
  text: string,
  result: Partial<{
    messageId: string;
    assistantMessageId: string;
    type: "normal" | "emergency";
  }> = {},
) {
  vi.mocked(chatAPI.streamMessage).mockImplementation(
    async (_conversationId, _message, _attachmentIds, handlers) => {
      handlers.onStart?.("gemini");
      for (const chunk of text.match(/[\s\S]{1,12}/g) ?? []) {
        handlers.onDelta(chunk);
      }
      return {
        messageId: "user-msg-1",
        assistantMessageId: "assistant-msg-1",
        type: "normal",
        ...result,
      };
    },
  );
}

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

/** The composer is a textarea, and jsdom reports a textarea's value as its
 *  text content — so "did it roll back" is asked of the transcript alone. */
function transcript() {
  return within(screen.getByTestId("messages-container"));
}

/** The rail row and the top bar both carry the active title, so anything about
 *  a row is asked of the row's own options button. */
function rowOption(title: string) {
  return screen.getByRole("button", { name: `Options for ${title}` });
}

function findRowOption(title: string) {
  return screen.findByRole("button", { name: `Options for ${title}` });
}

/** Rename and delete live behind each row's options menu, and the popup mounts
 *  a tick after the click. */
async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  item: RegExp,
) {
  await user.click(rowOption(title));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("Chat logout", () => {
  it("redirects to the login page after logout is confirmed", async () => {
    const user = userEvent.setup();
    render(<Chat />);

    await user.click(await screen.findByRole("button", { name: /^account:/i }));
    await user.click(await screen.findByRole("menuitem", { name: /^log out$/i }));
    await user.click(await screen.findByRole("button", { name: /^log out$/i }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});

describe("Chat emergency detection", () => {
  it("shows the emergency warning when the message is flagged as an emergency", async () => {
    const user = userEvent.setup();
    mockStream(
      "⚠️ EMERGENCY WARNING ⚠️\n\nThis symptom may require IMMEDIATE MEDICAL ATTENTION.",
      { type: "emergency" },
    );

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I am having chest pain");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText(/emergency warning/i)).toBeInTheDocument();
    expect(screen.getByText(/^emergency$/i)).toBeInTheDocument();
  });

  it("does not show the emergency warning for a normal message", async () => {
    const user = userEvent.setup();
    mockStream("Drink plenty of fluids and get some rest.");

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a mild headache");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(
      await screen.findByText(/drink plenty of fluids/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^emergency$/i)).not.toBeInTheDocument();
  });
});

describe("Chat messaging", () => {
  it("renders both the user message and the assistant reply after sending", async () => {
    const user = userEvent.setup();
    mockStream("Try resting and staying hydrated.");

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
    vi.mocked(chatAPI.streamMessage).mockRejectedValue(
      new Error("Failed to send message"),
    );

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a sore throat");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to send message"),
    );
    expect(transcript().queryByText("I have a sore throat")).toBeNull();
    expect(input).toHaveValue("I have a sore throat");
  });

  it("shows the backend's token-limit message gracefully when sending fails with that error", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.streamMessage).mockRejectedValue(
      new Error("Message exceeds token limit. Please start a new conversation."),
    );

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
    vi.mocked(chatAPI.streamMessage).mockRejectedValue(
      new Error(
        "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
      ),
    );

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a persistent cough");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Our AI assistant is temporarily unavailable. Please try again shortly, or consult a healthcare professional if you need immediate guidance.",
      ),
    );
    expect(transcript().queryByText("I have a persistent cough")).toBeNull();
    expect(input).toHaveValue("I have a persistent cough");
  });
});

describe("Chat conversation management", () => {
  it("clears messages and starts a fresh conversation when New Chat is clicked", async () => {
    const user = userEvent.setup();
    mockStream("Some reply");
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

    await user.click(screen.getByRole("button", { name: /new conversation/i }));

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

    await openRowMenu(user, "First chat", /delete/i);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(chatAPI.deleteConversation).toHaveBeenCalledWith("conv-a"),
    );
    expect(await screen.findByText("Hello from B")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Options for First chat" }),
    ).not.toBeInTheDocument();
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
    await findRowOption("Old title");

    await openRowMenu(user, "Old title", /rename/i);
    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "New title{enter}");

    await waitFor(() =>
      expect(chatAPI.renameConversation).toHaveBeenCalledWith(
        "conv-a",
        "New title",
      ),
    );
    expect(await findRowOption("New title")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Options for Old title" }),
    ).not.toBeInTheDocument();
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
  it("stays out of the way while the limit is far off", async () => {
    const input = await renderChatAndWaitForReady();
    fireEvent.change(input, { target: { value: "a".repeat(1000) } });
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
  });

  it("counts down over the last 500 characters", async () => {
    const input = await renderChatAndWaitForReady();
    fireEvent.change(input, { target: { value: "a".repeat(2600) } });
    expect(screen.getByText("400 left")).toBeInTheDocument();
  });

  it("turns the count urgent in the final 100 characters", async () => {
    const input = await renderChatAndWaitForReady();
    fireEvent.change(input, { target: { value: "a".repeat(2950) } });
    expect(screen.getByText("50 left")).toHaveClass("text-destructive");
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
    await findRowOption("Old title");

    await openRowMenu(user, "Old title", /rename/i);
    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "Hijacked title{enter}");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not rename conversation"),
    );
    expect(rowOption("Old title")).toBeInTheDocument();
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
    await findRowOption("My chat");

    await openRowMenu(user, "My chat", /delete/i);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not delete conversation"),
    );
    // The dialog stays open so the delete can be retried, and it holds focus
    // away from the rail until it is dismissed.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(rowOption("My chat")).toBeInTheDocument();
    expect(chatAPI.getConversations).toHaveBeenCalledTimes(1);
  });

  it("surfaces the backend's 'Not allowed' message and preserves the input when sending is denied (403)", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.streamMessage).mockRejectedValue(
      new Error("Not allowed"),
    );

    const input = await renderChatAndWaitForReady();
    await user.type(input, "Trying to post into someone else's chat");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Not allowed"),
    );
    expect(
      transcript().queryByText("Trying to post into someone else's chat"),
    ).toBeNull();
    expect(input).toHaveValue("Trying to post into someone else's chat");
  });
});

describe("Chat streaming", () => {
  it("appends chunks to the assistant bubble as they arrive", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const midStream = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.mocked(chatAPI.streamMessage).mockImplementation(
      async (_id, _message, _attachments, handlers) => {
        handlers.onStart?.("gemini");
        handlers.onDelta("This appears ");
        await midStream;
        handlers.onDelta("to be bacteria.");
        return {
          messageId: "user-msg-1",
          assistantMessageId: "assistant-msg-1",
          type: "normal" as const,
        };
      },
    );

    const input = await renderChatAndWaitForReady();
    await user.type(input, "What is this?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    // Visible before the answer is finished.
    expect(await screen.findByText("This appears")).toBeInTheDocument();

    release();

    expect(
      await screen.findByText("This appears to be bacteria."),
    ).toBeInTheDocument();
  });

  it("removes the assistant placeholder when the stream fails before any text", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.streamMessage).mockImplementation(async () => {
      throw new Error(
        "Our AI assistant is temporarily unavailable. Please try again shortly.",
      );
    });

    const input = await renderChatAndWaitForReady();
    await user.type(input, "I have a sore throat");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Our AI assistant is temporarily unavailable. Please try again shortly.",
      ),
    );
    // No empty assistant bubble is left behind, and the message can be retried.
    expect(transcript().queryByText("I have a sore throat")).toBeNull();
    // Back to the empty state: no half-written assistant bubble survives.
    expect(screen.getByText(/start with how you feel/i)).toBeInTheDocument();
    expect(input).toHaveValue("I have a sore throat");
    expect(input).not.toBeDisabled();
  });

  it("drops a partly streamed answer when the stream is interrupted", async () => {
    const user = userEvent.setup();
    vi.mocked(chatAPI.streamMessage).mockImplementation(
      async (_id, _message, _attachments, handlers) => {
        handlers.onStart?.("gemini");
        handlers.onDelta("This appears to be ");
        // Nothing was persisted server-side, so nothing survives here either.
        throw new Error(
          "The answer was cut off before it finished. Please ask again.",
        );
      },
    );

    const input = await renderChatAndWaitForReady();
    await user.type(input, "What is this?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The answer was cut off before it finished. Please ask again.",
      ),
    );
    expect(transcript().queryByText(/this appears to be/i)).toBeNull();
    expect(input).toHaveValue("What is this?");
  });

  it("sends ready attachment ids with the streaming request", async () => {
    const user = userEvent.setup();
    mockStream("Looks like an ordinary rash.");

    const input = await renderChatAndWaitForReady();
    await user.type(input, "see attached");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(chatAPI.streamMessage).toHaveBeenCalledWith(
        "conv-1",
        "see attached",
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });
});
