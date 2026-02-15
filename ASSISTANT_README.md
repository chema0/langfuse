# Langfuse Assistant Feature

A ChatGPT-style "Assistant" page integrated into Langfuse, allowing users to have conversations with LLMs directly within the platform. All conversations are stored in the database and LLM calls are automatically traced by Langfuse.

## Feature Overview

- **Chat UI**: Full conversational interface with message history, conversation list sidebar, and markdown rendering
- **Conversation Management**: Create, switch between, and delete conversations
- **LLM Integration**: Uses the project's configured LLM API keys (from Project Settings) to call models
- **Automatic Tracing**: Every LLM call is traced in Langfuse using `traceSinkParams`, visible in the project's Tracing view
- **Persistence**: Conversations and messages are stored in PostgreSQL via Prisma

## Architecture

### Database Models

Two new Prisma models in `packages/shared/prisma/schema.prisma`:

- **`Conversation`** — Represents a chat conversation, linked to a `Project` and `User`
- **`ConversationMessage`** — Individual messages within a conversation, with `sender` ("user" or "assistant")

### Backend (tRPC Router)

Located in `web/src/features/assistant/server/assistantRouter.ts`, registered in `web/src/server/api/root.ts`.

Procedures:
| Procedure | Type | Description |
|-----------|------|-------------|
| `list` | Query | List conversations for the current user in a project |
| `byId` | Query | Get a conversation with all its messages |
| `create` | Mutation | Create a new conversation |
| `sendMessage` | Mutation | Send a user message, call LLM, store assistant reply |
| `delete` | Mutation | Delete a conversation |

### Frontend

Located in `web/src/features/assistant/`:

```
web/src/features/assistant/
├── page/
│   ├── index.tsx                  # Main page component
│   ├── components/
│   │   ├── ChatMessage.tsx        # Message bubble with markdown rendering
│   │   ├── MessageInput.tsx       # Text input with send button
│   │   ├── ConversationList.tsx   # Sidebar with conversation history
│   │   └── EmptyState.tsx         # Welcome screen with suggestions
│   └── hooks/
│       └── useAssistantChat.ts    # Chat state management via tRPC
├── server/
│   └── assistantRouter.ts         # tRPC router
└── types.ts                       # TypeScript types
```

Page route: `web/src/pages/project/[projectId]/assistant.tsx`
Sidebar entry: Added to `web/src/components/layouts/routes.tsx` under "Prompt Management" group

## Setup

### Prerequisites

- Docker infrastructure running (`pnpm run infra:dev:up`)
- At least one LLM API key configured in the project settings

### Database Migration

```bash
cd packages/shared
npx dotenv -e ../../.env -- npx prisma migrate dev --name add_conversation_models
```

Or if using the project's npm scripts:
```bash
cd packages/shared && pnpm run db:migrate
```

### Accessing the Feature

1. Start the dev server: `pnpm run dev:web`
2. Navigate to any project
3. Click "Assistant" in the sidebar (under Prompt Management)
4. Start chatting!

## How It Works

1. User opens the Assistant page and types a message
2. Frontend creates a conversation (if new) via `assistant.create`
3. Message is sent via `assistant.sendMessage`:
   - User message is stored in the database
   - Conversation history is built as `ChatMessage[]`
   - `fetchLLMCompletion` is called with the project's LLM API key
   - `traceSinkParams` ensures the call is traced in Langfuse
   - Assistant response is stored in the database
4. Frontend updates via React Query cache invalidation

## Design Decisions

- **Non-streaming**: Uses `fetchLLMCompletion` with `streaming: false` for simplicity. Streaming can be added later.
- **First available API key**: Uses the first LLM API key found for the project. A model selection UI could be added.
- **Auto-titling**: Conversations are automatically titled from the first user message.
- **Optimistic updates**: User messages appear immediately while waiting for the LLM response.
- **Adapted from Kallyo**: Components were ported from the Kallyo chat project, adapted to use tRPC, Prisma, and Langfuse's UI patterns.

## Future Improvements

- Streaming responses for real-time output
- Model/provider selection dropdown
- System prompt customization per conversation
- Message editing and regeneration
- Export conversations
- Token usage display
- File/image upload support

## Testing

```bash
cd web
pnpm test -- --testPathPatterns="assistant"
```

## Files Modified/Created

### New files:
- `web/src/features/assistant/page/index.tsx`
- `web/src/features/assistant/page/components/ChatMessage.tsx`
- `web/src/features/assistant/page/components/MessageInput.tsx`
- `web/src/features/assistant/page/components/ConversationList.tsx`
- `web/src/features/assistant/page/components/EmptyState.tsx`
- `web/src/features/assistant/page/hooks/useAssistantChat.ts`
- `web/src/features/assistant/server/assistantRouter.ts`
- `web/src/features/assistant/types.ts`
- `web/src/pages/project/[projectId]/assistant.tsx`
- `web/src/__tests__/async/assistant-api.servertest.ts`
- `ASSISTANT_README.md`
- `packages/shared/prisma/migrations/[timestamp]_add_conversation_models/migration.sql`

### Modified files:
- `packages/shared/prisma/schema.prisma` — Added `Conversation` and `ConversationMessage` models
- `web/src/server/api/root.ts` — Registered `assistantRouter`
- `web/src/components/layouts/routes.tsx` — Added sidebar entry with `MessageCircle` icon
