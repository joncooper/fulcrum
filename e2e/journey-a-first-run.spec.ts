import { test, expect } from "./fixtures.ts";

/**
 * Journey A — first-run.
 *
 *   1. User clones project, runs `fulcrum init`.
 *   2. Opens the board, sees the empty-state pattern.
 *   3. Presses `c` to create a story; types title.
 *   4. Story appears at top of Current.
 *
 * Per design doc, the emotional arc is orientation → friction → relief.
 * Mechanically: empty-state renders, `c` opens form in Current, story
 * appears with auto-focus on the form's title input.
 */

test("first-run: empty state → c → story appears in Current", async ({ page, fulcrum }) => {
  await page.goto(fulcrum.url);

  // Empty state visible
  await expect(page.getByRole("heading", { name: "An empty board, by design." })).toBeVisible();
  await expect(page.getByText("fulcrum lives in")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New story" })).toBeVisible();

  // Press `c` to open the new-story form
  await page.keyboard.press("c");

  // Form is visible inside Current column
  const form = page.locator(".new-form");
  await expect(form).toBeVisible();
  // Form's title input is auto-focused (focus management rule #4)
  await expect(form.locator("input.edit-title")).toBeFocused();

  // Type a title and submit
  await page.keyboard.type("Land conflict UX");
  await page.keyboard.press("Tab"); // out of title input
  await form.locator("button", { hasText: "create" }).click();

  // Story appears on the board with the typed title
  await expect(page.locator(".story .title", { hasText: "Land conflict UX" })).toBeVisible();
  // Story sits in Current (not Backlog)
  const current = page.locator(".col-current");
  await expect(current.locator(".story", { hasText: "Land conflict UX" })).toBeVisible();
});
