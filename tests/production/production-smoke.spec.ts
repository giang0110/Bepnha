import { expect, test, type Page, type Request } from "@playwright/test"

/**
 * Step 8 of the bring-up sequence in docs/operations/production-readiness.md, made runnable.
 *
 * Every check is a read. Nothing signs up, signs in, or writes: production holds real households,
 * and a smoke test that created an account would leave one behind on every run.
 */

/** Exactly what vercel.json declares. A header that is configured but not served is the defect. */
const REQUIRED_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000; includeSubDomains"
}

function origin(): string {
  return new URL(test.info().project.use.baseURL as string).origin
}

function isFirstPartyAsset(request: Request): boolean {
  return new URL(request.url()).origin === origin() && request.resourceType() !== "document"
}

function observePageHealth(page: Page) {
  const pageErrors: Error[] = []
  const failedAssets: string[] = []

  page.on("pageerror", (error) => pageErrors.push(error))
  page.on("requestfailed", (request) => {
    if (isFirstPartyAsset(request)) failedAssets.push(`failed ${request.url()}`)
  })
  page.on("response", (response) => {
    if (isFirstPartyAsset(response.request()) && response.status() >= 400) {
      failedAssets.push(`${response.status()} ${response.request().url()}`)
    }
  })

  return { pageErrors, failedAssets }
}

test("the health endpoint answers", async ({ request }) => {
  const response = await request.get("/api/health")

  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ status: "ok" })
})

test("the deployed site serves every security header vercel.json declares", async ({ request }) => {
  const response = await request.get("/")
  const headers = response.headers()

  for (const [name, value] of Object.entries(REQUIRED_HEADERS)) {
    expect(headers[name], `missing or wrong header: ${name}`).toBe(value)
  }
  expect(headers["permissions-policy"]).toContain("geolocation=()")
})

test("the content security policy is served and forbids inline script", async ({ request }) => {
  const policy = (await request.get("/")).headers()["content-security-policy"]

  expect(policy).toBeDefined()
  expect(policy).toContain("default-src 'self'")
  // 'unsafe-inline' in script-src would defeat the policy's main purpose.
  expect(policy?.match(/script-src[^;]*/u)?.[0]).not.toContain("unsafe-inline")
})

test("the signed-out shell renders on a phone viewport", async ({ page }) => {
  const health = observePageHealth(page)

  await page.goto("/")

  await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Tạo tài khoản" })).toBeVisible()
  expect(health.pageErrors.map((error) => error.message)).toEqual([])
  expect(health.failedAssets).toEqual([])
})

test.describe("deep links survive a cold load", () => {
  // A rewrite that is missing in production sends these to the 404 of the hosting provider rather
  // than to the application, which is invisible from inside the app and obvious from outside.

  for (const [path, heading] of [
    ["/sign-in", "Đăng nhập"],
    ["/sign-up", "Tạo tài khoản"],
    ["/forgot-password", "Quên mật khẩu"]
  ] as const) {
    test(`${path} renders its own page`, async ({ page }) => {
      await page.goto(path)

      await expect(page).toHaveURL(path)
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible()
    })
  }
})

test("an unknown deep link keeps its URL and renders not found", async ({ page }) => {
  await page.goto("/khong-ton-tai/sau-mot-lop")

  await expect(page).toHaveURL("/khong-ton-tai/sau-mot-lop")
  await expect(page.getByRole("heading", { level: 1, name: "Không tìm thấy trang" })).toBeVisible()
})

test.describe("published legal notices", () => {
  for (const [path, heading] of [
    ["/privacy", "Chính sách riêng tư"],
    ["/terms", "Điều khoản sử dụng"]
  ] as const) {
    test(`${path} is reachable and names a contact address`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible()

      // A reserved .invalid address is a placeholder shipped to users on a page that legally needs
      // a contact that works.
      const body = (await page.locator("body").textContent()) ?? ""
      expect(body, "legal page still shows a placeholder contact address").not.toContain(".invalid")
    })
  }
})

test("a protected route sends a signed-out visitor to sign-in", async ({ page }) => {
  await page.goto("/household")

  await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible()
})
