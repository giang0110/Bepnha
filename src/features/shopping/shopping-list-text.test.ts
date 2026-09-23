import { describe, expect, test } from "vitest"

import type {
  ReadyShoppingList,
  ShoppingListItem
} from "@/application/shopping/shopping-list-repository"

import { shoppingListText } from "./shopping-list-text"

const unitLabel = (baseUnitId: string) => (baseUnitId === "unit-g" ? "g" : "đơn vị cơ sở")

function item(overrides: Partial<ShoppingListItem> & { foodNameVi: string }): ShoppingListItem {
  return {
    shoppingListItemId: overrides.foodNameVi,
    foodId: `food-${overrides.foodNameVi}`,
    baseUnitId: "unit-g",
    requiredBaseQuantity: "100",
    pantryDeductedBaseQuantity: "0",
    purchaseRequiredBaseQuantity: "100",
    packageBaseQuantity: "500",
    purchaseIncrement: "1",
    purchasePackageCount: "1",
    purchaseBaseQuantity: "500",
    leftoverBaseQuantity: "400",
    packagePriceVnd: 30_000,
    lineCostVnd: 30_000,
    foodPriceId: "price",
    priceBookId: "book",
    priceFoodFactVersionId: "fact",
    observedAt: "2026-09-01",
    freshness: "current",
    groceryCategoryCode: "staples",
    checked: false,
    checkedAt: null,
    sources: [],
    ...overrides
  }
}

function list(items: readonly ShoppingListItem[]): ReadyShoppingList {
  return {
    status: "ready",
    planId: "plan",
    revisionId: "rev",
    weekStart: "2026-08-31",
    calculationFingerprint: "f",
    budgetVnd: 700_000,
    budgetStatus: "within",
    overageVnd: 0,
    totalEstimatedCostVnd: items.reduce((total, entry) => total + entry.lineCostVnd, 0),
    warnings: [],
    items
  }
}

describe("shoppingListText", () => {
  test("names the week so a forwarded message is not ambiguous a fortnight later", () => {
    expect(shoppingListText(list([item({ foodNameVi: "Gạo tẻ" })]), unitLabel)).toContain(
      "Đi chợ — tuần từ 31/08/2026"
    )
  })

  test("groups by aisle in the order the aisles are walked, not alphabetically", () => {
    const text = shoppingListText(
      list([
        item({ foodNameVi: "Gạo tẻ", groceryCategoryCode: "staples" }),
        item({ foodNameVi: "Rau muống", groceryCategoryCode: "fresh_produce" })
      ]),
      unitLabel
    )

    expect(text.indexOf("Rau củ")).toBeLessThan(text.indexOf("Lương thực chính"))
  })

  test("sorts Vietnamese names the way the screen does", () => {
    const text = shoppingListText(
      list([
        item({ foodNameVi: "Ớt", groceryCategoryCode: "fresh_produce" }),
        item({ foodNameVi: "Đậu bắp", groceryCategoryCode: "fresh_produce" })
      ]),
      unitLabel
    )

    expect(text.indexOf("Đậu bắp")).toBeLessThan(text.indexOf("Ớt"))
  })

  test("says what to buy, in packages, with the line cost", () => {
    expect(shoppingListText(list([item({ foodNameVi: "Gạo tẻ" })]), unitLabel)).toContain(
      "[ ] Gạo tẻ — 1 gói × 500 g (~30.000 VND)"
    )
  })

  test("keeps a ticked item, marked, rather than dropping it", () => {
    // A shopper needs to see that something was deliberately skipped, not silently absent.
    const text = shoppingListText(list([item({ foodNameVi: "Gạo tẻ", checked: true })]), unitLabel)

    expect(text).toContain("[x] Gạo tẻ")
  })

  test("says a pantry-covered line needs nothing rather than printing a zero purchase", () => {
    const covered = item({
      foodNameVi: "Nước mắm",
      purchasePackageCount: "0",
      lineCostVnd: 0
    })

    expect(shoppingListText(list([covered]), unitLabel)).toContain(
      "[ ] Nước mắm — đã đủ trong tủ bếp"
    )
  })

  test("shows only the total while nothing is ticked, and both figures once something is", () => {
    const untouched = list([item({ foodNameVi: "Gạo tẻ" }), item({ foodNameVi: "Thịt heo" })])
    expect(shoppingListText(untouched, unitLabel)).toContain("Tổng ước tính: 60.000 VND")

    const partial = list([
      item({ foodNameVi: "Gạo tẻ", checked: true }),
      item({ foodNameVi: "Thịt heo" })
    ])
    expect(shoppingListText(partial, unitLabel)).toContain(
      "Còn phải mua: 30.000 VND / tổng 60.000 VND"
    )
  })

  test("omits an aisle with nothing in it rather than printing an empty heading", () => {
    const text = shoppingListText(list([item({ foodNameVi: "Gạo tẻ" })]), unitLabel)

    expect(text).not.toContain("Gia vị")
    expect(text).not.toContain("Khác")
  })
})
