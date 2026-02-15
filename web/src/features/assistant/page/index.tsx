import { useRef, useEffect } from "react";
import type { ConversationMessage as Message } from "@prisma/client";
import { Loader2 } from "lucide-react";
import Page from "@/src/components/layouts/page";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useAssistantChat } from "./hooks/useAssistantChat";
import { ConversationMessage } from "./components/ConversationMessage";
import { MessageInput } from "./components/MessageInput";
import { ConversationList } from "./components/ConversationList";
import { EmptyState } from "./components/EmptyState";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Switch } from "@/src/components/ui/switch";

export default function AssistantPage() {
  const projectId = useProjectIdFromURL() as string;

  const {
    conversations,
    currentConversationId,
    messages,
    input,
    setInput,
    isLoadingConversations,
    isSending,
    streaming,
    setStreaming,
    sendMessage,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleSuggestionClick,
  } = useAssistantChat({ projectId });

  if (!projectId) {
    return (
      <Page
        scrollable={false}
        withPadding={false}
        headerProps={{
          title: "Assistant",
          help: {
            description: "Chat with an AI assistant, traced by Langfuse",
          },
        }}
      >
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      scrollable={false}
      withPadding={false}
      headerProps={{
        title: "Assistant",
        help: {
          description: "Chat with an AI assistant, traced by Langfuse",
        },
      }}
    >
      <div className="flex h-full overflow-hidden">
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
        />

        {isLoadingConversations ? (
          <NoDataOrLoading isLoading={true} className="h-full" />
        ) : (
          <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
            <Conversation
              messages={messages}
              handleSuggestionClick={handleSuggestionClick}
            />

            <div className="shrink-0 p-4">
              <MessageInput
                value={input}
                onChange={setInput}
                onSubmit={() => sendMessage()}
                disabled={isSending}
              />
              <div className="mx-auto mt-2 flex max-w-3xl items-center justify-end gap-2">
                <label
                  htmlFor="streaming-toggle"
                  className="text-xs text-muted-foreground"
                >
                  Streaming
                </label>
                <Switch
                  id="streaming-toggle"
                  size="sm"
                  checked={streaming}
                  onCheckedChange={setStreaming}
                  disabled={isSending}
                />
              </div>
            </div>
          </main>
        )}
      </div>
    </Page>
  );
}

function Conversation({
  messages,
  handleSuggestionClick,
}: {
  messages: Pick<Message, "id" | "sender" | "content" | "createdAt">[];
  handleSuggestionClick: (suggestion: string) => void;
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return <EmptyState onSuggestionClick={handleSuggestionClick} />;
  }

  return (
    <div
      ref={scrollAreaRef}
      className="flex-1 overflow-y-auto scroll-smooth p-6 pb-8"
    >
      <div className="mx-auto max-w-3xl">
        {messages.map((message) => (
          <ConversationMessage
            key={message.id}
            message={message}
            isLoading={
              message.id === "pending-assistant" ||
              (message.id === "streaming-assistant" && !message.content)
            }
          />
        ))}
      </div>
    </div>
  );
}
