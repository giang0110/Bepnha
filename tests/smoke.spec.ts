import { expect, test } from "@playwright/test"

test("the Phase 0 shell renders on the configured mobile viewport", async ({ page }) => {
  await page.goto("/")

  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
  await expect(page.getByRole("heading", { level: 1, name: "Bếp Nhà" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Bắt đầu ở Giai đoạn 1" })).toBeDisabled()
})

test("a direct deep link preserves its URL and renders the Phase 0 shell", async ({ page }) => {
  await page.goto("/phase-0/deep-link")

  await expect(page).toHaveURL("/phase-0/deep-link")
  await expect(page.getByRole("heading", { level: 1, name: "Bếp Nhà" })).toBeVisible()
})

test("the Phase 0 shell loads without page errors or failed first-party requests", async ({
  page
}) => {
  const pageErrors: Error[] = []
  const failedRequests: string[] = []

  page.on("pageerror", (error) => pageErrors.push(error))
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === "http://127.0.0.1:4173") {
      failedRequests.push(request.url())
    }
  })

  await page.goto("/")

  expect(pageErrors).toEqual([])
  expect(failedRequests).toEqual([])
})
