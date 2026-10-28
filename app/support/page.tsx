import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getCustomerChat } from "@/lib/services/conversations";
import { NotFoundError } from "@/lib/services/errors";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "Chat with us" };

const search = z.object({ c: z.uuid().optional().catch(undefined) });

export default function SupportPage({ searchParams }: PageProps<"/support">) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-3xl">Chat with us</h1>
        <nav aria-label="Chat" className="flex gap-2 text-sm">
          <Link href="/support/history">My conversations</Link>
          <Link href="/support">New chat</Link>
        </nav>
      </div>
      <Suspense fallback={<ChatSkeleton />}>
        <ChatLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading chat" className="space-y-3">
      <div className="skeleton h-16 w-2/3" />
      <div className="skeleton ml-auto h-12 w-1/2" />
      <div className="skeleton h-24 w-3/4" />
      <div className="skeleton h-24" />
    </div>
  );
}

async function ChatLoader({ searchParams }: { searchParams: PageProps<"/support">["searchParams"] }) {
  const { c } = search.parse(await searchParams);
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(c ? `/support?c=${c}` : "/support")}`);
  if (user.role !== "customer") {
    return (
      <div className="card p-5">
        <p>The chat is for customers. You&rsquo;re signed in as {user.role === "admin" ? "an admin" : "an agent"}.</p>
        <p className="mt-3"><Link className="btn btn-primary" href="/agent">Go to the inbox</Link></p>
      </div>
    );
  }
  if (!c) {
    // A fresh id per new chat, generated on the server; the first message
    // creates the conversation row with it (idempotently).
    return <Chat key="new" conversationId={randomUUID()} initialMessages={[]} initialStatus="ai" agentName={null} csatRating={null} isNew />;
  }
  const chat = await getCustomerChat(user, c).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { conversation, messages } = chat;
  return (
      <Chat
        key={conversation.id}
        conversationId={conversation.id}
        initialMessages={messages}
        initialStatus={conversation.status}
        agentName={conversation.assigned_agent_name}
        csatRating={conversation.csat_rating}
        isNew={false}
      />
  );
}
