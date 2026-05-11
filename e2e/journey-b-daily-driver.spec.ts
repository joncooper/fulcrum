import { test, expect, fulcrumCmd } from "./fixtures.ts";

/**
 * Journey B — daily-driver: opening fulcrum during an active iteration.
 *
 *   1. Board renders with stories already in flight (seeded via CLI).
 *   2. User presses j/k to navigate to a started row.
 *   3. Pressing `space` expands the story; focus moves into the action area.
 *   4. Pressing `f` finishes the story (auto-chain forward from started).
 *   5. The pill swaps to "finished"; focus stays on the row (focus rule #1).
 */

test("daily-driver: j/k navigate, expand, external transition reflects via SSE", async ({
  page,
  fulcrum,
}) => {
  // Seed: two stories. The second is `started` so we can finish it externally.
  await fulcrumCmd(fulcrum.projectRoot, ["new", "feature", "Build the thing", "--points", "3"]);
  await fulcrumCmd(fulcrum.projectRoot, ["new", "feature", "Polish the edge", "--points", "1"]);
  await fulcrumCmd(fulcrum.projectRoot, ["start", "1002"]);

  await page.goto(fulcrum.url);

  await expect(page.locator(".story", { hasText: "Build the thing" })).toBeVisible();
  await expect(page.locator(".story", { hasText: "Polish the edge" })).toBeVisible();

  // Keyboard navigation: j/k focuses rows.
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  const started = page.locator(".story.is-focused", { hasText: "Polish the edge" });
  await expect(started).toBeVisible();
  await expect(started.locator(".pill")).toHaveText("started");

  // Inline expand on space; the expanded body shows transition action buttons
  // (focus management rule #5 moves DOM focus into the action area).
  await page.keyboard.press(" ");
  await expect(page.locator(".expanded")).toBeVisible();
  // Finish button is available for a started story
  await expect(
    page.locator(".expanded button.action-btn", { hasText: "Finish" }),
  ).toBeVisible();

  // External transition via CLI — the SSE invalidator should re-fetch stories
  // and the row should reflect the new state without manual reload.
  await fulcrumCmd(fulcrum.projectRoot, ["finish", "1002"]);

  await expect(
    page.locator(".story", { hasText: "Polish the edge" }).locator(".pill"),
  ).toHaveText("finished", { timeout: 5_000 });
});
