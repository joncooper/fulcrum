import { test, expect, fulcrumCmd } from "./fixtures.ts";

/**
 * Journey C — iteration close ritual (PT's signature moment).
 *
 *   1. Open close panel via `i`.
 *   2. See delivered stories ready for accept.
 *   3. Bulk-accept with `a`, commit with enter.
 *   4. 400ms ritual transition (the ONE named motion exception per DESIGN.md).
 *   5. Accepted stories disappear from active board (iteration:N stamped).
 *   6. Project velocity advances.
 */

test("close ritual: deliver → accept → commit → stories disappear → iteration bumps", async ({
  page,
  fulcrum,
}) => {
  // Seed: one feature delivered, ready to accept.
  await fulcrumCmd(fulcrum.projectRoot, ["new", "feature", "Ship the ritual", "--points", "5"]);
  await fulcrumCmd(fulcrum.projectRoot, ["deliver", "1001"]);

  await page.goto(fulcrum.url);

  // Capture the starting iteration so we can verify it bumps
  const startingProject = await fetch(`${fulcrum.url}/api/project`).then((r) => r.json());
  const startingIter = startingProject.project.current_iteration;

  // The delivered story is visible
  const delivered = page.locator(".story", { hasText: "Ship the ritual" });
  await expect(delivered).toBeVisible();
  await expect(delivered.locator(".pill")).toHaveText("delivered");

  // Press `i` to open the close panel
  await page.keyboard.press("i");
  const panel = page.locator(".iter-close-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Close Iteration/)).toBeVisible();

  // The delivered story is in the "ready to accept" list, pre-checked
  await expect(panel.locator(".iter-close-row", { hasText: "Ship the ritual" })).toBeVisible();
  await expect(
    panel.locator(".iter-close-row.is-accepted", { hasText: "Ship the ritual" }),
  ).toBeVisible();

  // Commit with enter
  await page.keyboard.press("Enter");

  // After close: the project should have advanced one iteration.
  await expect
    .poll(
      async () => {
        const j = await fetch(`${fulcrum.url}/api/project`).then((r) => r.json());
        return j.project.current_iteration;
      },
      { timeout: 5_000 },
    )
    .toBe(startingIter + 1);

  // After the 400ms transition, the previously-delivered story is gone from
  // the active board (it has iteration:N stamped → moved to done bucket).
  await expect(page.locator(".story", { hasText: "Ship the ritual" })).not.toBeVisible({
    timeout: 3_000,
  });
});
