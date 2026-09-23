import { describe, expect, test } from "vitest"

import type { ShoppingListItem } from "@/application/shopping/shopping-list-repository"

import { shoppingProgress } from "./shopping-progress"

function item(id: string, lineCostVnd: number, checked: boolean): ShoppingListItem {
  return {
    shoppingListItemId: id,
    foodId: `food-${id}`,
    foodNameVi: `Món ${id}`,
    baseUnitId: "unit-g",
    requiredBaseQuantity: "100",
    pantryDeductedBaseQuantity: "0",
    purchaseRequiredBaseQuantity: "100",
    packageBaseQuantity: "100",
    purchaseIncrement: "1",
    purchasePackageCount: "1",
    purchaseBaseQuantity: "100",
    leftoverBaseQuantity: "0",
    packagePriceVnd: lineCostVnd,
    lineCostVnd,
    foodPriceId: "price",
    priceBookId: "book",
    priceFoodFactVersionId: "fact",
    observedAt: "2026-09-01",
    freshness: "current",
    groceryCategoryCode: "staples",
    checked,
    checkedAt: checked ? "2026-09-02T00:00:00Z" : null,
    sources: []
  }
}

describe("shoppingProgress", () => {
  test("counts nothing done and everything owed on an untouched list", () => {
    const progress = shoppingProgress([item("a", 30_000, false), item("b", 20_000, false)])

    expect(progress).toEqual({
      checkedCount: 0,
      totalCount: 2,
      remainingCostVnd: 50_000,
      pickedUpCostVnd: 0
    })
  })

  test("moves money from remaining to picked up as items are ticked", () => {
    const progress = shoppingProgress([item("a", 30_000, true), item("b", 20_000, false)])

    expect(progress.remainingCostVnd).toBe(20_000)
    expect(progress.pickedUpCostVnd).toBe(30_000)
    expect(progress.checkedCount).toBe(1)
  })

  test("the two figures always account for the whole list", () => {
    // This is what makes the remaining figure trustworthy next to the stored total: it is not a
    // second opinion about the cost, it is one half of a split.
    const items = [item("a", 30_000, true), item("b", 20_000, false), item("c", 7_500, false)]
    const progress = shoppingProgress(items)

    expect(progress.remainingCostVnd + progress.pickedUpCostVnd).toBe(57_500)
  })

  test("owes nothing once everything is ticked", () => {
    const progress = shoppingProgress([item("a", 30_000, true)])

    expect(progress.remainingCostVnd).toBe(0)
    expect(progress.checkedCount).toBe(1)
  })

  test("counts a line that needs no purchase, because the shopper still has to decide that", () => {
    const covered = { ...item("a", 0, false), purchasePackageCount: "0" }
    const progress = shoppingProgress([covered, item("b", 20_000, false)])

    expect(progress.totalCount).toBe(2)
    expect(progress.remainingCostVnd).toBe(20_000)
  })

  test("returns an empty trip rather than dividing by nothing", () => {
    expect(shoppingProgress([])).toEqual({
      checkedCount: 0,
      totalCount: 0,
      remainingCostVnd: 0,
      pickedUpCostVnd: 0
    })
  })
})
