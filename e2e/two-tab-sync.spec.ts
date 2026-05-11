import { test, expect, fulcrumCmd } from "./fixtures.ts";

/**
 * Two-tab sync test (M1-blocking per design doc Testing Strategy).
 *
 * Open the board in two browser contexts (simulating two tabs / two
 * machines). Edit in one; the other should see the change within ~200ms
 * via the SSE `stories-changed` event invalidating the react-query cache.
 */

test("two tabs: edit in tab 1 → tab 2 sees update within 1s", async ({ browser, fulcrum }) => {
  await fulcrumCmd(fulcrum.projectRoot, ["new", "feature", "Original title", "--points", "3"]);

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  try {
    await page1.goto(fulcrum.url);
    await page2.goto(fulcrum.url);

    // Both tabs see the same story
    await expect(page1.locator(".story", { hasText: "Original title" })).toBeVisible();
    await expect(page2.locator(".story", { hasText: "Original title" })).toBeVisible();

    // Drive a transition via CLI (external write — fires file-watcher SSE)
    await fulcrumCmd(fulcrum.projectRoot, ["start", "1001"]);

    // Both tabs should observe the state change without manual reload.
    await expect(
      page1.locator(".story", { hasText: "Original title" }).locator(".pill"),
    ).toHaveText("started", { timeout: 3_000 });
    await expect(
      page2.locator(".story", { hasText: "Original title" }).locator(".pill"),
    ).toHaveText("started", { timeout: 3_000 });
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});
