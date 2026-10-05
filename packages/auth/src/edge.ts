import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { resolveAuthSecret } from "./utils";

/**
 * Entry edge-safe pour le middleware : AUCUNE dépendance serveur (node:crypto,
 * bcrypt, db) — uniquement le décodage JWT avec le même secret.
 */
export const { auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: resolveAuthSecret(),
});