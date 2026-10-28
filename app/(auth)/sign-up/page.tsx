import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <section className="card mx-auto max-w-md p-5 sm:p-6" aria-labelledby="signup-title">
      <h1 id="signup-title" className="mb-2 text-3xl">Create an account</h1>
      <p className="mb-5 text-muted">An account lets the assistant look up your own orders, and nobody else&rsquo;s.</p>
      <SignUpForm />
      <p className="mt-5 text-sm">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </section>
  );
}
