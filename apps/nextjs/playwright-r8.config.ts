import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-r8",
  fullyParallel: true,
  retries: 0,
  workers: 1,
  timeout: 300_000,

  reporter: [
    ["html", { outputFolder: "playwright-report-r8" }],
    ["list"],
  ],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Africa/Douala",
    channel: "chrome",
  },

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { AUTH_RATE_LIMIT_MAX: "100" },
  },
});