import { ConversationMessage, prisma } from "@langfuse/shared/src/db";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "@langfuse/shared/src/server";
import { fetchAssistantResponse } from "./llmClient";
import { generateTitle } from "@/src/features/assistant/utils";

export async function listConversations({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  return prisma.conversation.findMany({
    where: { projectId, userId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      title: true,
      startedAt: true,
    },
  });
}

export async function getConversationById({
  conversationId,
  projectId,
  userId,
}: {
  conversationId: string;
  projectId: string;
  userId: string;
}) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, projectId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function createConversation({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  return prisma.conversation.create({
    data: {
      projectId,
      userId,
    },
  });
}

export async function deleteConversation({
  conversationId,
  projectId,
  userId,
}: {
  conversationId: string;
  projectId: string;
  userId: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, projectId, userId },
  });

  if (!conversation) {
    return null;
  }

  await prisma.conversation.delete({
    where: { id: conversationId },
  });

  return { success: true };
}

export async function prepareAssistantRequest({
  conversationId,
  projectId,
  userId,
  content,
}: {
  conversationId?: string;
  projectId: string;
  userId: string;
  content: string;
}) {
  const conversation = await getOrCreateConversation(
    projectId,
    userId,
    generateTitle(content),
    conversationId,
  );

  if (!conversation) {
    return null;
  }

  const userMessage = await prisma.conversationMessage.create({
    data: { conversationId: conversation.id, sender: "user", content },
  });

  const chatMessages = buildChatMessages(conversation.messages).concat({
    role: ChatMessageRole.User,
    content,
    type: ChatMessageType.User,
  });

  return { conversation, userMessage, chatMessages };
}

export async function saveAssistantResponse({
  conversationId,
  content,
}: {
  conversationId: string;
  content: string;
}) {
  return prisma.conversationMessage.create({
    data: {
      conversationId,
      sender: ChatMessageRole.Assistant,
      content,
    },
  });
}

export async function ask({
  conversationId,
  projectId,
  userId,
  content,
}: {
  conversationId?: string;
  projectId: string;
  userId: string;
  content: string;
}) {
  const prepared = await prepareAssistantRequest({
    conversationId,
    projectId,
    userId,
    content,
  });

  if (!prepared) {
    return null;
  }

  const llmResult = await fetchAssistantResponse({
    projectId,
    userId,
    conversationId: prepared.conversation.id,
    messages: prepared.chatMessages,
  });

  if (!llmResult.success) {
    return {
      error: llmResult.error,
      message: llmResult.message,
    };
  }

  const assistantMessage = await saveAssistantResponse({
    conversationId: prepared.conversation.id,
    content: llmResult.content,
  });

  return {
    conversationId: prepared.conversation.id,
    userMessage: prepared.userMessage,
    assistantMessage,
  };
}

async function getOrCreateConversation(
  projectId: string,
  userId: string,
  title: string,
  conversationId?: string,
) {
  if (conversationId) {
    // Verify conversation belongs to user + project
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, projectId, userId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    return conversation;
  }

  return await prisma.conversation.create({
    data: { projectId, userId, title },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
}

function buildChatMessages(messages: ConversationMessage[]): ChatMessage[] {
  return messages.map(
    (m): ChatMessage =>
      m.sender === ChatMessageRole.User
        ? {
            role: ChatMessageRole.User,
            content: m.content,
            type: ChatMessageType.User,
          }
        : {
            role: ChatMessageRole.Assistant,
            content: m.content,
            type: ChatMessageType.AssistantText,
          },
  );
}
