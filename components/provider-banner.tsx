import { connection } from "next/server";
import { providerInfo } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/session";

// Always says which AI is answering, so nobody mistakes the mock for the
// real model (or the other way round). Demo users also see that they're in
// a sandbox.
export async function ProviderBanner() {
  await connection(); // read env + session at request time, not at build
  const info = providerInfo();
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="bg-iroko-soft px-4 py-1.5 text-center text-sm text-ink">
      {user?.isDemo && (
        <strong className="mr-2">
          Demo{user.isReadOnly ? " (read-only agent)" : ""}: data is reset daily.
        </strong>
      )}
      {info.name === "gemini" ? (
        <span>
          AI: Google Gemini <span className="tabular">({info.model})</span>, free tier
        </span>
      ) : (
        <span>AI: built-in mock assistant ({info.reason}). Answers are canned, but grounded in the help articles.</span>
      )}
    </div>
  );
}
