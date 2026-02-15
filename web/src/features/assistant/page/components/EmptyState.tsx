import { MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/src/components/ui/button";

interface EmptyStateProps {
  onSuggestionClick?: (suggestion: string) => void;
}

const suggestions = [
  "Explain how LLM tracing works",
  "Help me debug a prompt issue",
  "Summarize best practices for prompt engineering",
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground">
        <MessageSquare size={48} strokeWidth={1.5} />
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-foreground">
        Langfuse Assistant
      </h2>
      <p className="mb-6 max-w-md leading-relaxed text-muted-foreground">
        Ask questions, get help with your LLM applications, or explore ideas.
        All conversations are traced in Langfuse.
      </p>
      <div className="mb-8 flex gap-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles size={20} />
          <span>AI-Powered Answers</span>
        </div>
      </div>
      {onSuggestionClick && (
        <div className="w-full max-w-[500px]">
          <p className="mb-3 text-sm text-muted-foreground">Try asking:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                onClick={() => onSuggestionClick(suggestion)}
                variant="outline"
                className="h-auto whitespace-normal text-left"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
