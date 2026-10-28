import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/app/(auth)/actions";

export function SiteHeader() {
  return (
    <header className="border-b border-sand bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-iroko no-underline">
          <LogoMark className="h-9 w-9" />
          <span className="leading-tight">
            <span className="block font-display text-xl font-bold">Ìrànlọ́wọ́</span>
            <span className="block text-xs text-muted">Ọjà Express support</span>
          </span>
        </Link>
        <nav aria-label="Main" className="ml-auto flex flex-wrap items-center gap-1 text-[0.95rem]">
          <Link className="btn btn-quiet min-h-11" href="/help">Help centre</Link>
          <Suspense fallback={<span className="skeleton inline-block h-6 w-28" />}>
            <UserNav />
          </Suspense>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return (
      <>
        <Link className="btn btn-quiet min-h-11" href="/support">Chat with us</Link>
        <Link className="btn btn-secondary min-h-11" href="/sign-in">Sign in</Link>
      </>
    );
  }
  return (
    <>
      {user.role === "customer" && (
        <>
          <Link className="btn btn-quiet min-h-11" href="/support">Chat</Link>
          <Link className="btn btn-quiet min-h-11" href="/support/history">My conversations</Link>
          <Link className="btn btn-quiet min-h-11" href="/orders">My orders</Link>
        </>
      )}
      {(user.role === "agent" || user.role === "admin") && (
        <Link className="btn btn-quiet min-h-11" href="/agent">Inbox</Link>
      )}
      {user.role === "admin" && (
        <Link className="btn btn-quiet min-h-11" href="/admin/analytics">Admin</Link>
      )}
      <form action={signOutAction}>
        <button className="btn btn-secondary min-h-11" type="submit">
          Sign out<span className="sr-only"> {user.displayName}</span>
        </button>
      </form>
    </>
  );
}
