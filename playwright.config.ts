import { defineConfig, devices, type ReporterDescription } from "@playwright/test";

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

const isContinuousIntegration = Boolean(process.env["CI"]);

const reporter: ReporterDescription[] = isContinuousIntegration ? [["html"], ["list"]] : [["list"]];

/**
 * End-to-end tests drive a real browser against a real running app, so they
 * catch what unit and integration tests cannot: routing, server rendering,
 * bundling, and real network behaviour.
 *
 * They are also the slowest and most brittle level, so keep them few and
 * focused on critical user journeys rather than detail — details belong in
 * the Vitest suites.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,

  // A test that only passes on a retry is flaky, and a flaky suite gets
  // ignored. Fail the CI build if someone leaves test.only committed.
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 2 : 0,

  // Serial on CI for reproducibility; locally Playwright picks a worker count.
  ...(isContinuousIntegration ? { workers: 1 } : {}),

  reporter,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],

  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !isContinuousIntegration,
    timeout: 120_000,
  },
});
