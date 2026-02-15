import { useState, useCallback } from "react";
import { useAssistantConversations } from "./useAssistantConversations";
import { useAssistantStreamMessages } from "./useAssistantStreamMessages";

export function useAssistantChat({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");

  const {
    conversations,
    currentConversationId,
    isLoadingConversations,
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
    isWaitingForResponse,
  } = useAssistantStreamMessages({
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

      await sendMessageToConversation({
        conversationId: currentConversationId,
        content: trimmedContent,
        onConversationId: (id) => {
          // Update URL as soon as we know the conversation ID (from response headers),
          // before the stream finishes, so the sidebar and URL stay in sync early
          if (!currentConversationId) {
            setCurrentConversationId(id);
          }
        },
      });
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
    isWaitingForResponse,
    isLoadingConversations,
    sendMessage,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleSuggestionClick,
  };
}
