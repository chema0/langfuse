import { useCallback } from "react";
import { useQueryParam, StringParam } from "use-query-params";
import { api } from "@/src/utils/api";

export function useAssistantConversations({ projectId }: { projectId: string }) {
  const [currentConversationId, setCurrentConversationId] = useQueryParam(
    "conversationId",
    StringParam,
  );

  const utils = api.useUtils();
  const conversationsQuery = api.assistant.list.useQuery({ projectId });
  const deleteMutation = api.assistant.delete.useMutation();

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(undefined);
  }, [setCurrentConversationId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setCurrentConversationId(id);
    },
    [setCurrentConversationId],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync({
        projectId,
        conversationId: id,
      });
      if (currentConversationId === id) {
        setCurrentConversationId(undefined);
      }
      await utils.assistant.list.invalidate({ projectId });
    },
    [projectId, currentConversationId, deleteMutation, utils, setCurrentConversationId],
  );

  return {
    conversations: conversationsQuery.data ?? [],
    currentConversationId: currentConversationId ?? null,
    isConversationsLoading: conversationsQuery.isLoading,
    setCurrentConversationId,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
  };
}
