import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { SignInForm } from "./sign-in-form";
import { DemoButtons } from "@/components/demo-buttons";

export const metadata: Metadata = { title: "Sign in" };

const search = z.object({
  next: z.string().max(200).catch(""),
  notice: z.enum(["created", "signed-out"]).optional().catch(undefined),
  email: z.string().max(254).catch(""),
});

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
      <section className="card p-5 sm:p-6" aria-labelledby="signin-title">
        <h1 id="signin-title" className="mb-4 text-3xl">Sign in</h1>
        <Suspense fallback={<div className="skeleton h-48" />}>
          <SignInBody searchParams={searchParams} />
        </Suspense>
        <p className="mt-5 text-sm">
          New here? <Link href="/sign-up">Create an account</Link>
        </p>
      </section>
      <section className="card p-5 sm:p-6" aria-labelledby="demo-title">
        <h2 id="demo-title" className="mb-2 text-2xl">Just looking?</h2>
        <p className="mb-4 text-muted">No password needed. Demo data is deleted after a day.</p>
        <DemoButtons />
      </section>
    </div>
  );
}

async function SignInBody({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = search.parse(await searchParams);
  return (
    <>
      {params.notice === "created" && (
        <p role="status" className="mb-4 rounded-lg bg-iroko-soft p-3">
          Your account is ready. Sign in with the email and password you chose.
        </p>
      )}
      <SignInForm next={params.next} email={params.email} />
    </>
  );
}
