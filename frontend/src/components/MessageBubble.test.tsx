import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageBubble from "./MessageBubble";
import type { ChatMessage } from "../types/chat";

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    content: "Hello there",
    role: "user",
    emergencyDetected: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/* The turn is told apart by who is speaking, not by how it is painted — so
   these read the heading each turn carries for a screen reader rather than
   the classes on it. */
describe("MessageBubble", () => {
  it("renders the message content", () => {
    render(<MessageBubble message={buildMessage({ content: "I have a headache" })} />);
    expect(screen.getByText("I have a headache")).toBeInTheDocument();
  });

  it("attributes a user message to you", () => {
    render(<MessageBubble message={buildMessage({ role: "user" })} />);

    expect(screen.getByRole("heading", { name: "You" })).toBeInTheDocument();
    expect(screen.queryByText(/emergency/i)).not.toBeInTheDocument();
  });

  it("renders a normal assistant message", () => {
    render(
      <MessageBubble
        message={buildMessage({
          role: "assistant",
          emergencyDetected: false,
          content: "General health info",
        })}
      />,
    );

    expect(screen.getByText("General health info")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Botony" })).toBeInTheDocument();
    expect(screen.queryByText(/emergency/i)).not.toBeInTheDocument();
  });

  it("renders an emergency warning for emergency assistant messages", () => {
    render(
      <MessageBubble
        message={buildMessage({
          role: "assistant",
          emergencyDetected: true,
          content: "Call emergency services immediately",
        })}
      />,
    );

    expect(
      screen.getByText("Call emergency services immediately"),
    ).toBeInTheDocument();
    expect(screen.getByText(/^emergency$/i)).toBeInTheDocument();
  });

  it("does not apply emergency styling to a user message even if emergencyDetected is true", () => {
    render(
      <MessageBubble
        message={buildMessage({
          role: "user",
          emergencyDetected: true,
          content: "I typed chest pain by mistake",
        })}
      />,
    );

    expect(
      screen.getByText("I typed chest pain by mistake"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "You" })).toBeInTheDocument();
    expect(screen.queryByText(/emergency/i)).not.toBeInTheDocument();
  });
});
