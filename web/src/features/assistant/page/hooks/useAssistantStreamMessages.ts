import { useState, useMemo, useCallback, useRef } from "react";
import { api } from "@/src/utils/api";
import { env } from "@/src/env.mjs";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import type { ConversationMessage } from "@prisma/client";

type OptimisticMessage = Pick<
  ConversationMessage,
  "id" | "sender" | "content" | "createdAt"
>;

export function useAssistantStreamMessages({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId?: string;
}) {
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const utils = api.useUtils();

  const conversationQuery = api.assistant.byId.useQuery(
    { projectId, conversationId: conversationId ?? "" },
    { enabled: !!conversationId },
  );

  const messages = useMemo(() => {
    const fetchedMessages = conversationQuery.data?.messages ?? [];

    // When the byId query has fetched data, skip optimistic messages whose
    // content already appears in the fetched list to avoid duplicates
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
  }, [
    conversationQuery.data,
    conversationId,
    optimisticMessages,
    streamingContent,
  ]);

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
    setStreamingContent(null);
  }, []);

  const sendMessage = useCallback(
    async ({
      conversationId: convId,
      content,
      onConversationId,
    }: {
      conversationId?: string;
      content: string;
      onConversationId?: (id: string) => void;
    }): Promise<{ conversationId: string } | undefined> => {
      setIsSending(true);
      setStreamingContent("");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const result = await fetch(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/assistant/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              conversationId: convId,
              content,
            }),
            signal: abortController.signal,
          },
        );

        if (!result.ok) {
          const errorData = await result.json();
          throw new Error(errorData.message ?? "Failed to send message");
        }

        const responseConversationId =
          result.headers.get("x-conversation-id") ?? convId;

        // For new conversations: notify caller of the ID immediately (before
        // streaming) so the URL and sidebar update without waiting for the
        // full response.
        if (responseConversationId && !convId) {
          onConversationId?.(responseConversationId);
          utils.assistant.list.invalidate({ projectId });
        }

        const reader = result.body?.getReader();
        if (!reader) {
          throw new Error("Failed to read response body");
        }

        const decoder = new TextDecoder("utf-8");
        let accumulated = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const token = decoder.decode(value, { stream: true });
            accumulated += token;
            setStreamingContent(accumulated);
          }
        } finally {
          reader.releaseLock();
        }

        // Stream complete — wait for refetch before clearing optimistic state
        // to avoid a flash where messages disappear then reappear
        await Promise.all([
          responseConversationId
            ? utils.assistant.byId.invalidate({
                projectId,
                conversationId: responseConversationId,
              })
            : Promise.resolve(),
          utils.assistant.list.invalidate({ projectId }),
        ]);

        setStreamingContent(null);
        setOptimisticMessages([]);

        return responseConversationId
          ? { conversationId: responseConversationId }
          : undefined;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        showErrorToast(
          "Failed to send message",
          err instanceof Error ? err.message : String(err),
        );
        setOptimisticMessages([]);
        setStreamingContent(null);
        return undefined;
      } finally {
        setIsSending(false);
        abortControllerRef.current = null;
      }
    },
    [projectId, utils],
  );

  // True only while waiting for the first token (not once content is streaming)
  const isWaitingForResponse =
    isSending && streamingContent !== null && streamingContent.length === 0;

  return {
    messages,
    sendMessage,
    addOptimisticMessage,
    clearOptimisticMessages,
    isSending,
    isWaitingForResponse,
  };
}
