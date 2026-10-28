import { NextResponse, type NextRequest } from "next/server";

// Next 16 calls this file proxy.ts (it was middleware.ts). It runs before
// every matched request and does two small things:
//  1. sliding cookie expiry: on page GETs it re-sets the session cookie with
//     a fresh Max-Age (pages themselves can't set cookies). The database
//     row's expiry slides in getCurrentUser(), so both stay in step;
//  2. it sends signed-out visitors away from staff and customer areas early.
//     This is a convenience only: every service re-checks the session and
//     role itself, because a proxy can be bypassed by a matcher mistake.
const COOKIE = "iranlowo_session";
const MAX_AGE = 30 * 86400;
const PROTECTED = /^\/(support(\/|$)|orders(\/|$)|agent(\/|$)|admin(\/|$))/;

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  const { pathname, search } = request.nextUrl;

  if (!token && PROTECTED.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (token && request.method === "GET") {
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
  }
  return response;
}

export const config = {
  // Skip static files, images and API routes (route handlers check the session themselves).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|svg|ico|txt)$).*)"],
};
