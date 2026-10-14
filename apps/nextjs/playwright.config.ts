import { defineConfig } from "@playwright/test";

/**
 * Config e2e racine (`pnpm -F @atelierone/nextjs test:e2e`).
 *
 * Réparée en Lot 4 : l'ancienne version référençait un `globalSetup`
 * (`e2e/global-setup.ts`) et des `storageState` (`e2e/.auth/*.json`) inexistants
 * — le run échouait au démarrage. Les specs de `e2e/` gèrent leur login en
 * interne (fonction `login(page, email)`), comme les configs de round
 * (`playwright-r*.config.ts`) : aucun storageState partagé nécessaire.
 *
 * Port : `E2E_PORT` (défaut 3000). Le serveur existant est toujours réutilisé
 * (`reuseExistingServer`) — jamais de redémarrage du serveur prod (D5).
 * Pour tester du code non déployé : `E2E_PORT=3001 npx playwright test …`
 * démarre un `next dev` éphémère sur 3001 sans toucher à la prod :3000.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 420_000,

  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Africa/Douala",
    channel: "chrome",
    acceptDownloads: true,
  },

  webServer: {
    // `next dev` en direct (pas `npm run dev`, hardcodé --port 3000) : permet
    // E2E_PORT pour un serveur éphémère à côté de la prod (D5).
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 240_000,
    env: { AUTH_RATE_LIMIT_MAX: "100" },
  },
});
