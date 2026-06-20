import { NextRequest, NextResponse } from "next/server";

import { SESSION_TOKEN_COOKIE } from "@/lib/workspace/workspace-context";

const AUTH_FREE_API_PATHS = [
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/health/cloud"
];

function isStaticPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt")
  );
}

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_TOKEN_COOKIE)?.value ?? "";
  const hasSessionToken = sessionToken.trim().length > 0;

  if (pathname === "/login") {
    if (!hasSessionToken) {
      return NextResponse.next();
    }

    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = "/";
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  if (AUTH_FREE_API_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionToken) {
    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: "authentication required" },
        { status: 401 }
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"]
};
