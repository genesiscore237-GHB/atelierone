import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-rpt02",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 420_000,

  reporter: [
    ["html", { outputFolder: "playwright-report-rpt02" }],
    ["list"],
  ],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Africa/Douala",
    channel: "chrome",
    acceptDownloads: true,
  },

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    env: { AUTH_RATE_LIMIT_MAX: "100" },
  },
});
