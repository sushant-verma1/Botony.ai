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

describe("MessageBubble", () => {
  it("renders the message content", () => {
    render(<MessageBubble message={buildMessage({ content: "I have a headache" })} />);
    expect(screen.getByText("I have a headache")).toBeInTheDocument();
  });

  it("renders a user message aligned to the right", () => {
    const { container } = render(
      <MessageBubble message={buildMessage({ role: "user" })} />,
    );
    expect(container.querySelector(".justify-end")).toBeInTheDocument();
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
    expect(screen.getByText("🩺")).toBeInTheDocument();
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
    expect(screen.getByText("🚨")).toBeInTheDocument();
  });

  it("does not apply emergency styling to a user message even if emergencyDetected is true", () => {
    const { container } = render(
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
    expect(container.querySelector(".justify-end")).toBeInTheDocument();
    expect(screen.queryByText("🚨")).not.toBeInTheDocument();
  });
});
