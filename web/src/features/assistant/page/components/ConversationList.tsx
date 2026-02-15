import { Plus, PanelLeftClose, PanelLeft, Trash2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
interface ConversationListProps {
  conversations: { id: string; title: string | null; startedAt: Date }[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function ConversationList({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isCollapsed,
  onToggleCollapse,
}: ConversationListProps) {
  return (
    <>
      {!isCollapsed && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onToggleCollapse}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r bg-card transition-[width] duration-300 ease-in-out",
          // Desktop: inline sidebar
          "hidden md:flex",
          isCollapsed ? "md:w-[60px]" : "md:w-[280px]",
          // Mobile: overlay sidebar when open
          !isCollapsed &&
            "fixed inset-y-0 left-0 z-30 !flex w-[280px] shadow-xl md:relative md:shadow-none",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b p-4">
          <Button
            onClick={onToggleCollapse}
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isCollapsed ? "mx-auto" : "")}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeft size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
          </Button>
        </div>

        {!isCollapsed && (
          <>
            <div className="p-4 pb-0">
              <Button
                onClick={onNewConversation}
                className="mb-4 w-full justify-start gap-2"
              >
                <Plus size={18} />
                <span>New Conversation</span>
              </Button>
            </div>

            <nav
              className="flex-1 overflow-y-auto px-2 pb-4"
              aria-label="Conversation history"
            >
              {conversations.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No conversations yet
                </p>
              ) : (
                <div className="mb-4">
                  <h3 className="px-2 py-2 text-sm font-semibold text-muted-foreground">
                    Your conversations
                  </h3>
                  <ul className="m-0 list-none p-0">
                    {conversations.map((conversation) => (
                      <ConversationItem
                        key={conversation.id}
                        title={conversation.title || "New conversation"}
                        selected={currentConversationId === conversation.id}
                        onSelect={() => onSelectConversation(conversation.id)}
                        onDelete={() => onDeleteConversation(conversation.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </nav>
          </>
        )}

        {isCollapsed && (
          <div className="mt-4 flex flex-col items-center">
            <Button
              onClick={onNewConversation}
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-md"
              aria-label="New Conversation"
            >
              <Plus size={20} />
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}

type ConversationItemProps = {
  title: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

function ConversationItem({
  title,
  selected,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  return (
    <li className={cn("group relative")}>
      <Button
        onClick={onSelect}
        variant="ghost"
        className={cn(
          "h-auto w-full justify-start px-3 py-2.5 font-normal group-hover:pr-6",
          selected && "bg-muted",
        )}
        aria-current={`${selected}`}
      >
        <span className="truncate">{title}</span>
      </Button>
      {onDelete && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-muted-foreground hover:text-destructive group-hover:inline-flex"
          aria-label="Delete conversation"
        >
          <Trash2 size={14} />
        </Button>
      )}
    </li>
  );
}
