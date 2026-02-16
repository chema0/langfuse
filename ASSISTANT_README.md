# Langfuse Assistant Feature

A ChatGPT-style "Assistant" page integrated into Langfuse, allowing users to have conversations with LLMs directly within the platform. All conversations are stored in the database and LLM calls are automatically traced by Langfuse.

## Feature Overview

- **Chat UI**: Full conversational interface with message history, conversation list sidebar, and markdown rendering
- **Conversation Management**: Create, switch between, and delete conversations
- **LLM Integration**: Uses the project's configured LLM Connections (from Project Settings) to call models
- **Automatic Tracing**: Every LLM call is traced in Langfuse using `traceSinkParams`, visible in the project's Tracing view
- **Persistence**: Conversations and messages are stored in PostgreSQL via Prisma

## Setup

### Prerequisites

- Docker infrastructure running (`pnpm run infra:dev:up`)
- At least one LLM API Connection configured in the project settings. In this case, we use the OpenAI adapter to
call the local Ollama server running with `qwen2.5:3b` as the model.

### Migrations

Prisma model and migrations:

```shell
pnpm db:migrate

# If need to reset the schema
pnpm prisma migrate reset --schema packages/shared/prisma/schema.prisma
```

ClickHouse:

```shell
cd packages/shared
pnpm run ch:up
pnpm run ch:dev-tables
```

### Accessing the Feature

1. Start the dev server: `pnpm run dev:web`
2. Navigate to any project
3. Click "Assistant" in the sidebar (under Prompt Management)
4. Start chatting!

## Architecture

[backend-dev-guidelines](.claude/skills/backend-dev-guidelines) as reference to implement the required changes.

### Database Models

Two new Prisma models in `packages/shared/prisma/schema.prisma`:

- **`Conversation`** — Represents a chat conversation, linked to a `Project` and `User`
- **`ConversationMessage`** — Individual messages within a conversation, with `sender` ("user" or "assistant")

### Backend

#### tRPC Router

Located in `web/src/features/assistant/server/assistantRouter.ts`, registered in `web/src/server/api/root.ts`.

These are tRPC procedures (accessible via /api/trpc/assistant.*), not traditional REST endpoints under /api/public/. This means they're available to the authenticated frontend UI but not as public REST API routes for external SDK/API consumption, so no docs or API spec files have been extended.

> [!NOTE]
> Fern for docs. [public api docs](.cursor/rules/public-api.mdc)

| Expected Endpoint           | tRPC Procedure     | Type | Description    |
|-----------------------------|--------------------|------|----------------|
| GET /api/conversations      | `assistant.list`     | Query | List conversations for the current user in a project |
| GET /api/conversations/:id  | `assistant.byId`     | Query | Get a conversation with all its messages |
| POST /api/conversations     | `assistant.create`   | Mutation | Create a new conversation |
| POST /api/conversations/:id/messages | `assistant.sendMessage` | Mutation | Send a user message, call LLM, store assistant reply |

There's also an `assistant.delete` mutation not in the original spec.

#### Service layer

Located in `web/src/features/assistant/server/service.ts`.

The service exposes three key functions:

- **`prepareAssistantRequest()`** — Gets or creates a conversation, saves the user message to DB, and builds the chat message history. Used by both the streaming and non-streaming paths.
- **`saveAssistantResponse()`** — Persists the assistant's reply to DB. Called after the full response is available (immediately for non-streaming, after stream completion for streaming).
- **`ask()`** — The original non-streaming flow. Calls `prepareAssistantRequest()`, then `fetchAssistantResponse()`, then `saveAssistantResponse()` sequentially. Used by the tRPC `sendMessage` mutation.

#### Streaming

The assistant uses HTTP chunked streaming so tokens appear progressively in the UI. This runs alongside the non-streaming tRPC path (`assistant.sendMessage`), which is kept as a fallback.

This is **not** Server-Sent Events (SSE). There is no `text/event-stream` content type or `data:` framing — the browser reads raw UTF-8 bytes from the response body incrementally using `ReadableStream.getReader()`.

**Key files:**

| File | Role |
|---|---|
| `web/src/app/api/assistant/chat/route.ts` | App Router streaming endpoint |
| `web/src/features/assistant/server/llmClient.ts` | `streamAssistantResponse()` — streaming LLM call |
| `web/src/features/assistant/server/service.ts` | `prepareAssistantRequest()` / `saveAssistantResponse()` — DB operations |
| `web/src/features/assistant/page/hooks/useAssistantChat.ts` | Frontend hook: `fetchStreamingResponse()` + `sendMessageWithStreaming()` |
| `web/src/features/assistant/page/hooks/useOptimisticMessages.ts` | Shared optimistic message state, deduplication, and assistant indicator |

**Pattern reuse:** This follows the same approach as the playground's streaming (`web/src/app/api/chatCompletion/route.ts` + `getChatCompletionStream` in the playground context).

### End-to-end message flow

The diagram below shows the full lifecycle of sending a message. The left column is the browser, the right column is the server. Steps marked `[new conv]` only apply when creating a new conversation.

```
 BROWSER                                          SERVER
 ───────                                          ──────

 useAssistantChat.send()
  ├─ guard: empty input / isSending
  ├─ clear text input
  ├─ isSending = true
  ├─ addOptimisticMessage(content)        (useOptimisticMessages)
  │   └─ user message renders instantly
  │
  ├─ [streaming] sendMessageWithStreaming()
  │   ├─ appendAssistantIndicator("")     (useOptimisticMessages)
  │   │   └─ empty assistant bubble renders
  │   │
  │   ├─ fetchStreamingResponse() ─────────────────► route.ts
  │   │   { projectId, conversationId?, content }     ├─ authorizeRequestOrThrow()
  │   │                                               ├─ Zod v4 body validation
  │   │                                               │
  │   │                                               ├─ prepareAssistantRequest()
  │   │                                               │   ├─ [new conv] CREATE Conversation
  │   │                                               │   ├─ [existing] verify ownership
  │   │                                               │   ├─ CREATE ConversationMessage (user)
  │   │                                               │   └─ build ChatMessage[] history
  │   │                                               │
  │   │                                               ├─ streamAssistantResponse()
  │   │                                               │   ├─ lookup LLM API key
  │   │                                               │   └─ fetchLLMCompletion(streaming: true)
  │   │                                               │       └─ auto-traced via traceSinkParams
  │   │                                               │
  │   │                                               ├─ pipe through TransformStream
  │   │                                               │   (captures full text for DB save)
  │   │                                               │
  │   │  ◄──────── StreamingTextResponse ─────────────┤
  │   │            headers: x-conversation-id          │
  │   │                                                │
  │   ├─ onToken callback ◄─── chunks ────────────────┤
  │   │   └─ appendAssistantIndicator(accumulated)     │
  │   │       └─ assistant bubble grows progressively   │
  │   │                                                 │
  │   │           stream ends ◄─────────────────────────┤
  │   │                                                 ├─ TransformStream.flush()
  │   │                                                 │   └─ saveAssistantResponse()
  │   │                                                 │       └─ CREATE ConversationMessage
  │   │                                                 │          (assistant)
  │   ├─ [new conv] onConversationId callback           │
  │   │   ├─ URL updates (?conversationId=...)          │
  │   │   └─ list.invalidate() → sidebar shows conv     │
  │   │                                                  │
  │   ├─ await invalidateCache(conversationId)           │
  │   │   └─ byId + list refetch                         │
  │   └─ clearOptimisticMessages()                       │
  │                                                      │
  ├─ [non-streaming] sendMessage()                       │
  │   ├─ appendAssistantIndicator("")                    │
  │   ├─ tRPC sendMessageMutation.mutateAsync()          │
  │   ├─ await invalidateCache(resolvedId)               │
  │   ├─ clearOptimisticMessages()                       │
  │   └─ onConversationId(resolvedId)                    │
  │                                                      │
  ├─ isSending = false                                   │
  │                                                      │
  └─ UI fully driven by tRPC query data
```

**Key design decisions in this flow:**

- **Optimistic-first rendering** — the user message and an empty assistant bubble appear instantly, before any network response.
- **Early conversation ID** — for new conversations, the URL and sidebar update as soon as response headers arrive (before streaming begins), not after the stream ends.
- **Deduplication** — when the `byId` query activates mid-stream (new conversation), the `messages` memo deduplicates optimistic messages against fetched DB data by matching on `sender` + `content`.
- **Await before clear** — optimistic and streaming state is only cleared *after* `invalidate()` calls resolve, preventing a flash where messages momentarily disappear.
- **URL-driven conversation state** — the current conversation is the `?conversationId=` query parameter (via `use-query-params`). No param = empty state, valid ID = load from DB. Conversations are bookmarkable and survive page refreshes.

### Frontend

Located in `web/src/features/assistant/`:

```
web/src/features/assistant/
├── page/
│   ├── index.tsx                  # Main page component
│   ├── components/
│   │   ├── ConversationList.tsx   # Sidebar with conversation history
│   │   ├── ConversationMessage.tsx # Message bubble with markdown rendering
│   │   ├── EmptyState.tsx         # Welcome screen with suggestions
│   │   └── MessageInput.tsx       # Text input with send button
│   └── hooks/
│       ├── useAssistantChat.ts    # Single entry-point hook (conversations, streaming + non-streaming send)
│       └── useOptimisticMessages.ts # Shared optimistic message state, deduplication, assistant indicator
├── server/
│   ├── assistantRouter.ts         # tRPC router
│   ├── llmClient.ts               # LLM client
│   └── service.ts                 # Service layer
└── utils.ts                       # Utility functions
```

Page route: `web/src/pages/project/[projectId]/assistant.tsx`
Sidebar entry: Added to `web/src/components/layouts/routes.tsx` under "Prompt Management" group

## Design Decisions

- **Streaming by default**: Uses HTTP chunked streaming via `fetchLLMCompletion({ streaming: true })` for progressive token display. The non-streaming tRPC `sendMessage` mutation is kept as a fallback.
- **First available API key**: Uses the first LLM API key found for the project. A model selection UI could be added.
- **Auto-titling**: Conversations are automatically titled from the first user message.
- **Optimistic updates**: User messages appear immediately while waiting for the LLM response.
- **Adapted from Kallyo**: Components were ported from the Kallyo chat project, adapted to use tRPC, Prisma, and Langfuse's UI patterns.

## Future Improvements

- **LLM model/provider selection dropdown** — Let users choose which model powers the assistant per conversation or as a user preference
- **Message editing and regeneration** — Re-send from a given point in the conversation history
- **Pagination** — Cursor-based pagination for the conversation list and message history to handle heavy usage
- **Context window management** — Currently, every message in the conversation is sent to the LLM on each request (`buildChatMessages` in `service.ts` converts all DB messages into `ChatMessage[]`). This gives the model full context for better responses, but the token count grows linearly with conversation length and will eventually exceed the model's context limit or become expensive. A compaction strategy is needed — e.g., summarizing older messages into a condensed system prompt, sliding-window truncation, or a hybrid approach
- **Streaming error recovery** — If `saveAssistantResponse` fails during `TransformStream.flush()`, the streamed response is lost. A retry queue or background reconciliation job would ensure persistence
- **Rate limiting** — Per-user per-project limits on LLM calls to control API costs
- **File/image upload support** — Multimodal input for models that support it

## Testing

The assistant is tested at two levels, following the same patterns used across the Langfuse codebase:

- **Backend (server tests)** — Jest with `@jest-environment node`, running against real PostgreSQL via Prisma. The LLM client is mocked so tests are fast and deterministic. File: `web/src/__tests__/async/assistant-api.servertest.ts`.
- **Frontend (client tests)** — Jest with `jest-environment-jsdom`. Component tests using React Testing Library that render real components with props and assert on what the user sees. Utility function tests for pure helpers. Files: `web/src/__tests__/assistant-ui.clienttest.tsx`, `web/src/__tests__/assistant-utils.clienttest.ts`.

This split mirrors Langfuse's convention: `*.servertest.ts` for backend tests (run with `pnpm test`), `*.clienttest.ts` / `*.clienttest.tsx` for frontend tests (run with `pnpm test-client`).

**Testing philosophy:** Simple component tests on the client (render with props, assert on DOM), comprehensive business logic tests on the server (real DB, mocked LLM). No tRPC mocking or hook harnesses on the frontend — that complexity belongs in E2E tests.

- **E2E testing with Playwright** — The current test suite covers the backend (tRPC + DB) and frontend components in isolation. What's missing is full user-flow testing that exercises the entire stack end-to-end: rendering the page, typing a message, seeing tokens stream in, verifying the sidebar updates, switching conversations, and deleting them. Playwright (already used elsewhere in Langfuse for E2E tests) would cover the integration seams that unit tests can't — the wiring between hooks, components, the streaming API route, and the real DOM.

### Running tests

```bash
cd web

# Backend tests (tRPC router + service layer, requires DB)
pnpm test -- --testPathPatterns="assistant"

# Frontend tests (component + utility tests, no DB needed)
pnpm test-client --testPathPatterns="assistant"
```

### Backend tests (14 tests)

Test the tRPC router procedures through `appRouter.createCaller()` with a real database. Each test creates isolated user/project/org fixtures via `prepare()` so tests are fully independent and can run concurrently.

| Category | Tests | What they verify |
|---|---|---|
| CRUD | create, list, byId, delete | Basic conversation lifecycle |
| Error handling | NOT_FOUND, LLM_CALL_FAILED, NO_API_KEY | tRPC error codes are correct for each failure mode |
| Tenant isolation | cross-project access, cross-user delete | Users cannot read or delete conversations they don't own |
| Message flow | sendMessage (existing conv), sendMessage (new conv) | User + assistant messages are persisted in order |
| Multi-turn | 3-turn conversation | Messages accumulate correctly across turns, ordering preserved |
| Edge cases | auto-title truncation, user message persists on LLM failure | Title generation, partial failure leaves user message intact |

The LLM client (`fetchAssistantResponse`) is mocked via `jest.mock()` — tests control whether the LLM "succeeds" or "fails" without making real API calls.

### Frontend tests (14 tests)

**`assistant-ui.clienttest.tsx`** (9 tests) — Component tests using React Testing Library. Each test renders a real component with props and asserts on what the user sees. No hooks, no tRPC mocks, no harnesses.

| Component | Tests | What they verify |
|---|---|---|
| ConversationMessage | user message, assistant message with copy button, loading placeholder | Correct sender labels, content rendering, copy affordance, loading state |
| MessageInput | Enter/Shift+Enter behavior, disabled states | Submit fires on Enter but not Shift+Enter, button disabled when empty or explicitly disabled |
| ConversationList | active highlight, select/create/delete actions, empty state | Active conversation highlighted, callbacks fire with correct IDs, delete confirmation dialog, empty message |
| EmptyState | suggestions rendering and click | Suggestion buttons render and fire callback with suggestion text |

**`assistant-utils.clienttest.ts`** (5 tests) — Tests the `generateTitle` and `formatTimestamp` utility functions. Straightforward input/output validation.
