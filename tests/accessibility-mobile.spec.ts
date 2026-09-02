/// <reference lib="dom" />

import { expect, test, type Page } from "@playwright/test"

const SHOPPING_PLAN_ID = "86000000-0000-0000-0000-000000000001"

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(metrics.innerWidth).toBe(320)
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
}

async function onboard(page: Page) {
  await page.goto("/sign-up")
  await page
    .getByRole("textbox", { name: "Email" })
    .fill(`phase6-a11y-${crypto.randomUUID()}@example.test`)
  await page.getByLabel("Mật khẩu").fill("phase6-accessibility-browser-password")
  await page.getByRole("button", { name: "Tạo tài khoản" }).click()

  await expect(page.getByRole("heading", { name: "Thành viên trong gia đình" })).toBeVisible()
  await page.getByRole("spinbutton", { name: "Người lớn" }).fill("2")
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("textbox", { name: "Ngân sách tuần (VND)" }).fill("900000")
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Lưu thông tin" }).click()
  await expect(page.getByRole("heading", { name: "Gia đình của bạn" })).toBeVisible()
}

test.use({ viewport: { width: 320, height: 720 } })

test("320px protected deep links keep keyboard focus and avoid horizontal overflow", async ({
  page
}) => {
  await onboard(page)

  await page.goto("/pantry")
  await expect(page.getByRole("heading", { name: "Tủ bếp" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: "Tủ bếp" })).toBeVisible()

  const skipLink = page.getByRole("link", { name: "Bỏ qua đến nội dung chính" })
  await page.keyboard.press("Tab")
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()
  await expectNoHorizontalOverflow(page)

  await page.goto("/plan")
  await expect(page.getByRole("heading", { name: "Kế hoạch tuần" })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }).focus()
  await expect(page.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" })).toBeFocused()

  await page.goto(`/shopping/${SHOPPING_PLAN_ID}`)
  await expect(page.getByRole("heading", { name: "Đi chợ" })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole("link", { name: "Quay lại kế hoạch tuần" })).toBeVisible()
})
