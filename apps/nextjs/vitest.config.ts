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

const COMMUN = {
  environment: 'node' as const,
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
  // Tests d'intégration DB : le défaut (5 s) est franchi dès que plusieurs
  // fichiers tournent en parallèle sous charge (11 s mesuré en local).
  testTimeout: 20000,
  hookTimeout: 20000,
  // `*.spec.ts` = Playwright (e2e et variantes e2e-r*) : jamais par vitest.
  exclude: ['**/*.spec.ts', 'node_modules/**', ...TESTS_BASE_REELLE],
};

const ALIAS = {
  '@': path.resolve(__dirname, './src'),
  '~': path.resolve(__dirname, './src'),
};

/**
 * ISOLATION — deux projets au lieu d'un seul.
 *
 * Tous les fichiers partageaient UNE base et tournaient EN PARALLÈLE. Chaque
 * fichier y créait ses fixtures avec des identifiants en dur, et le nommage
 * a fini par se recouvrir : un clientatosis détecté par un test appartenait
 * parfois au fichier d'à côté. Symptôme caractéristique : le fichier passe
 * seul, échoue dans la suite complète, et l'erreur désigne une contrainte
 * portant sur une donnée qu'il n'a pas créée.
 *
 * Réparer cela au cas par cas (renommer des téléphones de fixture) est futile :
 * la prochaine règle métier rendrait le recouvrement à nouveau, et
 * l'échec suivant désignerait un fichier innocent. Trois fois de suite cela s'est produit
 * produis ainsi sur ce lot.
 *
 * D'où deux projets :
 *   - `unites`       : logique pure, aucune base. Parallèles, rapides.
 *   - `integration`  : base réelle. SÉRIALISÉS (`fileParallelism: false`),
 *                      donc plus aucun recouvrement possible entre fichiers.
 *
 * Coût : la suite complète s'allonge (les tests base s'exécutent l'un après
 * l'autre). Gain : plus aucun faux échec, et plus jamais de téléphone de
 * fixture à renommer à la main. La fiabilité prime — un test qui échoue par
 * hasard coûte plus cher qu'une suite un peu plus lente.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: ALIAS },
        test: {
          ...COMMUN,
          name: 'unites',
          include: ['**/*.test.ts'],
          exclude: [...COMMUN.exclude, '**/*.integration.test.ts'],
        },
      },
      {
        resolve: { alias: ALIAS },
        test: {
          ...COMMUN,
          name: 'integration',
          include: ['**/*.integration.test.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
  resolve: { alias: ALIAS },
});
