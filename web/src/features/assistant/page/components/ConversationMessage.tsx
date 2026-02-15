import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, User, Bot } from "lucide-react";
import type { ConversationMessage as Message } from "@prisma/client";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { formatTimestamp } from "@/src/features/assistant/utils";

interface ConversationMessageProps {
  message: Pick<Message, "id" | "sender" | "content" | "createdAt">;
  isLoading?: boolean;
}

export function ConversationMessage({
  message,
  isLoading,
}: ConversationMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.sender === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-4 rounded-lg p-4",
        isUser ? "ml-12 bg-secondary/50" : "mr-12 border bg-background",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        {isUser ? (
          <User size={18} aria-hidden="true" />
        ) : (
          <Bot size={18} aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {isUser ? "You" : "Assistant"}
          </span>
          <time
            dateTime={message.createdAt.toISOString()}
            className="text-xs text-muted-foreground/60"
            title={message.createdAt.toLocaleString()}
          >
            {formatTimestamp(message.createdAt)}
          </time>
        </div>
        <div
          className={cn(
            "prose prose-sm max-w-none break-words leading-normal dark:prose-invert",
            isLoading && "animate-pulse",
          )}
        >
          {message.content ? (
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          ) : (
            <span className="text-muted-foreground">...</span>
          )}
        </div>
        {!isUser && message.content && !isLoading && (
          <div className="mt-2 flex gap-2">
            <Button
              onClick={handleCopy}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              variant="ghost"
              size="icon"
              aria-label={copied ? "Copied to clipboard" : "Copy message"}
              title={copied ? "Copied!" : "Copy"}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
