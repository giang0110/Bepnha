/// <reference lib="dom" />

import { expect, test } from "@playwright/test"

test("mobile household onboarding and settings persist through local Supabase Auth", async ({
  page
}) => {
  const pageErrors: string[] = []
  const failedRequests: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`
    )
  })

  const email = `phase1-browser-${crypto.randomUUID()}@example.test`
  const password = "phase1-browser-test-password"

  await page.goto("/sign-up")
  await page.getByRole("textbox", { name: "Email" }).fill(email)
  await page.getByLabel("Mật khẩu").fill(password)
  await page.getByRole("button", { name: "Tạo tài khoản" }).click()

  await expect(page.getByRole("heading", { name: "Thành viên trong gia đình" })).toBeVisible()
  await page.getByRole("spinbutton", { name: "Người lớn" }).fill("2")
  await page.getByRole("spinbutton", { name: "Trẻ 7–9 tuổi" }).fill("1")
  await page.getByRole("button", { name: "Tiếp tục" }).click()

  await page.getByRole("textbox", { name: "Ngân sách tuần (VND)" }).fill("1200000")
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("checkbox", { name: "Không dùng thịt bò" }).check()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("checkbox", { name: "Ưu tiên món canh" }).check()
  await page.getByRole("radio", { name: "45 phút" }).check()
  await page.getByRole("button", { name: "Tiếp tục" }).click()

  await expect(page.getByRole("heading", { name: "Kiểm tra thông tin" })).toBeVisible()
  await expect(page.getByText("1.200.000 VND cho 7 bữa chính")).toBeVisible()
  await page.getByRole("button", { name: "Lưu thông tin" }).click()

  await expect(page.getByRole("heading", { name: "Gia đình của bạn" })).toBeVisible()
  await expect(page.getByText("Không dùng thịt bò")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: "Gia đình của bạn" })).toBeVisible()
  await expect(page.getByText("1.200.000 VND cho 7 bữa chính")).toBeVisible()

  await page.goto("/settings/household")
  await expect(page.getByRole("heading", { name: "Chỉnh sửa thành viên" })).toBeVisible()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  const budget = page.getByRole("textbox", { name: "Ngân sách tuần (VND)" })
  await budget.fill("1350000")
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Lưu thay đổi" }).click()
  await expect(page.getByText("1.350.000 VND cho 7 bữa chính")).toBeVisible()

  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().includes("/auth/v1/logout")
  )
  await page.getByRole("button", { name: "Đăng xuất" }).click()
  expect((await logoutResponsePromise).ok()).toBe(true)
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible()
  await page.getByRole("textbox", { name: "Email" }).fill(email)
  await page.getByLabel("Mật khẩu").fill(password)
  await page.getByRole("button", { name: "Đăng nhập" }).click()
  await expect(page.getByRole("heading", { name: "Gia đình của bạn" })).toBeVisible()
  await expect(page.getByText("1.350.000 VND cho 7 bữa chính")).toBeVisible()

  const unnamedControls = await page
    .locator("button, a[href], input, select, textarea")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          if (!(element instanceof HTMLElement) || element.hidden) return false
          const ariaLabel = element.getAttribute("aria-label")?.trim()
          const text = element.textContent?.trim()
          const input = element instanceof HTMLInputElement ? element : null
          const wrappedLabel = element.closest("label")?.textContent?.trim()
          const explicitLabel =
            input?.id === undefined || input.id === ""
              ? undefined
              : document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent?.trim()
          return !ariaLabel && !text && !wrappedLabel && !explicitLabel && !element.title
        })
        .map((element) => element.outerHTML)
    )
  expect(unnamedControls).toEqual([])

  const viewportMetrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewportMetrics.innerWidth).toBe(390)
  expect(viewportMetrics.scrollWidth).toBeLessThanOrEqual(viewportMetrics.innerWidth)
  expect(pageErrors).toEqual([])
  expect(failedRequests).toEqual([])
})
