import { expect, test, type Page, type Request } from "@playwright/test"

const appOrigin = "http://127.0.0.1:4173"

function isFirstPartyAsset(request: Request) {
  return new URL(request.url()).origin === appOrigin && request.resourceType() !== "document"
}

function observePageHealth(page: Page) {
  const pageErrors: Error[] = []
  const failedAssetResponses: string[] = []
  const failedTransportRequests: string[] = []

  page.on("pageerror", (error) => pageErrors.push(error))
  page.on("requestfailed", (request) => {
    if (isFirstPartyAsset(request)) {
      failedTransportRequests.push(request.url())
    }
  })
  page.on("response", (response) => {
    const request = response.request()

    if (isFirstPartyAsset(request) && response.status() >= 400) {
      failedAssetResponses.push(`${response.status()} ${request.url()}`)
    }
  })

  return {
    pageErrors,
    failedAssetResponses,
    failedTransportRequests,
    reset() {
      pageErrors.length = 0
      failedAssetResponses.length = 0
      failedTransportRequests.length = 0
    }
  }
}

test("the signed-out app shell renders on the configured mobile viewport", async ({ page }) => {
  await page.goto("/")

  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
  await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Tạo tài khoản" })).toBeVisible()
})

test("a direct unknown deep link preserves its URL and renders not found", async ({ page }) => {
  await page.goto("/phase-0/deep-link")

  await expect(page).toHaveURL("/phase-0/deep-link")
  await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy trang" })).toBeVisible()
})

test("the app shell loads without page errors or failed first-party requests", async ({ page }) => {
  const pageHealth = observePageHealth(page)

  await page.goto("/")
  await page.route("/page-health-probe.css", (route) => {
    void route.fulfill({ status: 500, contentType: "text/css", body: "" })
  })
  await page.evaluate(`
    const stylesheet = document.createElement("link")
    stylesheet.rel = "stylesheet"
    stylesheet.href = "/page-health-probe.css"
    document.head.append(stylesheet)
  `)

  await expect
    .poll(() => pageHealth.failedAssetResponses)
    .toEqual(["500 http://127.0.0.1:4173/page-health-probe.css"])

  await page.unroute("/page-health-probe.css")
  pageHealth.reset()

  await page.reload()

  expect(pageHealth.pageErrors).toEqual([])
  expect(pageHealth.failedAssetResponses).toEqual([])
  expect(pageHealth.failedTransportRequests).toEqual([])
})
