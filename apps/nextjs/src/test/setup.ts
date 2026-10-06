import { beforeAll } from "vitest";

/**
 * Filet de sécurité : aucun test ne doit jamais s'exécuter contre une base
 * distante (production). `vitest.config.ts` impose déjà une base locale de
 * test ; ce contrôle bloque tout contournement (rechargement d'env, worker
 * isolé, changement de configuration).
 *
 * Audit CI/CD 2026-10-05 : l'ancien `??=` laissait DATABASE_URL=Neon et les
 * tests d'intégration tournaient contre la production.
 */
beforeAll(() => {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("DATABASE_URL absente : impossible de déterminer la base de test.");
  }
  if (!/@(localhost|127\.0\.0\.1):/.test(url)) {
    const host = (() => {
      try { return new URL(url).host; } catch { return "(URL illisible)"; }
    })();
    throw new Error(
      `REFUS : la base « ${host} » est distante. Les tests ne s'exécutent que ` +
        `sur une base locale de test (localhost). Aucun accès à la production n'est autorisé.`,
    );
  }
});
