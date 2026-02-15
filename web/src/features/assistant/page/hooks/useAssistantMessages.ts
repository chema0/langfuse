import { useState, useMemo, useCallback } from "react";
import { api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { ConversationMessage } from "@prisma/client";

type OptimisticMessage = Pick<
  ConversationMessage,
  "id" | "sender" | "content" | "createdAt"
>;

export function useAssistantMessages({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId?: string;
}) {
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [isPending, setIsPending] = useState(false);

  const utils = api.useUtils();

  const conversationQuery = api.assistant.byId.useQuery(
    { projectId, conversationId: conversationId ?? "" },
    { enabled: !!conversationId },
  );

  const sendMessageMutation = api.assistant.sendMessage.useMutation({
    onError: (err) => {
      showErrorToast("Failed to send message", err.message);
      setOptimisticMessages([]);
      setIsPending(false);
    },
  });

  const messages = useMemo(() => {
    const fetchedMessages = conversationQuery.data?.messages ?? [];

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

    // Show a loading placeholder while waiting for the assistant response
    if (isPending) {
      return [
        ...base,
        {
          id: "pending-assistant",
          sender: "assistant",
          content: "",
          createdAt: new Date(),
        },
      ];
    }

    return base;
  }, [conversationQuery.data, conversationId, optimisticMessages, isPending]);

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
    setIsPending(false);
  }, []);

  const sendMessage = useCallback(
    async ({
      conversationId,
      content,
      onConversationId,
    }: {
      conversationId?: string;
      content: string;
      onConversationId?: (id: string) => void;
    }) => {
      setIsPending(true);

      const result = await sendMessageMutation.mutateAsync({
        projectId,
        conversationId,
        content,
      });

      const resolvedId = (conversationId ?? result?.conversationId) as string;

      // Wait for refetch to populate the cache BEFORE notifying the parent
      // about the new conversation ID.  If we call onConversationId first,
      // the parent updates the conversationId prop which enables the byId
      // query — but the cache is empty, causing a flash of no messages.
      await Promise.all([
        utils.assistant.byId.invalidate({
          projectId,
          conversationId: resolvedId,
        }),
        utils.assistant.list.invalidate({ projectId }),
      ]);

      setOptimisticMessages([]);
      setIsPending(false);

      // Now the cache is populated, safe to switch conversation
      onConversationId?.(resolvedId);

      return result;
    },
    [projectId, sendMessageMutation, utils],
  );

  return {
    messages,
    sendMessage,
    addOptimisticMessage,
    clearOptimisticMessages,
    isSending: isPending,
    isWaitingForResponse: isPending,
  };
}
