export function doThrow(msg: string): never {
  throw new Error(msg);
}

/**
 * `next build` importe les modules de toutes les routes (phase « Collecting
 * page data »). Sur le builder Vercel, ni AUTH_SECRET ni DATABASE_URL ne sont
 * disponibles : leur absence est donc tolérée au build et n'est signalée qu'au
 * runtime, sinon le build échoue avant même d'atteindre le déploiement.
 */
export function isNextBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** Secret de signature JWT : obligatoire au runtime, inerte pendant le build. */
export function resolveAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (isNextBuild()) return "atelierone-build-only-placeholder";
  doThrow("AUTH_SECRET is not set");
}
