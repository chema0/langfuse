/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { fetchAssistantResponse } from "../../features/assistant/server/llmClient";

// Mock the LLM client
jest.mock("../../features/assistant/server/llmClient", () => ({
  fetchAssistantResponse: jest.fn(),
}));

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const user = await createTestUser();

  const session = createSession(user, org, project);

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  return { project, org, session, ctx, caller };
}

async function createTestUser() {
  return prisma.user.create({
    data: {
      id: uuidv4(),
      email: `test-user-${uuidv4().substring(0, 8)}@test.com`,
      name: `Test User ${uuidv4().substring(0, 8)}`,
    },
  });
}

function createSession(
  user: { id: string; email: string | null; name: string | null },
  org: { id: string; name: string },
  project: { id: string; name: string },
): Session {
  return {
    expires: "1",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canCreateOrganizations: true,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          projects: [
            {
              id: project.id,
              role: "OWNER",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              hasTraces: false,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
      },
      admin: false, // Not admin to test actual limits
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };
}

describe("Assistant tRPC router", () => {
  it("should create a conversation with no title", async () => {
    const { project, caller } = await prepare();

    const conversation = await caller.assistant.create({
      projectId: project.id,
    });

    expect(conversation).toHaveProperty("id");
    expect(conversation.title).toBeNull();
    expect(conversation.projectId).toBe(project.id);
  });

  it("should list conversations for current user only", async () => {
    const { project, caller } = await prepare();

    await caller.assistant.create({
      projectId: project.id,
    });
    await caller.assistant.create({
      projectId: project.id,
    });

    const list = await caller.assistant.list({
      projectId: project.id,
    });

    expect(list.length).toBe(2);
  });

  it("should get conversation by id with messages", async () => {
    const { project, caller } = await prepare();

    const conversation = await caller.assistant.create({
      projectId: project.id,
    });

    // Add a message directly via prisma for testing
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        sender: "user",
        content: "Hello!",
      },
    });

    const result = await caller.assistant.byId({
      projectId: project.id,
      conversationId: conversation.id,
    });

    expect(result.id).toBe(conversation.id);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].content).toBe("Hello!");
    expect(result.messages[0].sender).toBe("user");
  });

  it("should return NOT_FOUND for nonexistent conversation", async () => {
    const { project, caller } = await prepare();

    await expect(
      caller.assistant.byId({
        projectId: project.id,
        conversationId: "nonexistent-id",
      }),
    ).rejects.toThrow("Conversation not found");
  });

  it("should delete a conversation", async () => {
    const { project, caller } = await prepare();

    const conversation = await caller.assistant.create({
      projectId: project.id,
    });

    const result = await caller.assistant.delete({
      projectId: project.id,
      conversationId: conversation.id,
    });

    expect(result.success).toBe(true);

    // Verify it's deleted
    await expect(
      caller.assistant.byId({
        projectId: project.id,
        conversationId: conversation.id,
      }),
    ).rejects.toThrow("Conversation not found");
  });

  it("should not access conversations from another project", async () => {
    const { project: project1, caller: caller1 } = await prepare();
    const { caller: caller2 } = await prepare();

    const conversation = await caller1.assistant.create({
      projectId: project1.id,
    });

    // caller2 uses a different project, so this should fail
    await expect(
      caller2.assistant.byId({
        projectId: project1.id,
        conversationId: conversation.id,
      }),
    ).rejects.toThrow();
  });

  it("should send message to an existing conversation", async () => {
    const { project, caller } = await prepare();

    const conversation = await caller.assistant.create({
      projectId: project.id,
    });

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: true,
      content: "Hello from assistant",
    });

    const result = await caller.assistant.sendMessage({
      projectId: project.id,
      conversationId: conversation.id,
      content: "Hello assistant",
    });

    expect(result.conversationId).toBe(conversation.id);
    expect(result.userMessage.content).toBe("Hello assistant");
    expect(result.assistantMessage.content).toBe("Hello from assistant");
    expect(result.assistantMessage.sender).toBe("assistant");

    // Verify conversation stored the messages
    const updatedConversation = await caller.assistant.byId({
      projectId: project.id,
      conversationId: conversation.id,
    });

    expect(updatedConversation.messages.length).toBe(2);
    expect(updatedConversation.messages[0].content).toBe("Hello assistant");
    expect(updatedConversation.messages[1].content).toBe(
      "Hello from assistant",
    );
  });

  it("should create a conversation when sendMessage is called without conversationId", async () => {
    const { project, caller } = await prepare();

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: true,
      content: "Hello from assistant",
    });

    const result = await caller.assistant.sendMessage({
      projectId: project.id,
      content: "Hello assistant",
    });

    // Should return the new conversation id
    expect(result.conversationId).toBeDefined();
    expect(result.userMessage.content).toBe("Hello assistant");
    expect(result.assistantMessage.content).toBe("Hello from assistant");

    // Verify the conversation was created with auto-title
    const conversation = await caller.assistant.byId({
      projectId: project.id,
      conversationId: result.conversationId,
    });

    expect(conversation.title).toBe("Hello assistant");
    expect(conversation.messages.length).toBe(2);
  });

  it("should auto-title from a long first message by truncating to 50 chars", async () => {
    const { project, caller } = await prepare();

    const longMessage =
      "This is a very long message that exceeds fifty characters and should be truncated";

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: true,
      content: "OK",
    });

    const result = await caller.assistant.sendMessage({
      projectId: project.id,
      content: longMessage,
    });

    const conversation = await caller.assistant.byId({
      projectId: project.id,
      conversationId: result.conversationId,
    });

    expect(conversation.title).toBe(longMessage.substring(0, 50) + "...");
  });

  it("should throw when LLM call fails", async () => {
    const { project, caller } = await prepare();

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: false,
      error: "LLM_CALL_FAILED",
      message: "Rate limit exceeded",
    });

    await expect(
      caller.assistant.sendMessage({
        projectId: project.id,
        content: "Hello assistant",
      }),
    ).rejects.toThrow();
  });

  it("should throw BAD_REQUEST when no API key is configured", async () => {
    const { project, caller } = await prepare();

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: false,
      error: "NO_API_KEY",
    });

    await expect(
      caller.assistant.sendMessage({
        projectId: project.id,
        content: "Hello assistant",
      }),
    ).rejects.toThrow("No LLM API key configured");
  });

  it("should accumulate messages across multiple turns", async () => {
    const { project, caller } = await prepare();

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: true,
      content: "Reply 1",
    });

    const turn1 = await caller.assistant.sendMessage({
      projectId: project.id,
      content: "Message 1",
    });

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: true,
      content: "Reply 2",
    });

    await caller.assistant.sendMessage({
      projectId: project.id,
      conversationId: turn1.conversationId,
      content: "Message 2",
    });

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: true,
      content: "Reply 3",
    });

    await caller.assistant.sendMessage({
      projectId: project.id,
      conversationId: turn1.conversationId,
      content: "Message 3",
    });

    const conversation = await caller.assistant.byId({
      projectId: project.id,
      conversationId: turn1.conversationId,
    });

    expect(conversation.messages).toHaveLength(6);
    expect(conversation.messages.map((m) => m.content)).toEqual([
      "Message 1",
      "Reply 1",
      "Message 2",
      "Reply 2",
      "Message 3",
      "Reply 3",
    ]);
    expect(conversation.messages.map((m) => m.sender)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("should still persist user message when LLM call fails", async () => {
    const { project, caller } = await prepare();

    const conversation = await caller.assistant.create({
      projectId: project.id,
    });

    (fetchAssistantResponse as jest.Mock).mockResolvedValue({
      success: false,
      error: "LLM_CALL_FAILED",
      message: "Service unavailable",
    });

    await expect(
      caller.assistant.sendMessage({
        projectId: project.id,
        conversationId: conversation.id,
        content: "This should be saved",
      }),
    ).rejects.toThrow();

    // The user message should still be persisted even though the LLM failed
    const updated = await caller.assistant.byId({
      projectId: project.id,
      conversationId: conversation.id,
    });

    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].content).toBe("This should be saved");
    expect(updated.messages[0].sender).toBe("user");
  });

  it("should not delete a conversation belonging to another user", async () => {
    const { project: project1, caller: caller1 } = await prepare();
    const { caller: caller2 } = await prepare();

    const conversation = await caller1.assistant.create({
      projectId: project1.id,
    });

    await expect(
      caller2.assistant.delete({
        projectId: project1.id,
        conversationId: conversation.id,
      }),
    ).rejects.toThrow();

    // Verify conversation still exists
    const result = await caller1.assistant.byId({
      projectId: project1.id,
      conversationId: conversation.id,
    });
    expect(result.id).toBe(conversation.id);
  });
});
