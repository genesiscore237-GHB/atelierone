import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-r4",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 420_000,
  expect: { timeout: 30_000 },

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-r4-report", open: "never" }],
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
      name: "paie-ui",
      testMatch: /r4-(paie|b-mensuel-forfait)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    env: { AUTH_RATE_LIMIT_MAX: "100" },
  },
});