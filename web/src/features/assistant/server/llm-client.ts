import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  LLMApiKeySchema,
  fetchLLMCompletion,
  logger,
  traceException,
  type ChatMessage,
} from "@langfuse/shared/src/server";

export type AssistantResponse =
  | { success: true; content: string }
  | { success: false; error: "NOT_FOUND" | "NO_API_KEY" | "INVALID_API_KEY" | "LLM_CALL_FAILED"; message?: string };

export async function fetchAssistantResponse({
  projectId,
  userId,
  conversationId,
  messages,
}: {
  projectId: string;
  userId: string;
  conversationId: string;
  messages: ChatMessage[];
}): Promise<AssistantResponse> {
  const llmApiKey = await prisma.llmApiKeys.findFirst({
    where: { projectId },
  });

  if (!llmApiKey) {
    return { success: false, error: "NO_API_KEY" };
  }

  const parsedKey = LLMApiKeySchema.safeParse(llmApiKey);
  if (!parsedKey.success) {
    logger.error("Could not parse LLM API key", {
      provider: llmApiKey.provider,
      projectId,
    });
    return { success: false, error: "INVALID_API_KEY" };
  }

  const model =
    parsedKey.data.customModels.length > 0
      ? parsedKey.data.customModels[0]
      : "gpt-4o-mini";

  try {
    const content = await fetchLLMCompletion({
      llmConnection: parsedKey.data,
      messages,
      modelParams: {
        provider: llmApiKey.provider,
        model,
        adapter: parsedKey.data.adapter,
      },
      streaming: false,
      traceSinkParams: {
        targetProjectId: projectId,
        traceId: randomUUID(),
        traceName: "assistant-chat",
        environment: "langfuse-assistant",
        userId,
        sessionId: conversationId,
      },
    });

    return { success: true, content };
  } catch (error) {
    logger.error("Assistant LLM call failed", {
      error: error instanceof Error ? error.message : String(error),
      projectId,
    });
    traceException(error);
    return {
      success: false,
      error: "LLM_CALL_FAILED",
      message: error instanceof Error ? error.message : "Failed to get LLM response",
    };
  }
}
