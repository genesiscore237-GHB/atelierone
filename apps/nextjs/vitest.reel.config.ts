import { defineConfig } from 'vitest/config';
import path from 'path';
import { existsSync, readFileSync } from 'node:fs';
import base, { TESTS_BASE_REELLE } from './vitest.config';

/**
 * Suites « base REELLE » — voir TESTS_BASE_REELLE dans vitest.config.ts.
 *
 * Usage : pnpm test:reel
 *
 * Sécurités :
 *  1. seules les suites « base réelle » sont exécutées ;
 *  2. la base cible est LOCALE uniquement (setup.ts refuse tout hôte distant) ;
 *  3. l'URL réelle est prise dans l'ordre : DATABASE_URL_REEL, puis la ligne
 *     localhost de packages/db/.env. On ne retombe jamais sur une URL Neon
 *     active, au risque d'écrire en production.
 */
function urlReelle(): string {
  const explicit = process.env.DATABASE_URL_REEL;
  if (explicit) {
    if (!/@(localhost|127\.0\.0\.1):/.test(explicit)) {
      throw new Error(`DATABASE_URL_REEL doit être une base locale. Reçu : ${explicit}`);
    }
    return explicit;
  }
  const envFile = path.resolve(__dirname, '../../packages/db/.env');
  if (existsSync(envFile)) {
    const lignes = readFileSync(envFile, 'utf8').split(/\r?\n/);
    const ligne = lignes.find(
      (l) => /^#?\s*DATABASE_URL="/.test(l) && l.includes('@localhost:'),
    );
    const url = ligne?.match(/DATABASE_URL="([^"]+)"/)?.[1];
    if (url) return url;
  }
  throw new Error(
    'Aucune base réelle locale trouvée. Lancez `pnpm db:use-local`, ' +
      'ou définissez DATABASE_URL_REEL (localhost uniquement).',
  );
}

process.env.DATABASE_URL = urlReelle();

export default defineConfig({
  ...base,
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: TESTS_BASE_REELLE,
    exclude: ['**/*.spec.ts', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './src'),
    },
  },
});
