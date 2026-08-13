import { auth } from "@atelierone/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const isLoginPage = nextUrl.pathname === "/login";

  if (nextUrl.pathname.startsWith("/_next") || nextUrl.pathname.startsWith("/api/auth") || nextUrl.pathname.startsWith("/favicon") || nextUrl.pathname.startsWith("/public") || nextUrl.pathname.startsWith("/auth")) {
    const response = NextResponse.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return response;
  }

  if (!isLoggedIn && !isLoginPage) {
    return Response.redirect(new URL("/login", nextUrl));
  }

  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL("/dashboard", nextUrl));
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
