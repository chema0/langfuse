import { useState, useCallback } from "react";
import { useAssistantConversations } from "./useAssistantConversations";
import { useAssistantStreamMessages } from "./useAssistantStreamMessages";
import { useAssistantMessages } from "./useAssistantMessages";

export function useAssistantChat({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(true);

  const {
    conversations,
    currentConversationId,
    isLoadingConversations,
    setCurrentConversationId,
    handleNewConversation: onNewConversation,
    handleSelectConversation: onSelectConversation,
    handleDeleteConversation: onDeleteConversation,
  } = useAssistantConversations({ projectId });

  const streamHook = useAssistantStreamMessages({
    projectId,
    conversationId: currentConversationId,
  });

  const nonStreamHook = useAssistantMessages({
    projectId,
    conversationId: currentConversationId,
  });

  const activeHook = streaming ? streamHook : nonStreamHook;

  const {
    messages,
    sendMessage: sendMessageToConversation,
    addOptimisticMessage,
    clearOptimisticMessages,
    isSending,
    isWaitingForResponse,
  } = activeHook;

  const handleNewConversation = useCallback(() => {
    onNewConversation();
    setInput("");
  }, [onNewConversation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      onSelectConversation(id);
      streamHook.clearOptimisticMessages();
      clearOptimisticMessages();
    },
    [onSelectConversation, streamHook, clearOptimisticMessages],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await onDeleteConversation(id);
      if (currentConversationId === id) {
        streamHook.clearOptimisticMessages();
        clearOptimisticMessages();
      }
    },
    [
      onDeleteConversation,
      currentConversationId,
      streamHook,
      clearOptimisticMessages,
    ],
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
    streaming,
    setStreaming,
    sendMessage,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleSuggestionClick,
  };
}
