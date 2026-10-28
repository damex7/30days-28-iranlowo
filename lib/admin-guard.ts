import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, type Actor } from "@/lib/auth/session";

/** For admin pages: signed out -> sign in; not an admin -> 404 (the page "doesn't exist" for them). */
export async function adminOr404(path: string): Promise<Actor> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  if (user.role !== "admin") notFound();
  return user;
}
