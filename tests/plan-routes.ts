import type { Page } from "@playwright/test"

/**
 * Answers the current-week lookup with "this household has no plan yet".
 *
 * These suites run against `vite preview`, which serves the built files and no serverless
 * functions, so every /api route 404s unless the test fulfils it. Until now nothing mocked this
 * one: a failed read still left the generate button on screen, so the tests walked through an
 * error path without noticing. They no longer can — a read that fails now offers a retry rather
 * than a button persistence would refuse — and stating the answer is closer to the truth anyway,
 * since a household that has just onboarded really does have no plan.
 *
 * The body is the shape the real route sends, `{ plan: null }` rather than a bare `null`, so
 * this mock cannot drift into testing a response the server never produces.
 *
 * A suite using this must also block the service worker, which caches this very route for offline
 * use: Playwright cannot intercept a fetch the worker makes, so the mock would never be consulted.
 */
export async function mockEmptyCurrentPlan(page: Page): Promise<void> {
  await page.route("**/api/plans/current*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: null })
    })
  )
}
