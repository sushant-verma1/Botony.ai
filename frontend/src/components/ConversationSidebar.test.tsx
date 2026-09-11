import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConversationSidebar from "./ConversationSidebar";
import { SidebarProvider } from "./ui/sidebar";
import type { ConversationSummary } from "../types/chat";

function buildConversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id: "conv-1",
    title: "Headache question",
    status: "ongoing",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const noop = () => {};
const noopAsync = async () => {};

/** The rail reads its open/collapsed state off a provider, so every case here
 *  mounts inside one — the same one Chat wraps the screen in. */
function renderSidebar(
  props: Partial<React.ComponentProps<typeof ConversationSidebar>> = {},
) {
  return render(
    <SidebarProvider>
      <ConversationSidebar
        conversations={[]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={noopAsync}
        creatingChat={false}
        disabled={false}
        {...props}
      />
    </SidebarProvider>,
  );
}

/** Rename and delete live behind a per-row options menu, so both start here.
 *  The popup mounts a tick after the click, so the item is awaited. */
async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  item: RegExp,
) {
  await user.click(screen.getByRole("button", { name: /options for/i }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("ConversationSidebar", () => {
  it("renders the empty state when there are no conversations", () => {
    renderSidebar();

    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("renders a row for each conversation", () => {
    renderSidebar({
      conversations: [
        buildConversation({ id: "conv-1", title: "Headache question" }),
        buildConversation({ id: "conv-2", title: "Fever advice" }),
      ],
    });

    expect(screen.getByText("Headache question")).toBeInTheDocument();
    expect(screen.getByText("Fever advice")).toBeInTheDocument();
  });

  it("falls back to a placeholder when a conversation has no title", () => {
    renderSidebar({ conversations: [buildConversation({ title: null })] });

    // The header button carries the same words, so this asks the row itself.
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("New conversation")).toBeInTheDocument();
  });

  it("calls onNewChat when the new conversation button is clicked", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();

    renderSidebar({ onNewChat });

    await user.click(screen.getByRole("button", { name: /new conversation/i }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect with the conversation id when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderSidebar({
      conversations: [
        buildConversation({ id: "conv-42", title: "Cold symptoms" }),
      ],
      onSelect,
    });

    await user.click(screen.getByText("Cold symptoms"));
    expect(onSelect).toHaveBeenCalledWith("conv-42");
  });

  it("marks an emergency conversation for screen readers too", () => {
    renderSidebar({
      conversations: [
        buildConversation({ title: "Chest pain", status: "emergency" }),
      ],
    });

    expect(screen.getByText("(emergency)")).toBeInTheDocument();
  });
});

describe("ConversationSidebar rename and delete", () => {
  it("saves the new title when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    renderSidebar({
      conversations: [buildConversation({ id: "conv-1", title: "Old title" })],
      onRename,
    });

    await openRowMenu(user, /rename/i);

    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "New title{enter}");

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith("conv-1", "New title"),
    );
  });

  it("cancels editing on Escape without saving", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    renderSidebar({
      conversations: [buildConversation({ id: "conv-1", title: "Old title" })],
      onRename,
    });

    await openRowMenu(user, /rename/i);

    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "Changed but cancelled");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Old title")).toBeInTheDocument();
  });

  it("saves the title on blur", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    renderSidebar({
      conversations: [buildConversation({ id: "conv-1", title: "Old title" })],
      onRename,
    });

    await openRowMenu(user, /rename/i);

    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "Blurred title");
    fireEvent.blur(input);

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith("conv-1", "Blurred title"),
    );
  });

  it("calls onRequestDelete with the conversation id without selecting it", async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    const onSelect = vi.fn();

    renderSidebar({
      conversations: [buildConversation({ id: "conv-1", title: "Old title" })],
      onRequestDelete,
      onSelect,
    });

    await openRowMenu(user, /delete/i);

    expect(onRequestDelete).toHaveBeenCalledWith("conv-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disables the row and its options menu when disabled", () => {
    renderSidebar({
      conversations: [buildConversation({ id: "conv-1", title: "Old title" })],
      disabled: true,
    });

    expect(screen.getByText("Old title").closest("button")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /options for/i }),
    ).toBeDisabled();
  });
});
