/**
 * Component tests for the assistant UI.
 *
 * Each test renders a real component with props and asserts on what the user
 * sees. No hooks, no tRPC mocks, no harnesses.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ConversationMessage } from "@/src/features/assistant/page/components/ConversationMessage";
import { MessageInput } from "@/src/features/assistant/page/components/MessageInput";
import { ConversationList } from "@/src/features/assistant/page/components/ConversationList";
import { EmptyState } from "@/src/features/assistant/page/components/EmptyState";

const now = new Date("2026-01-15T12:00:00Z");

describe("ConversationMessage", () => {
  it("renders a user message", () => {
    render(
      <ConversationMessage
        message={{
          id: "1",
          sender: "user",
          content: "What is tracing?",
          createdAt: now,
        }}
      />,
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("What is tracing?")).toBeInTheDocument();
  });

  it("renders an assistant message with copy button", () => {
    render(
      <ConversationMessage
        message={{
          id: "2",
          sender: "assistant",
          content: "Tracing tracks LLM calls.",
          createdAt: now,
        }}
      />,
    );

    expect(screen.getByText("Assistant")).toBeInTheDocument();
    expect(screen.getByText("Tracing tracks LLM calls.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("shows loading placeholder when waiting for response", () => {
    render(
      <ConversationMessage
        message={{
          id: "pending",
          sender: "assistant",
          content: "",
          createdAt: now,
        }}
        isLoading
      />,
    );

    expect(screen.getByText("...")).toBeInTheDocument();
  });
});

describe("MessageInput", () => {
  it("submits on Enter, ignores Shift+Enter", () => {
    const onSubmit = jest.fn();

    render(
      <MessageInput value="Hello" onChange={jest.fn()} onSubmit={onSubmit} />,
    );

    const input = screen.getByRole("textbox", { name: /message input/i });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables submit button when disabled or empty", () => {
    const { rerender } = render(
      <MessageInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();

    rerender(
      <MessageInput
        value="Hi"
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });
});

describe("ConversationList", () => {
  const conversations = [
    { id: "c1", title: "Tracing help", startedAt: now },
    { id: "c2", title: "Prompt debugging", startedAt: now },
  ];

  it("renders conversations and highlights the active one", () => {
    render(
      <ConversationList
        conversations={conversations}
        currentConversationId="c1"
        onSelectConversation={jest.fn()}
        onNewConversation={jest.fn()}
        onDeleteConversation={jest.fn()}
      />,
    );

    expect(screen.getByText("Tracing help")).toBeInTheDocument();
    expect(screen.getByText("Prompt debugging")).toBeInTheDocument();
    expect(screen.getByText("Tracing help").closest("button")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("selects, creates, and deletes conversations", () => {
    const onSelect = jest.fn();
    const onNew = jest.fn();
    const onDelete = jest.fn();

    render(
      <ConversationList
        conversations={conversations}
        currentConversationId="c1"
        onSelectConversation={onSelect}
        onNewConversation={onNew}
        onDeleteConversation={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Prompt debugging"));
    expect(onSelect).toHaveBeenCalledWith("c2");

    fireEvent.click(screen.getByText("New Conversation"));
    expect(onNew).toHaveBeenCalled();

    // Delete with confirmation dialog
    fireEvent.click(
      screen.getAllByRole("button", { name: /delete conversation/i })[0],
    );
    expect(screen.getByText("Are you absolutely sure?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("c1");
  });

  it("shows empty message when no conversations exist", () => {
    render(
      <ConversationList
        conversations={[]}
        onSelectConversation={jest.fn()}
        onNewConversation={jest.fn()}
        onDeleteConversation={jest.fn()}
      />,
    );

    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders suggestions and fires callback on click", () => {
    const onSuggestion = jest.fn();

    render(<EmptyState onSuggestionClick={onSuggestion} />);

    expect(screen.getByText("Langfuse Assistant")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Help me debug a prompt issue"));
    expect(onSuggestion).toHaveBeenCalledWith("Help me debug a prompt issue");
  });
});
