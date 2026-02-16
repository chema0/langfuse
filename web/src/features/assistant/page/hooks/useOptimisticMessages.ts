import { useState, useMemo, useCallback } from "react";
import { api } from "@/src/utils/api";
import type { ConversationMessage } from "@prisma/client";

export type OptimisticMessage = Pick<
  ConversationMessage,
  "id" | "sender" | "content" | "createdAt"
>;

/**
 * Pure function that merges fetched messages, optimistic messages, and an
 * optional streaming indicator into a single list for rendering.
 */
export function buildMessages({
  fetchedMessages,
  optimisticMessages,
  conversationId,
  assistantIndicator,
}: {
  fetchedMessages: OptimisticMessage[];
  optimisticMessages: OptimisticMessage[];
  conversationId?: string;
  assistantIndicator: string | null;
}): OptimisticMessage[] {
  // Deduplicate optimistic messages whose content already appears in fetched
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

  if (assistantIndicator !== null) {
    return [
      ...base,
      {
        id:
          assistantIndicator.length === 0
            ? "pending-assistant"
            : "streaming-assistant",
        sender: "assistant",
        content: assistantIndicator,
        createdAt: new Date(),
      },
    ];
  }

  return base;
}

export function useOptimisticMessages({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId?: string;
}) {
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [assistantIndicator, setAssistantIndicator] = useState<string | null>(
    null,
  );

  const utils = api.useUtils();

  const conversationQuery = api.assistant.getConversationById.useQuery(
    { projectId, conversationId: conversationId ?? "" },
    { enabled: !!conversationId },
  );

  const messages = useMemo(
    () =>
      buildMessages({
        fetchedMessages: conversationQuery.data?.messages ?? [],
        optimisticMessages,
        conversationId,
        assistantIndicator,
      }),
    [
      conversationQuery.data,
      conversationId,
      optimisticMessages,
      assistantIndicator,
    ],
  );

  const addOptimisticMessage = useCallback((content: string) => {
    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: `optimistic-user-${Date.now()}`,
        sender: "user",
        content,
        createdAt: new Date(),
      },
    ]);
  }, []);

  const clearOptimisticMessages = useCallback(() => {
    setOptimisticMessages([]);
    setAssistantIndicator(null);
  }, []);

  const appendAssistantIndicator = useCallback((content: string | null) => {
    setAssistantIndicator(content);
  }, []);

  const invalidateCache = useCallback(
    async (resolvedConversationId: string) => {
      await Promise.all([
        utils.assistant.getConversationById.invalidate({
          projectId,
          conversationId: resolvedConversationId,
        }),
        utils.assistant.listConversations.invalidate({ projectId }),
      ]);
    },
    [projectId, utils],
  );

  return {
    messages,
    addOptimisticMessage,
    clearOptimisticMessages,
    appendAssistantIndicator,
    invalidateCache,
    conversationQuery,
  };
}
