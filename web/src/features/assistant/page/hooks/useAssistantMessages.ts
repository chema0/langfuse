import { useState, useMemo, useCallback } from "react";
import { api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import type { ConversationMessage } from "@prisma/client";

type OptimisticMessage = Pick<ConversationMessage, "id" | "sender" | "content" | "createdAt">;

export function useAssistantMessages({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId: string | null;
}) {
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);

  const utils = api.useUtils();

  const conversationQuery = api.assistant.byId.useQuery(
    { projectId, conversationId: conversationId ?? "" },
    { enabled: !!conversationId },
  );

  const sendMessageMutation = api.assistant.sendMessage.useMutation({
    onError: (err) => {
      showErrorToast(
        "Failed to send message",
        err.message,
      );
      setOptimisticMessages([]);
    },
    onSettled: async (data, _error, variables) => {
      const convId =
        variables.conversationId ??
        (data && "conversationId" in data ? data.conversationId : undefined);
      await Promise.all([
        convId
          ? utils.assistant.byId.invalidate({
              projectId,
              conversationId: convId,
            })
          : Promise.resolve(),
        utils.assistant.list.invalidate({ projectId }),
      ]);
      setOptimisticMessages([]);
    },
  });

  const messages = useMemo(() => {
    const fetchedMessages = conversationQuery.data?.messages ?? [];

    return conversationId
      ? [...fetchedMessages, ...optimisticMessages]
      : optimisticMessages;
  }, [conversationQuery.data, conversationId, optimisticMessages]);

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
  }, []);

  const sendMessage = useCallback(
    async ({ conversationId: convId, content }: { conversationId?: string; content: string }) => {
      return sendMessageMutation.mutateAsync({
        projectId,
        conversationId: convId,
        content,
      });
    },
    [projectId, sendMessageMutation],
  );

  return {
    messages,
    sendMessage,
    addOptimisticMessage,
    clearOptimisticMessages,
    isSending: sendMessageMutation.isPending,
  };
}
