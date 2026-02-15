import { useState, useCallback } from "react";
import { useAssistantConversations } from "./useAssistantConversations";
import { useAssistantMessages } from "./useAssistantMessages";

export function useAssistantChat({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");

  const {
    conversations,
    currentConversationId,
    isConversationsLoading,
    setCurrentConversationId,
    handleNewConversation: onNewConversation,
    handleSelectConversation: onSelectConversation,
    handleDeleteConversation: onDeleteConversation,
  } = useAssistantConversations({ projectId });

  const {
    messages,
    sendMessage: sendMessageToConversation,
    addOptimisticMessage,
    clearOptimisticMessages,
    isSending,
  } = useAssistantMessages({
    projectId,
    conversationId: currentConversationId,
  });

  const handleNewConversation = useCallback(() => {
    onNewConversation();
    setInput("");
  }, [onNewConversation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      onSelectConversation(id);
      clearOptimisticMessages();
    },
    [onSelectConversation, clearOptimisticMessages],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await onDeleteConversation(id);
      if (currentConversationId === id) {
        clearOptimisticMessages();
      }
    },
    [onDeleteConversation, currentConversationId, clearOptimisticMessages],
  );

  const sendMessage = useCallback(
    async (messageContent?: string) => {
      const contentToSend = messageContent || input;
      if (!contentToSend.trim() || isSending) return;

      setInput("");
      const trimmedContent = contentToSend.trim();
      addOptimisticMessage(trimmedContent);

      const result = await sendMessageToConversation({
        conversationId: currentConversationId ?? undefined,
        content: trimmedContent,
      });

      // If a new conversation was created, update the URL
      if (result && "conversationId" in result && !currentConversationId) {
        setCurrentConversationId(result.conversationId);
      }
    },
    [
      input,
      isSending,
      currentConversationId,
      sendMessageToConversation,
      addOptimisticMessage,
      setCurrentConversationId,
    ],
  );

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  return {
    conversations,
    currentConversationId,
    messages,
    input,
    setInput,
    isSending,
    isConversationsLoading,
    sendMessage,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleSuggestionClick,
  };
}
