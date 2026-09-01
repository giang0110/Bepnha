/// <reference lib="dom" />

import { expect, test, type Page } from "@playwright/test"

const PLAN_ID = "40000000-0000-0000-0000-000000000010"
const REVISION_V1 = "50000000-0000-0000-0000-000000000010"
const REVISION_V2 = "50000000-0000-0000-0000-000000000011"
const UNIT_G = "70010000-0000-0000-0000-000000000001"
const UNIT_EACH = "70010000-0000-0000-0000-000000000007"

function planItem(dayIndex: number, name = `Bữa ${dayIndex + 1}`) {
  return {
    dayIndex,
    mealSlot: "primary",
    mealOptionId: `40000000-0000-0000-0000-00000000000${dayIndex}`,
    mealOptionVersionId: `50000000-0000-0000-0000-00000000000${dayIndex}`,
    adultEquivalent: "2",
    scaleFactor: "1",
    mealOptionCode: `meal_${dayIndex}`,
    mealOptionNameVi: name,
    elapsedMinutes: 25,
    components: [
      {
        mealRole: "main",
        sortOrder: 1,
        recipe: {
          recipeId: `recipe-${dayIndex}`,
          recipeVersionId: `recipe-version-${dayIndex}`,
          steps: [{ order: 1, instructionVi: `Nấu bữa ${dayIndex + 1}.`, timerMinutes: 10 }]
        }
      }
    ],
    scaledIngredients: [
      {
        sourceId: `source-${dayIndex}`,
        foodId: `food-${dayIndex}`,
        foodFactVersionId: `fact-${dayIndex}`,
        baseUnitId: UNIT_G,
        baseQuantity: "400",
        grossGrams: "400"
      }
    ],
    nutrition: {
      nutrients: [{ nutrientCode: "energy_kcal", displayAmount: "520", unitCode: "kcal" }]
    }
  }
}

function plannerReady(
  items = Array.from({ length: 7 }, (_, index) => planItem(index)),
  revisionId = REVISION_V1,
  planVersion = 1
) {
  return {
    planId: PLAN_ID,
    revisionId,
    planVersion,
    idempotent: planVersion === 1,
    status: "ready_within_budget",
    budgetVnd: 1_200_000,
    plan: { items, totalEstimatedCostVnd: planVersion === 1 ? 950_000 : 960_000 },
    warnings: []
  }
}

function source(
  dayIndex: number,
  foodFactVersionId: string,
  baseUnitId: string,
  requiredBaseQuantity: string,
  mealName: string
) {
  return {
    dayIndex,
    mealPlanItemId: `plan-item-${dayIndex}`,
    mealOptionId: `meal-option-${dayIndex}`,
    mealOptionVersionId: `meal-option-version-${dayIndex}`,
    mealOptionNameVi: mealName,
    mealOptionRecipeId: `meal-option-recipe-${dayIndex}`,
    recipeVersionId: `recipe-version-${dayIndex}`,
    recipeIngredientId: `recipe-ingredient-${dayIndex}`,
    foodFactVersionId,
    baseUnitId,
    requiredBaseQuantity
  }
}

function item({
  id,
  foodId,
  foodNameVi,
  baseUnitId,
  requiredBaseQuantity,
  packageBaseQuantity,
  purchasePackageCount,
  purchaseBaseQuantity,
  leftoverBaseQuantity,
  packagePriceVnd,
  lineCostVnd,
  category,
  observedAt = "2026-08-20",
  freshness = "current",
  dayIndex = 0
}: {
  id: string
  foodId: string
  foodNameVi: string
  baseUnitId: string
  requiredBaseQuantity: string
  packageBaseQuantity: string
  purchasePackageCount: string
  purchaseBaseQuantity: string
  leftoverBaseQuantity: string
  packagePriceVnd: number
  lineCostVnd: number
  category: "fresh_produce" | "meat_seafood" | "eggs_tofu_dairy" | "staples"
  observedAt?: string
  freshness?: "current" | "stale_usable"
  dayIndex?: number
}) {
  const factId = `fact-${foodId}`
  return {
    shoppingListItemId: id,
    foodId,
    foodNameVi,
    baseUnitId,
    requiredBaseQuantity,
    packageBaseQuantity,
    purchaseIncrement: "1",
    purchasePackageCount,
    purchaseBaseQuantity,
    leftoverBaseQuantity,
    packagePriceVnd,
    lineCostVnd,
    foodPriceId: `price-${foodId}`,
    priceBookId: "price-book-a",
    priceFoodFactVersionId: factId,
    observedAt,
    freshness,
    groceryCategoryCode: category,
    checked: false,
    checkedAt: null,
    sources: [source(dayIndex, factId, baseUnitId, requiredBaseQuantity, `Bữa ${dayIndex + 1}`)]
  }
}

const initialItems = [
  item({
    id: "item-rau",
    foodId: "food-rau",
    foodNameVi: "Rau muống",
    baseUnitId: UNIT_G,
    requiredBaseQuantity: "300",
    packageBaseQuantity: "500",
    purchasePackageCount: "1",
    purchaseBaseQuantity: "500",
    leftoverBaseQuantity: "200",
    packagePriceVnd: 20_000,
    lineCostVnd: 20_000,
    category: "fresh_produce",
    dayIndex: 0
  }),
  item({
    id: "item-tofu",
    foodId: "food-tofu",
    foodNameVi: "Đậu hũ",
    baseUnitId: UNIT_EACH,
    requiredBaseQuantity: "2",
    packageBaseQuantity: "1",
    purchasePackageCount: "2",
    purchaseBaseQuantity: "2",
    leftoverBaseQuantity: "0",
    packagePriceVnd: 10_000,
    lineCostVnd: 20_000,
    category: "eggs_tofu_dairy",
    dayIndex: 1
  }),
  item({
    id: "item-rice",
    foodId: "food-rice",
    foodNameVi: "Gạo",
    baseUnitId: UNIT_G,
    requiredBaseQuantity: "700",
    packageBaseQuantity: "1000",
    purchasePackageCount: "1",
    purchaseBaseQuantity: "1000",
    leftoverBaseQuantity: "300",
    packagePriceVnd: 50_000,
    lineCostVnd: 50_000,
    category: "staples",
    observedAt: "2026-07-15",
    freshness: "stale_usable",
    dayIndex: 2
  })
]

const replacementItems = [
  initialItems[0]!,
  item({
    id: "item-fish",
    foodId: "food-fish",
    foodNameVi: "Cá thu",
    baseUnitId: UNIT_G,
    requiredBaseQuantity: "400",
    packageBaseQuantity: "500",
    purchasePackageCount: "1",
    purchaseBaseQuantity: "500",
    leftoverBaseQuantity: "100",
    packagePriceVnd: 45_000,
    lineCostVnd: 45_000,
    category: "meat_seafood",
    dayIndex: 1
  }),
  initialItems[2]!
]

function shoppingReady(
  revisionId: string,
  items: readonly unknown[],
  totalEstimatedCostVnd: number
) {
  return {
    status: "ready",
    planId: PLAN_ID,
    revisionId,
    weekStart: "2026-08-31",
    calculationFingerprint: (revisionId === REVISION_V1 ? "a" : "b").repeat(64),
    budgetVnd: 120_000,
    budgetStatus: "within",
    overageVnd: 0,
    totalEstimatedCostVnd,
    warnings: [
      {
        code: "STALE_PRICE",
        foodId: "food-rice",
        foodPriceId: "price-food-rice",
        observedAt: "2026-07-15",
        ageDays: 47
      }
    ],
    items
  }
}

async function onboard(page: Page) {
  const email = `phase4-shopping-${crypto.randomUUID()}@example.test`
  await page.goto("/sign-up")
  await page.getByRole("textbox", { name: "Email" }).fill(email)
  await page.getByLabel("Mật khẩu").fill("phase4-shopping-test-password")
  await page.getByRole("button", { name: "Tạo tài khoản" }).click()
  await expect(page.getByRole("heading", { name: "Thành viên trong gia đình" })).toBeVisible()
  await page.getByRole("spinbutton", { name: "Người lớn" }).fill("2")
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("textbox", { name: "Ngân sách tuần (VND)" }).fill("1200000")
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Tiếp tục" }).click()
  await page.getByRole("button", { name: "Lưu thông tin" }).click()
  await expect(page.getByRole("heading", { name: "Gia đình của bạn" })).toBeVisible()
}

test("shopping list stays revision-bound across check state, refresh, and one-meal replacement", async ({
  page
}) => {
  let currentRevisionId = REVISION_V1
  const checkedByRevision = new Map<string, boolean>()
  const replacementPlanItems = plannerReady().plan.items.map((entry, index) =>
    index === 1 ? planItem(index, "Bữa thay thế") : entry
  )

  await page.route("**/api/plans/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(plannerReady())
    })
  )
  await page.route("**/api/plans/replacements-preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready_within_budget",
        items: replacementPlanItems,
        weeklyEstimatedCostVnd: 960_000,
        costDeltaVnd: 10_000,
        warnings: [],
        previewFingerprint: "d".repeat(64)
      })
    })
  )
  await page.route("**/api/plans/replacements-apply", async (route) => {
    currentRevisionId = REVISION_V2
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(plannerReady(replacementPlanItems, REVISION_V2, 2))
    })
  })

  await page.route("**/rest/v1/rpc/get_shopping_list", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback()
      return
    }
    const body = route.request().postDataJSON() as {
      p_plan_id?: string
      p_revision_id?: string
    }
    expect(body.p_plan_id).toBe(PLAN_ID)
    const requestedRevisionId = body.p_revision_id ?? currentRevisionId
    const isHistorical = requestedRevisionId === REVISION_V1
    const rawItems = isHistorical ? initialItems : replacementItems
    const responseItems = rawItems.map((entry) => ({
      ...entry,
      checked: checkedByRevision.get(`${requestedRevisionId}:${entry.shoppingListItemId}`) ?? false,
      checkedAt:
        checkedByRevision.get(`${requestedRevisionId}:${entry.shoppingListItemId}`) === true
          ? "2026-09-01T07:00:00Z"
          : null
    }))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(
        shoppingReady(requestedRevisionId, responseItems, isHistorical ? 90_000 : 115_000)
      )
    })
  })

  await page.route("**/rest/v1/rpc/set_shopping_item_checked", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback()
      return
    }
    const body = route.request().postDataJSON() as {
      p_shopping_list_item_id: string
      p_checked: boolean
    }
    checkedByRevision.set(`${currentRevisionId}:${body.p_shopping_list_item_id}`, body.p_checked)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        shoppingListItemId: body.p_shopping_list_item_id,
        checked: body.p_checked,
        checkedAt: body.p_checked ? "2026-09-01T07:00:00Z" : null
      })
    })
  })

  await onboard(page)
  await page.getByRole("link", { name: "Lập kế hoạch tuần" }).click()
  await page.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }).click()
  await page.getByRole("link", { name: "Đi chợ" }).click()

  await expect(page.getByRole("heading", { name: "Đi chợ" })).toBeVisible()
  await expect(page.getByText("90.000 VND / 120.000 VND")).toBeVisible()
  await expect(page.getByRole("alert")).toContainText("15/07/2026")
  await expect(page.getByTestId("shopping-category").locator("h2")).toHaveText([
    "Rau củ",
    "Trứng, đậu hũ & sữa",
    "Lương thực chính"
  ])

  const rice = page.getByRole("checkbox", { name: "Gạo" })
  await rice.check()
  await page.reload()
  await expect(page.getByRole("checkbox", { name: "Gạo" })).toBeChecked()
  await page.getByRole("checkbox", { name: "Gạo" }).uncheck()
  await page.reload()
  await expect(page.getByRole("checkbox", { name: "Gạo" })).not.toBeChecked()

  await expect(page.getByText(/pantry/i)).toHaveCount(0)
  await expect(page.getByRole("button", { name: /thêm mặt hàng/i })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /đặt mua|giao hàng/i })).toHaveCount(0)

  await page.getByRole("link", { name: "Quay lại kế hoạch tuần" }).click()
  await page.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }).click()
  await page.getByRole("button", { name: "Đổi bữa" }).nth(1).click()
  await expect(page.getByText("Bữa thay thế", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Áp dụng bữa thay thế" }).click()
  await page.getByRole("link", { name: "Đi chợ" }).click()

  await expect(page.getByText("115.000 VND / 120.000 VND")).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Cá thu" })).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Đậu hũ" })).toHaveCount(0)

  await page.goto(`/shopping/${PLAN_ID}?revisionId=${REVISION_V1}`)
  await expect(page.getByText("90.000 VND / 120.000 VND")).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Đậu hũ" })).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Cá thu" })).toHaveCount(0)
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
})
