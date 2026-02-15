import { StreamingTextResponse } from "ai";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";

import { BaseError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import { authorizeRequestOrThrow } from "@/src/features/playground/server/authorizeRequest";
import {
  prepareAssistantRequest,
  saveAssistantResponse,
} from "@/src/features/assistant/server/service";
import { streamAssistantResponse } from "@/src/features/assistant/server/llmClient";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RequestBody = z.object({
  projectId: z.string(),
  conversationId: z.string().optional(),
  content: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = RequestBody.parse(await req.json());
    const { userId } = await authorizeRequestOrThrow(body.projectId);

    const prepared = await prepareAssistantRequest({
      conversationId: body.conversationId,
      projectId: body.projectId,
      userId,
      content: body.content,
    });

    if (!prepared) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Conversation not found" },
        { status: 404 },
      );
    }

    const conversationId = prepared.conversation.id;

    const stream = await streamAssistantResponse({
      projectId: body.projectId,
      userId,
      conversationId,
      messages: prepared.chatMessages,
    });

    // Wrap the stream to capture full content and save to DB after completion.
    // Tracing is flushed automatically when the stream ends (handled inside
    // fetchLLMCompletion's TransformStream).
    let fullContent = "";
    const decoder = new TextDecoder();
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        fullContent += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      async flush() {
        // Flush remaining bytes from decoder
        fullContent += decoder.decode();
        if (fullContent) {
          await saveAssistantResponse({ conversationId, content: fullContent });
        }
      },
    });

    const wrappedStream = stream.pipeThrough(transformStream);

    return new StreamingTextResponse(wrappedStream, {
      headers: {
        "x-conversation-id": conversationId,
      },
    });
  } catch (err) {
    logger.error("Failed to handle assistant chat stream", err);

    if (err instanceof BaseError) {
      return NextResponse.json(
        { error: err.name, message: err.message },
        { status: err.httpCode },
      );
    }

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: err.message },
        { status: 400 },
      );
    }

    if (err instanceof Error) {
      return NextResponse.json(
        { error: "INTERNAL_ERROR", message: err.message },
        { status: 500 },
      );
    }

    throw err;
  }
}
