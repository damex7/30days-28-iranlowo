"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { assignToMe, draftReply, resolveConversation, sendAgentReply } from "@/lib/services/agents";
import { ConflictError, ForbiddenError, NotFoundError, RuleError } from "@/lib/services/errors";
import { agentReplySchema, versionedIdSchema } from "@/lib/validation/agent";

type Result = { ok: boolean; message: string; text?: string };

function friendly(error: unknown): Result {
  if (error instanceof RuleError || error instanceof ConflictError || error instanceof ForbiddenError) return { ok: false, message: error.message };
  if (error instanceof NotFoundError) return { ok: false, message: "This conversation isn't available to you." };
  console.error("[agent action]", error instanceof Error ? error.message : error);
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function draftAction(conversationId: string): Promise<Result> {
  if (!z.uuid().safeParse(conversationId).success) return { ok: false, message: "Not found." };
  try {
    const { text, fromModel } = await draftReply(await getCurrentUser(), conversationId);
    return { ok: true, text, message: fromModel ? "Draft ready. Read it, edit it, then send." : "The AI is unavailable, so here's a simple starting point." };
  } catch (error) {
    return friendly(error);
  }
}

export async function sendReplyAction(input: { conversationId: string; clientMessageId: string; content: string }): Promise<Result> {
  const parsed = agentReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid reply." };
  try {
    await sendAgentReply(await getCurrentUser(), parsed.data.conversationId, { content: parsed.data.content, clientMessageId: parsed.data.clientMessageId });
    revalidatePath(`/agent/conversations/${parsed.data.conversationId}`);
    return { ok: true, message: "Reply sent." };
  } catch (error) {
    return friendly(error);
  }
}

export async function assignAction(input: { conversationId: string; version: number }): Promise<Result> {
  const parsed = versionedIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    await assignToMe(await getCurrentUser(), parsed.data.conversationId, parsed.data.version);
    revalidatePath(`/agent/conversations/${parsed.data.conversationId}`);
    return { ok: true, message: "Assigned to you." };
  } catch (error) {
    return friendly(error);
  }
}

export async function resolveAction(input: { conversationId: string; version: number }): Promise<Result> {
  const parsed = versionedIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    await resolveConversation(await getCurrentUser(), parsed.data.conversationId, parsed.data.version);
    revalidatePath(`/agent/conversations/${parsed.data.conversationId}`);
    return { ok: true, message: "Resolved. The customer will be asked to rate it." };
  } catch (error) {
    return friendly(error);
  }
}
