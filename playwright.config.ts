import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — drives a real Chromium against an ephemeral
 * `fulcrum serve` instance. Tests own their own project root via a tmpdir
 * spawned by global-setup; this keeps E2E hermetic and never touches the
 * dogfooded `.fulcrum/` of the repo itself.
 *
 * Each E2E test inherits a fresh `fulcrum init` + a small seed of stories,
 * spun up before tests run by a per-test fixture in `e2e/fixtures.ts`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // each test owns its tmpdir + port; serial is simpler
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
