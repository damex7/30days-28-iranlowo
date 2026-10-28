"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form";
import { demoAgentAction, demoCustomerAction } from "@/app/demo/actions";

/** POST-only, rate-limited buttons: no passwords, nothing to guess. */
export function DemoButtons() {
  const [customer, customerAction] = useActionState(demoCustomerAction, { message: "" });
  const [agent, agentAction] = useActionState(demoAgentAction, { message: "" });
  const message = customer.message || agent.message;
  return (
    <div className="space-y-3">
      <form action={customerAction}>
        <SubmitButton pendingText="Setting up your demo…" className="btn btn-primary w-full">Try as a customer</SubmitButton>
        <p className="mt-1 text-sm text-muted">Your own demo account with three orders (one is running late).</p>
      </form>
      <form action={agentAction}>
        <SubmitButton pendingText="Opening the inbox…" className="btn btn-secondary w-full">Look around as an agent</SubmitButton>
        <p className="mt-1 text-sm text-muted">A shared, read-only agent view. Customer details are masked.</p>
      </form>
      {message && <p role="alert" className="rounded-lg border-2 border-danger bg-danger-soft p-3">{message}</p>}
    </div>
  );
}
