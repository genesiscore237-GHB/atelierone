import { defineConfig } from 'vitest/config';
import path from 'path';

// ─── Base de test : IMPOSÉE, jamais héritée de l'environnement ───
// Audit CI/CD 2026-10-05 : l'ancien `??=` ne remplaçait jamais une valeur déjà
// définie → depuis la bascule sur Neon, les tests d'intégration s'exécutaient
// contre la base de PRODUCTION (53 échecs, écritures possibles).
// On force donc une base locale de test, surchargeable via DATABASE_URL_TEST.
const DB_DE_TEST =
  process.env.DATABASE_URL_TEST ?? 'postgres://postgres:postgres@localhost:5432/atelierone_erp_test';

if (!/@(localhost|127\.0\.0\.1):/.test(DB_DE_TEST)) {
  throw new Error(
    `DATABASE_URL_TEST doit pointer vers une base locale de test. Reçu : ${DB_DE_TEST}`,
  );
}
process.env.DATABASE_URL = DB_DE_TEST;

/**
 * Suites « base REELLE » : par conception elles ne créent aucune donnée et
 * lisent des identifiants figés (employé 9, périodes d'août 2026, journal
 * alimenté par RPT-01). Elles exigent donc une base de production peuplée et
 * ne peuvent pas passer sur la base de test vierge.
 *
 * Elles sont exécutées par `pnpm test:reel` (voir vitest.reel.config.ts),
 * contre la base locale réelle. La CI ne les exécute pas.
 */
export const TESTS_BASE_REELLE = [
  'src/server/api/routers/rh-history.integration.test.ts',
  'src/server/api/routers/rh-situation.integration.test.ts',
  'src/server/api/routers/rh-situation.terrain.test.ts',
  'src/server/api/routers/rpt02-verite-temporelle.integration.test.ts',
  'src/server/api/routers/rpt03-sensibilisation.integration.test.ts',
  'src/server/api/routers/rpt04-journal.integration.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Tests d'intégration DB : le défaut (5 s) est franchi dès que plusieurs
    // fichiers tournent en parallèle sous charge (11 s mesuré en local).
    testTimeout: 20000,
    hookTimeout: 20000,
    // `*.spec.ts` = Playwright (e2e et variantes e2e-r*) : jamais par vitest.
    exclude: ['**/*.spec.ts', 'node_modules/**', ...TESTS_BASE_REELLE],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './src'),
    },
  },
});
