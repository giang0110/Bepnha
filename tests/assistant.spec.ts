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

function ready(
  items = Array.from({ length: 7 }, (_, index) => planItem(index)),
  revisionId = "50000000-0000-0000-0000-000000000010",
  planVersion = 1
) {
  return {
    planId: "40000000-0000-0000-0000-000000000010",
    revisionId,
    planVersion,
    idempotent: false,
    status: "ready_within_budget",
    budgetVnd: 1_200_000,
    plan: { items, totalEstimatedCostVnd: 950_000 },
    warnings: []
  }
}

async function onboard(page: Page) {
  await page.goto("/sign-up")
  await page
    .getByRole("textbox", { name: "Email" })
    .fill(`phase7-browser-${crypto.randomUUID()}@example.test`)
  await page.getByLabel("Mật khẩu").fill("phase7-browser-test-password")
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

test("mobile assistant remains advisory and deterministic replacement requires explicit apply", async ({
  page
}) => {
  const initial = ready()
  const replacementItems = initial.plan.items.map((item, index) =>
    index === 2 ? planItem(index, "Bữa thay thế") : item
  )
  let assistantMode: "normal" | "unavailable" = "normal"
  let assistantCalls = 0
  let previewCalls = 0
  let applyCalls = 0

  await page.route("**/api/plans/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(initial)
    })
  )
  await page.route("**/api/plans/replacements-preview", (route) => {
    previewCalls += 1
    return route.fulfill({
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
  })
  await page.route("**/api/plans/replacements-apply", (route) => {
    applyCalls += 1
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ready(replacementItems, "50000000-0000-0000-0000-000000000011", 2))
    })
  })
  await page.route("**/api/assistant", async (route) => {
    assistantCalls += 1
    if (assistantMode === "unavailable") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "x-correlation-id": "assistant-e2e-unavailable" },
        body: JSON.stringify({ error: "ASSISTANT_UNAVAILABLE" })
      })
    }

    const body = route.request().postDataJSON() as { question: string }
    if (body.question === "Giải thích kế hoạch này") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "explanation",
          summaryVi: "Bảy bữa chính đều nằm trong kế hoạch tất định.",
          observationsVi: ["Ngân sách hiện trong giới hạn."]
        })
      })
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "replacement_proposal",
        targetDayIndex: 2,
        reasonVi: "Có thể xem thử Thứ Tư để tăng độ đa dạng."
      })
    })
  })

  await onboard(page)
  await page.getByRole("link", { name: "Lập kế hoạch tuần" }).click()
  await expect(page.getByRole("heading", { name: "Trợ lý Bếp Nhà" })).toHaveCount(0)

  await page.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }).click()
  await expect(page.getByRole("heading", { name: "Trợ lý Bếp Nhà" })).toBeVisible()

  await page.getByRole("button", { name: "Giải thích kế hoạch này" }).click()
  await expect(page.getByText("Bảy bữa chính đều nằm trong kế hoạch tất định.")).toBeVisible()

  await page.getByRole("button", { name: "Bữa nào nên xem thử để đa dạng hơn?" }).click()
  await expect(page.getByText("Có thể xem thử Thứ Tư để tăng độ đa dạng.")).toBeVisible()
  await page.getByRole("button", { name: "Xem bữa thay thế cho Thứ Tư" }).click()

  expect(previewCalls).toBe(1)
  expect(applyCalls).toBe(0)
  await expect(page.getByText("Bữa thay thế", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Áp dụng bữa thay thế" })).toBeVisible()

  await page.getByRole("button", { name: "Áp dụng bữa thay thế" }).click()
  expect(applyCalls).toBe(1)
  await expect(page.getByText("Có thể xem thử Thứ Tư để tăng độ đa dạng.")).toHaveCount(0)

  assistantMode = "unavailable"
  await page.getByRole("button", { name: "Giải thích kế hoạch này" }).click()
  await expect(page.getByRole("alert")).toContainText("Trợ lý tạm thời chưa sẵn sàng.")
  await expect(page.getByRole("button", { name: "Đổi bữa" }).first()).toBeEnabled()

  expect(assistantCalls).toBe(3)
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
})
