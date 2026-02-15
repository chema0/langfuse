import { useState, useCallback, useRef } from "react";
import { useQueryParam, StringParam } from "use-query-params";
import { api } from "@/src/utils/api";
import { env } from "@/src/env.mjs";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useOptimisticMessages } from "./useOptimisticMessages";

/**
 * Streams tokens from the assistant chat endpoint, calling `onToken` as each
 * chunk arrives.  Returns the conversation ID from the response headers.
 */
async function fetchStreamingResponse({
  projectId,
  conversationId,
  content,
  signal,
  onToken,
}: {
  projectId: string;
  conversationId?: string;
  content: string;
  signal: AbortSignal;
  onToken: (accumulated: string) => void;
}): Promise<string | undefined> {
  const result = await fetch(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/assistant/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, conversationId, content }),
      signal,
    },
  );

  if (!result.ok) {
    const errorData = await result.json();
    throw new Error(errorData.message ?? "Failed to send message");
  }

  const responseConversationId =
    result.headers.get("x-conversation-id") ?? conversationId;

  const reader = result.body?.getReader();
  if (!reader) throw new Error("Failed to read response body");

  const decoder = new TextDecoder("utf-8");
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      accumulated += decoder.decode(value, { stream: true });
      onToken(accumulated);
    }
  } finally {
    reader.releaseLock();
  }

  return responseConversationId;
}

export function useAssistantChat({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [currentConversationId, setCurrentConversationId] = useQueryParam(
    "conversationId",
    StringParam,
  );

  const utils = api.useUtils();
  const conversationsQuery = api.assistant.list.useQuery({ projectId });
  const deleteMutation = api.assistant.delete.useMutation();

  const {
    messages,
    addOptimisticMessage,
    clearOptimisticMessages,
    appendAssistantIndicator,
    invalidateCache,
  } = useOptimisticMessages({
    projectId,
    conversationId: currentConversationId ?? undefined,
  });

  const sendMessageMutation = api.assistant.sendMessage.useMutation({
    onError: (err) => {
      showErrorToast("Failed to send message", err.message);
      clearOptimisticMessages();
      setIsSending(false);
    },
  });

  const sendMessageWithStreaming = useCallback(
    async ({
      conversationId,
      content,
      onConversationId,
    }: {
      conversationId?: string;
      content: string;
      onConversationId?: (id: string) => void;
    }) => {
      appendAssistantIndicator("");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const responseConversationId = await fetchStreamingResponse({
          projectId,
          conversationId,
          content,
          signal: abortController.signal,
          onToken: appendAssistantIndicator,
        });

        // For new conversations: notify caller immediately so URL/sidebar update
        if (responseConversationId && !conversationId) {
          onConversationId?.(responseConversationId);
          utils.assistant.list.invalidate({ projectId });
        }

        if (responseConversationId) {
          await invalidateCache(responseConversationId);
        }

        clearOptimisticMessages();

        return responseConversationId
          ? { conversationId: responseConversationId }
          : undefined;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        showErrorToast(
          "Failed to send message",
          err instanceof Error ? err.message : String(err),
        );
        clearOptimisticMessages();
        return undefined;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [
      projectId,
      utils,
      appendAssistantIndicator,
      clearOptimisticMessages,
      invalidateCache,
    ],
  );

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
      appendAssistantIndicator("");

      const result = await sendMessageMutation.mutateAsync({
        projectId,
        conversationId,
        content,
      });

      const resolvedId = (conversationId ?? result?.conversationId) as string;

      await invalidateCache(resolvedId);
      clearOptimisticMessages();

      onConversationId?.(resolvedId);

      return result;
    },
    [
      projectId,
      sendMessageMutation,
      appendAssistantIndicator,
      clearOptimisticMessages,
      invalidateCache,
    ],
  );

  const send = useCallback(
    async (messageContent?: string) => {
      const contentToSend = messageContent || input;
      if (!contentToSend.trim() || isSending) return;

      setInput("");
      setIsSending(true);
      const trimmedContent = contentToSend.trim();
      addOptimisticMessage(trimmedContent);

      const send = streaming ? sendMessageWithStreaming : sendMessage;

      try {
        await send({
          conversationId: currentConversationId ?? undefined,
          content: trimmedContent,
          onConversationId: (id) => {
            if (!currentConversationId) {
              setCurrentConversationId(id);
            }
          },
        });
      } finally {
        setIsSending(false);
      }
    },
    [
      input,
      isSending,
      streaming,
      currentConversationId,
      addOptimisticMessage,
      sendMessageWithStreaming,
      sendMessage,
      setCurrentConversationId,
    ],
  );

  // --- Conversation actions ---

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(undefined);
    setInput("");
  }, [setCurrentConversationId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setCurrentConversationId(id);
      clearOptimisticMessages();
    },
    [setCurrentConversationId, clearOptimisticMessages],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync({
        projectId,
        conversationId: id,
      });
      if (currentConversationId === id) {
        setCurrentConversationId(undefined);
        clearOptimisticMessages();
      }
      await utils.assistant.list.invalidate({ projectId });
    },
    [
      projectId,
      currentConversationId,
      deleteMutation,
      utils,
      setCurrentConversationId,
      clearOptimisticMessages,
    ],
  );

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  // --- isWaitingForResponse ---

  const isWaitingForResponse = isSending;

  return {
    conversations: conversationsQuery.data ?? [],
    currentConversationId: currentConversationId ?? undefined,
    messages,
    input,
    setInput,
    isSending,
    isWaitingForResponse,
    isLoadingConversations: conversationsQuery.isLoading,
    streaming,
    setStreaming,
    sendMessage: send,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleSuggestionClick,
  };
}
