/**
 * Tests for the message-building logic in useAssistantStreamMessages.
 *
 * The hook itself depends on tRPC and React state, so rather than rendering it
 * (which requires a full tRPC provider setup), we extract and test the pure
 * logic: message deduplication, streaming message assembly, and optimistic
 * message merging.
 *
 * These functions mirror the useMemo logic inside the hook.
 */

type MessageLike = {
  id: string;
  sender: string;
  content: string;
  createdAt: Date;
};

/**
 * Replicates the messages-building logic from useAssistantStreamMessages.
 * Extracted here so we can unit-test it without rendering the hook.
 */
function buildMessages({
  fetchedMessages,
  optimisticMessages,
  conversationId,
  streamingContent,
}: {
  fetchedMessages: MessageLike[];
  optimisticMessages: MessageLike[];
  conversationId: string | null;
  streamingContent: string | null;
}): MessageLike[] {
  const dedupedOptimistic =
    fetchedMessages.length > 0
      ? optimisticMessages.filter(
          (opt) =>
            !fetchedMessages.some(
              (fetched) =>
                fetched.sender === opt.sender &&
                fetched.content === opt.content,
            ),
        )
      : optimisticMessages;

  const base = conversationId
    ? [...fetchedMessages, ...dedupedOptimistic]
    : dedupedOptimistic;

  if (streamingContent !== null) {
    return [
      ...base,
      {
        id: "streaming-assistant",
        sender: "assistant",
        content: streamingContent,
        createdAt: new Date(),
      },
    ];
  }

  return base;
}

function makeMessage(
  overrides: Partial<MessageLike> & { id: string },
): MessageLike {
  return {
    sender: "user",
    content: "hello",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("assistant stream messages — message building logic", () => {
  describe("optimistic messages (no conversation yet)", () => {
    it("should show only optimistic messages when conversationId is null", () => {
      const optimistic = [makeMessage({ id: "opt-1", content: "Hi there" })];

      const result = buildMessages({
        fetchedMessages: [],
        optimisticMessages: optimistic,
        conversationId: null,
        streamingContent: null,
      });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hi there");
    });

    it("should append streaming assistant message after optimistic user message", () => {
      const optimistic = [makeMessage({ id: "opt-1", content: "Hi there" })];

      const result = buildMessages({
        fetchedMessages: [],
        optimisticMessages: optimistic,
        conversationId: null,
        streamingContent: "Hello, I'm",
      });

      expect(result).toHaveLength(2);
      expect(result[0].sender).toBe("user");
      expect(result[1].id).toBe("streaming-assistant");
      expect(result[1].sender).toBe("assistant");
      expect(result[1].content).toBe("Hello, I'm");
    });

    it("should show empty streaming message as placeholder", () => {
      const optimistic = [makeMessage({ id: "opt-1", content: "Hi" })];

      const result = buildMessages({
        fetchedMessages: [],
        optimisticMessages: optimistic,
        conversationId: null,
        streamingContent: "",
      });

      expect(result).toHaveLength(2);
      expect(result[1].content).toBe("");
      expect(result[1].sender).toBe("assistant");
    });
  });

  describe("deduplication (conversation ID set mid-stream)", () => {
    it("should deduplicate optimistic message when fetched data contains the same content", () => {
      const fetched = [
        makeMessage({ id: "db-1", content: "Hi there", sender: "user" }),
      ];
      const optimistic = [
        makeMessage({ id: "opt-1", content: "Hi there", sender: "user" }),
      ];

      const result = buildMessages({
        fetchedMessages: fetched,
        optimisticMessages: optimistic,
        conversationId: "conv-1",
        streamingContent: "Responding...",
      });

      // 1 fetched user msg + 0 optimistic (deduped) + 1 streaming assistant
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("db-1");
      expect(result[1].id).toBe("streaming-assistant");
    });

    it("should not deduplicate when content differs", () => {
      const fetched = [
        makeMessage({ id: "db-1", content: "Hi there", sender: "user" }),
      ];
      const optimistic = [
        makeMessage({
          id: "opt-1",
          content: "Different message",
          sender: "user",
        }),
      ];

      const result = buildMessages({
        fetchedMessages: fetched,
        optimisticMessages: optimistic,
        conversationId: "conv-1",
        streamingContent: null,
      });

      // Both messages should appear
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("db-1");
      expect(result[1].id).toBe("opt-1");
    });

    it("should not deduplicate when sender differs", () => {
      const fetched = [
        makeMessage({ id: "db-1", content: "Same text", sender: "user" }),
      ];
      const optimistic = [
        makeMessage({
          id: "opt-1",
          content: "Same text",
          sender: "assistant",
        }),
      ];

      const result = buildMessages({
        fetchedMessages: fetched,
        optimisticMessages: optimistic,
        conversationId: "conv-1",
        streamingContent: null,
      });

      expect(result).toHaveLength(2);
    });
  });

  describe("existing conversation with fetched messages", () => {
    it("should merge fetched and optimistic messages in order", () => {
      const fetched = [
        makeMessage({ id: "db-1", content: "Msg 1", sender: "user" }),
        makeMessage({ id: "db-2", content: "Reply 1", sender: "assistant" }),
      ];
      const optimistic = [
        makeMessage({ id: "opt-1", content: "Msg 2", sender: "user" }),
      ];

      const result = buildMessages({
        fetchedMessages: fetched,
        optimisticMessages: optimistic,
        conversationId: "conv-1",
        streamingContent: null,
      });

      expect(result).toHaveLength(3);
      expect(result.map((m) => m.id)).toEqual(["db-1", "db-2", "opt-1"]);
    });

    it("should append streaming content after all messages", () => {
      const fetched = [
        makeMessage({ id: "db-1", content: "Msg 1", sender: "user" }),
      ];
      const optimistic = [
        makeMessage({ id: "opt-1", content: "Msg 2", sender: "user" }),
      ];

      const result = buildMessages({
        fetchedMessages: fetched,
        optimisticMessages: optimistic,
        conversationId: "conv-1",
        streamingContent: "Streaming...",
      });

      expect(result).toHaveLength(3);
      expect(result[2].id).toBe("streaming-assistant");
      expect(result[2].content).toBe("Streaming...");
    });
  });

  describe("final state (no optimistic, no streaming)", () => {
    it("should return only fetched messages when there is no optimistic or streaming state", () => {
      const fetched = [
        makeMessage({ id: "db-1", content: "User msg", sender: "user" }),
        makeMessage({
          id: "db-2",
          content: "Assistant msg",
          sender: "assistant",
        }),
      ];

      const result = buildMessages({
        fetchedMessages: fetched,
        optimisticMessages: [],
        conversationId: "conv-1",
        streamingContent: null,
      });

      expect(result).toHaveLength(2);
      expect(result).toEqual(fetched);
    });
  });
});
