import { useState, useRef, useEffect } from "react";
import type { ConversationMessage } from "@prisma/client";
import { Loader2, PanelLeft } from "lucide-react";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useAssistantChat } from "./hooks/useAssistantChat";
import { ConversationMessage } from "./components/ConversationMessage";
import { MessageInput } from "./components/MessageInput";
import { ConversationList } from "./components/ConversationList";
import { EmptyState } from "./components/EmptyState";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
export default function AssistantPage() {
  const projectId = useProjectIdFromURL() as string;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const {
    conversations,
    currentConversationId,
    messages,
    input,
    setInput,
    isConversationsLoading,
    isSending,
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
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
          <div className="flex h-10 shrink-0 items-center border-b px-4 md:hidden">
            <Button
              onClick={() => setSidebarCollapsed(false)}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Open conversation list"
            >
              <PanelLeft size={20} />
            </Button>
          </div>

          <Conversation
            messages={messages}
            isConversationsLoading={isConversationsLoading}
            isSending={isSending}
            handleSuggestionClick={handleSuggestionClick}
          />

          <div className="shrink-0 bg-background p-4">
            <div className="mx-auto">
              <MessageInput
                value={input}
                onChange={setInput}
                onSubmit={() => sendMessage()}
                disabled={isSending}
              />
            </div>
          </div>
        </main>
      </div>
    </Page>
  );
}

function Conversation({
  messages,
  isConversationsLoading,
  isSending,
  handleSuggestionClick,
}: {
  messages: Pick<ConversationMessage, "id" | "sender" | "content" | "createdAt">[];
  isConversationsLoading: boolean;
  isSending: boolean;
  handleSuggestionClick: (suggestion: string) => void;
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [messages]);

  if (isConversationsLoading) {
    return <NoDataOrLoading isLoading={true} />
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center">
        <EmptyState onSuggestionClick={handleSuggestionClick} />
      </div>
    )
  }

  return (
    <div
      ref={scrollAreaRef}
      className="flex-1 overflow-y-auto scroll-smooth p-6"
    >
      <div className="mx-auto max-w-3xl">
        {messages.map((message) => (
          <ConversationMessage key={message.id} message={message} />
        ))}
        {isSending && (
          <div className="mb-4 flex items-start gap-4 rounded-lg border bg-background p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Thinking...
            </span>
          </div>
        )}
        <div className="h-4" />
      </div>
    </div>
  )
}