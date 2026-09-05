import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConversationSidebar from "./ConversationSidebar";
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

describe("ConversationSidebar", () => {
  it("renders the empty state when there are no conversations", () => {
    render(
      <ConversationSidebar
        conversations={[]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={noopAsync}
        creatingChat={false}
        disabled={false}
      />,
    );

    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it("renders a row for each conversation", () => {
    render(
      <ConversationSidebar
        conversations={[
          buildConversation({ id: "conv-1", title: "Headache question" }),
          buildConversation({ id: "conv-2", title: "Fever advice" }),
        ]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={noopAsync}
        creatingChat={false}
        disabled={false}
      />,
    );

    expect(screen.getByText("Headache question")).toBeInTheDocument();
    expect(screen.getByText("Fever advice")).toBeInTheDocument();
  });

  it("falls back to 'New chat' when a conversation has no title", () => {
    render(
      <ConversationSidebar
        conversations={[buildConversation({ title: null })]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={noopAsync}
        creatingChat={false}
        disabled={false}
      />,
    );

    expect(screen.getByText("New chat")).toBeInTheDocument();
  });

  it("calls onNewChat when the New Chat button is clicked", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();

    render(
      <ConversationSidebar
        conversations={[]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={onNewChat}
        onRequestDelete={noop}
        onRename={noopAsync}
        creatingChat={false}
        disabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect with the conversation id when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ConversationSidebar
        conversations={[buildConversation({ id: "conv-42", title: "Cold symptoms" })]}
        activeConversationId={null}
        onSelect={onSelect}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={noopAsync}
        creatingChat={false}
        disabled={false}
      />,
    );

    await user.click(screen.getByText("Cold symptoms"));
    expect(onSelect).toHaveBeenCalledWith("conv-42");
  });
});

describe("ConversationSidebar rename and delete", () => {
  it("saves the new title when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    render(
      <ConversationSidebar
        conversations={[buildConversation({ id: "conv-1", title: "Old title" })]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={onRename}
        creatingChat={false}
        disabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /rename conversation/i }));
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

    render(
      <ConversationSidebar
        conversations={[buildConversation({ id: "conv-1", title: "Old title" })]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={onRename}
        creatingChat={false}
        disabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /rename conversation/i }));
    const input = screen.getByDisplayValue("Old title");
    await user.clear(input);
    await user.type(input, "Changed but cancelled");
    await user.keyboard("{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Old title")).toBeInTheDocument();
  });

  it("saves the title on blur", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    render(
      <ConversationSidebar
        conversations={[buildConversation({ id: "conv-1", title: "Old title" })]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={onRename}
        creatingChat={false}
        disabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /rename conversation/i }));
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

    render(
      <ConversationSidebar
        conversations={[buildConversation({ id: "conv-1", title: "Old title" })]}
        activeConversationId={null}
        onSelect={onSelect}
        onNewChat={noop}
        onRequestDelete={onRequestDelete}
        onRename={noopAsync}
        creatingChat={false}
        disabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete conversation/i }));

    expect(onRequestDelete).toHaveBeenCalledWith("conv-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disables select, rename and delete controls when disabled", () => {
    render(
      <ConversationSidebar
        conversations={[buildConversation({ id: "conv-1", title: "Old title" })]}
        activeConversationId={null}
        onSelect={noop}
        onNewChat={noop}
        onRequestDelete={noop}
        onRename={noopAsync}
        creatingChat={false}
        disabled={true}
      />,
    );

    expect(screen.getByText("Old title").closest("button")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /rename conversation/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /delete conversation/i }),
    ).toBeDisabled();
  });
});
