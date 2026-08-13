import type { NextAuthConfig } from "next-auth";
import type { ExtendedUser } from "./types";

export const authConfig = {
  // Déploiements derrière un proxy / load balancer (Vercel, nginx…) :
  // NextAuth v5 exige trustHost pour dériver l'URL depuis les headers,
  // sinon le callback renvoie /api/auth/error?error=Configuration.
  trustHost: true,
  session: {
    strategy: "jwt" as const,
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }: { token: any; user?: any }) {
      if (user) {
        const extended = user as unknown as ExtendedUser;
        token.user = extended;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (token.user) {
        session.user = token.user;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
