"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { startDemoAgent, startDemoCustomer } from "@/lib/services/demo";
import { RateLimitedError } from "@/lib/services/errors";

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function demoCustomerAction(previous: { message: string }): Promise<{ message: string }> {
  void previous; // useActionState passes the last result; a fresh attempt ignores it
  try {
    await startDemoCustomer(await getCurrentUser(), await ip());
  } catch (error) {
    if (error instanceof RateLimitedError) return { message: error.message };
    throw error;
  }
  redirect("/support");
}

export async function demoAgentAction(previous: { message: string }): Promise<{ message: string }> {
  void previous; // useActionState passes the last result; a fresh attempt ignores it
  try {
    await startDemoAgent(await getCurrentUser(), await ip());
  } catch (error) {
    if (error instanceof RateLimitedError) return { message: error.message };
    throw error;
  }
  redirect("/agent");
}
