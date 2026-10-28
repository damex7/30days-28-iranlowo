"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { promoteToAgent, runCronNow, setAgentActive } from "@/lib/services/staff";
import { NotFoundError, RuleError } from "@/lib/services/errors";
import { emailSchema } from "@/lib/validation/auth";
import type { FormState } from "@/lib/validation/form";

export async function promoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = emailSchema.safeParse(values.email);
  if (!parsed.success) return { ok: false, errors: { email: parsed.error.issues[0]?.message ?? "Enter an email." }, values };
  try {
    await promoteToAgent(await getCurrentUser(), parsed.data);
  } catch (error) {
    if (error instanceof RuleError || error instanceof NotFoundError) return { ok: false, errors: { email: error.message }, values };
    throw error;
  }
  revalidatePath("/admin/agents");
  return { ok: true, message: `${parsed.data} is now an agent.` };
}

export async function setActiveAction(formData: FormData) {
  const parsed = z.object({ userId: z.uuid(), active: z.enum(["true", "false"]) }).safeParse({ userId: formData.get("userId"), active: formData.get("active") });
  if (!parsed.success) return;
  await setAgentActive(await getCurrentUser(), parsed.data.userId, parsed.data.active === "true");
  revalidatePath("/admin/agents");
}

export async function runCronAction() {
  await runCronNow(await getCurrentUser());
  revalidatePath("/admin/agents");
}
