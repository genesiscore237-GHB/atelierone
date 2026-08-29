import { auth } from "@atelierone/auth/edge";
import { NextResponse } from "next/server";

// ─── Rate limiting global (IP) : protection brute-force / abuse API ───
const limiteurs = new Map<string, { count: number; resetAt: number }>();
const REGLES: { prefix: string; max: number; windowMs: number }[] = [
  { prefix: "/api/auth/callback", max: 10, windowMs: 60_000 },
  { prefix: "/api/auth/csrf", max: 60, windowMs: 60_000 },
  { prefix: "/api/sync/register", max: 10, windowMs: 60_000 },
  { prefix: "/api/uploads", max: 15, windowMs: 60_000 },
  { prefix: "/api/trpc", max: 300, windowMs: 60_000 },
];

function limite(ip: string, path: string): boolean {
  const regle = REGLES.find((r) => path.startsWith(r.prefix));
  if (!regle) return true;
  const cle = `${regle.prefix}:${ip}`;
  const now = Date.now();
  const e = limiteurs.get(cle);
  if (!e || now > e.resetAt) {
    limiteurs.set(cle, { count: 1, resetAt: now + regle.windowMs });
    return true;
  }
  if (e.count >= regle.max) return false;
  e.count++;
  return true;
}

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const isLoginPage = nextUrl.pathname === "/login";

  // Rate limiting par IP (requêtes sensibles)
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "local").split(",")[0]?.trim() ?? "local";
  if (nextUrl.pathname.startsWith("/api/") && !limite(ip, nextUrl.pathname)) {
    return NextResponse.json({ error: "Trop de requêtes — veuillez patienter." }, { status: 429 });
  }

  if (nextUrl.pathname.startsWith("/_next") || nextUrl.pathname.startsWith("/api/auth") || nextUrl.pathname.startsWith("/api/sync") || nextUrl.pathname.startsWith("/api/uploads") || nextUrl.pathname.startsWith("/favicon") || nextUrl.pathname.startsWith("/public") || nextUrl.pathname.startsWith("/auth") || nextUrl.pathname === "/") {
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
