import { defineConfig, devices } from "@playwright/test";

// Suite dédiée « Situation RH & Paie » — spec dans ./e2e/situation-rh-paie-periode.spec.ts
// (modèle e2e-r6/playwright-r6.config.ts ; le playwright.config.ts par défaut est obsolète).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 480_000,
  expect: { timeout: 30_000 },

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-situation-rh-report", open: "never" }],
  ],

  globalSetup: "./e2e-r4/r4-global-setup.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on",
    screenshot: "on",
    video: "on",
    locale: "fr-FR",
    timezoneId: "Africa/Douala",
  },

  projects: [
    {
      name: "situation-rh-ui",
      testMatch: /situation-rh-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],

  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    env: { AUTH_RATE_LIMIT_MAX: "100" },
  },
});