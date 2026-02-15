import * as z from "zod/v4";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  listConversations,
  getConversationById,
  createConversation,
  deleteConversation,
  ask,
} from "./service";

export const assistantRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return listConversations({
        projectId: input.projectId,
        userId: ctx.session.user.id,
      });
    }),

  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        conversationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById({
        conversationId: input.conversationId,
        projectId: input.projectId,
        userId: ctx.session.user.id,
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return conversation;
    }),

  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createConversation({
        projectId: input.projectId,
        userId: ctx.session.user.id,
      });
    }),

  sendMessage: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        conversationId: z.string().optional(),
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ask({
        conversationId: input.conversationId,
        projectId: input.projectId,
        userId: ctx.session.user.id,
        content: input.content,
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      if ("error" in result) {
        switch (result.error) {
          case "NO_API_KEY":
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "No LLM API key configured for this project. Please add one in Project Settings.",
            });
          case "INVALID_API_KEY":
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not parse LLM API key configuration",
            });
          case "LLM_CALL_FAILED":
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: result.message ?? "Failed to get LLM response",
            });
        }
      }

      return result;
    }),

  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await deleteConversation({
        conversationId: input.conversationId,
        projectId: input.projectId,
        userId: ctx.session.user.id,
      });

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return result;
    }),
});
