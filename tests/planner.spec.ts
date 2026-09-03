/// <reference lib="dom" />

import { expect, test, type Page } from "@playwright/test"

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
        baseUnitId: "unit-g",
        baseQuantity: "400",
        grossGrams: "400"
      }
    ],
    nutrition: {
      nutrients: [{ nutrientCode: "energy_kcal", displayAmount: "520", unitCode: "kcal" }]
    }
  }
}

function ready(items = Array.from({ length: 7 }, (_, index) => planItem(index))) {
  return {
    planId: "40000000-0000-0000-0000-000000000010",
    revisionId: "50000000-0000-0000-0000-000000000010",
    planVersion: 1,
    idempotent: false,
    status: "ready_within_budget",
    budgetVnd: 1_200_000,
    plan: { items, totalEstimatedCostVnd: 950_000 },
    warnings: []
  }
}

async function onboard(page: Page) {
  const email = `phase3-browser-${crypto.randomUUID()}@example.test`
  await page.goto("/sign-up")
  await page.getByRole("textbox", { name: "Email" }).fill(email)
  await page.getByLabel("Mật khẩu").fill("phase3-browser-test-password")
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

test("mobile planner generates, shows details, and applies a one-day replacement", async ({
  page
}) => {
  const initial = ready()
  const replacementItems = initial.plan.items.map((item, index) =>
    index === 2 ? planItem(index, "Bữa thay thế") : item
  )
  await page.route("**/api/plans/generate", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(initial) })
  )
  await page.route("**/api/plans/replacements-preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready_within_budget",
        items: replacementItems,
        weeklyEstimatedCostVnd: 960_000,
        costDeltaVnd: 10_000,
        warnings: [],
        previewFingerprint: "d".repeat(64)
      })
    })
  )
  await page.route("**/api/plans/replacements-apply", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...ready(replacementItems),
        revisionId: "50000000-0000-0000-0000-000000000011",
        planVersion: 2,
        costDeltaVnd: 10_000
      })
    })
  )

  await onboard(page)
  await page.getByRole("link", { name: "Lập kế hoạch tuần" }).click()
  await page.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }).click()
  await expect(page.getByRole("listitem", { name: "Bữa chính Thứ Hai" })).toBeVisible()
  const namesBefore = await page.getByTestId("meal-name").allTextContents()
  await page
    .getByRole("listitem", { name: "Bữa chính Thứ Hai" })
    .getByText("Xem cách nấu và dinh dưỡng")
    .click()
  await expect(page.getByText("Nấu bữa 1.")).toBeVisible()

  await page.getByRole("button", { name: "Đổi bữa" }).nth(2).click()
  await expect(page.getByText("Bữa thay thế", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Áp dụng bữa thay thế" }).click()
  await expect(page.getByTestId("meal-name").nth(2)).toHaveText("Bữa thay thế")
  const namesAfter = await page.getByTestId("meal-name").allTextContents()
  expect(namesAfter.filter((name, index) => name !== namesBefore[index])).toEqual(["Bữa thay thế"])
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
})

test("planner shows exact over-budget and stale-price warnings without treating them as fatal", async ({
  page
}) => {
  await page.route("**/api/plans/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...ready(),
        status: "ready_over_budget",
        plan: { items: ready().plan.items, totalEstimatedCostVnd: 1_225_000 },
        warnings: [
          { code: "PLAN_OVER_BUDGET", overageVnd: 25_000 },
          { code: "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" },
          { code: "STALE_PRICE" }
        ]
      })
    })
  )
  await onboard(page)
  await page.goto("/plan")
  await page.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }).click()
  await expect(page.getByText(/vượt ngân sách 25.000 VND/i)).toBeVisible()
  await expect(page.getByText(/phạm vi tìm kiếm tất định/i)).toBeVisible()
  await expect(page.getByText(/giá cũ nhưng vẫn còn dùng được/i)).toBeVisible()
})
