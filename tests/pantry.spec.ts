/// <reference lib="dom" />

import { expect, test, type Page } from "@playwright/test"

const FOOD_ID = "85000000-0000-0000-0000-000000000001"
const FACT_ID = "85100000-0000-0000-0000-000000000001"
const GRAM_UNIT_ID = "70010000-0000-0000-0000-000000000001"
const KILOGRAM_UNIT_ID = "70010000-0000-0000-0000-000000000002"
const PANTRY_ITEM_ID = "85200000-0000-0000-0000-000000000001"

async function onboard(page: Page) {
  const email = `phase5-pantry-${crypto.randomUUID()}@example.test`
  await page.goto("/sign-up")
  await page.getByRole("textbox", { name: "Email" }).fill(email)
  await page.getByLabel("Mật khẩu").fill("phase5-pantry-browser-password")
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

test("mobile pantry CRUD persists explicit zero quantity without automatic consumption", async ({
  page
}) => {
  let pantryItem:
    | {
        id: string
        household_id: string
        food_id: string
        food_fact_version_id: string
        quantity: number
        unit_id: string
        base_quantity: number
        base_unit_id: string
        version: number
        created_at: string
        updated_at: string
      }
    | undefined

  await page.route("**/rest/v1/foods*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          id: FOOD_ID,
          name_vi: "Gạo pantry browser",
          current_fact_version_id: FACT_ID,
          base_unit_id: GRAM_UNIT_ID
        }
      ])
    })
  })
  await page.route("**/rest/v1/food_fact_unit_conversions*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        { food_fact_version_id: FACT_ID, unit_id: GRAM_UNIT_ID },
        { food_fact_version_id: FACT_ID, unit_id: KILOGRAM_UNIT_ID }
      ])
    })
  })
  await page.route("**/rest/v1/units*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        { id: GRAM_UNIT_ID, code: "g", name_vi: "gam" },
        { id: KILOGRAM_UNIT_ID, code: "kg", name_vi: "kilôgam" }
      ])
    })
  })
  await page.route("**/rest/v1/rpc/get_pantry", async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(pantryItem === undefined ? [] : [pantryItem])
    })
  })
  await page.route("**/rest/v1/rpc/upsert_pantry_item", async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    const body = route.request().postDataJSON() as {
      p_household_id: string
      p_food_id: string
      p_food_fact_version_id: string
      p_unit_id: string
      p_quantity: number
      p_expected_version: number
    }
    const expectedVersion = pantryItem?.version ?? 0
    expect(body.p_expected_version).toBe(expectedVersion)
    expect(body.p_food_id).toBe(FOOD_ID)
    expect(body.p_food_fact_version_id).toBe(FACT_ID)
    const now = "2026-09-02T07:00:00Z"
    pantryItem = {
      id: PANTRY_ITEM_ID,
      household_id: body.p_household_id,
      food_id: FOOD_ID,
      food_fact_version_id: FACT_ID,
      quantity: body.p_quantity,
      unit_id: body.p_unit_id,
      base_quantity:
        body.p_quantity * (body.p_unit_id === KILOGRAM_UNIT_ID ? 1000 : 1),
      base_unit_id: GRAM_UNIT_ID,
      version: expectedVersion + 1,
      created_at: pantryItem?.created_at ?? now,
      updated_at: now
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(pantryItem)
    })
  })
  await page.route("**/rest/v1/rpc/delete_pantry_item", async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    const body = route.request().postDataJSON() as {
      p_pantry_item_id: string
      p_expected_version: number
    }
    expect(body).toEqual({
      p_pantry_item_id: PANTRY_ITEM_ID,
      p_expected_version: pantryItem?.version
    })
    pantryItem = undefined
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(PANTRY_ITEM_ID)
    })
  })

  await onboard(page)
  await page.goto("/pantry")
  await expect(page.getByRole("heading", { name: "Tủ bếp" })).toBeVisible()

  await page.getByLabel("Thực phẩm").selectOption({ label: "Gạo pantry browser" })
  await page.getByLabel("Đơn vị").selectOption(KILOGRAM_UNIT_ID)
  await page.getByLabel("Số lượng", { exact: true }).fill("0.25")
  await page.getByRole("button", { name: "Thêm vào tủ bếp" }).click()

  await expect(page.getByRole("heading", { name: "Gạo pantry browser" })).toBeVisible()
  await expect(page.getByLabel("Số lượng Gạo pantry browser")).toHaveValue("0.25")
  expect(pantryItem).toMatchObject({ quantity: 0.25, base_quantity: 250, version: 1 })

  await page.getByLabel("Số lượng Gạo pantry browser").fill("0")
  await page.getByRole("button", { name: "Lưu Gạo pantry browser" }).click()
  expect(pantryItem).toMatchObject({ quantity: 0, base_quantity: 0, version: 2 })

  await page.reload()
  await expect(page.getByLabel("Số lượng Gạo pantry browser")).toHaveValue("0")
  await expect(page.getByText(/không tự trừ tủ bếp khi bạn đánh dấu đã mua/i)).toBeVisible()

  const unnamedControls = await page
    .locator("button, a[href], input, select, textarea")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          if (!(element instanceof HTMLElement) || element.hidden) return false
          const ariaLabel = element.getAttribute("aria-label")?.trim()
          const text = element.textContent?.trim()
          const wrappedLabel = element.closest("label")?.textContent?.trim()
          return !ariaLabel && !text && !wrappedLabel && !element.title
        })
        .map((element) => element.outerHTML)
    )
  expect(unnamedControls).toEqual([])
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })

  await page.getByRole("button", { name: "Xóa Gạo pantry browser" }).click()
  await expect(page.getByRole("heading", { name: "Gạo pantry browser" })).toHaveCount(0)
  expect(pantryItem).toBeUndefined()
})
