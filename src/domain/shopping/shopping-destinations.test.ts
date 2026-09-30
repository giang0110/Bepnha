import { describe, expect, test } from "vitest"
import type { GroceryCategoryCode } from "./grocery-category-config"
import {
  categoryDestination,
  filterItemsByCheckStatus,
  filterItemsByDestination,
  SHOPPING_DESTINATIONS
} from "./shopping-destinations"
interface TestItem {
  readonly shoppingListItemId: string
  readonly groceryCategoryCode: GroceryCategoryCode
  readonly checked: boolean
}

function fakeItem(overrides: Partial<TestItem> = {}): TestItem {
  return {
    shoppingListItemId: "item-1",
    groceryCategoryCode: "fresh_produce",
    checked: false,
    ...overrides
  }
}

describe("shopping-destinations domain", () => {
  test("defines all standard destinations with human readable Vietnamese labels", () => {
    expect(SHOPPING_DESTINATIONS.map((d) => d.id)).toEqual(["all", "wet_market", "supermarket"])
  })

  test("maps fresh categories (fresh_produce, meat_seafood, eggs_tofu_dairy) to wet market", () => {
    const wetCategories: GroceryCategoryCode[] = [
      "fresh_produce",
      "meat_seafood",
      "eggs_tofu_dairy"
    ]
    for (const cat of wetCategories) {
      expect(categoryDestination(cat)).toBe("wet_market")
    }
  })

  test("maps pantry/processed categories (staples, seasonings, other) to supermarket", () => {
    const dryCategories: GroceryCategoryCode[] = ["staples", "seasonings", "other"]
    for (const cat of dryCategories) {
      expect(categoryDestination(cat)).toBe("supermarket")
    }
  })

  test("filters items correctly by destination", () => {
    const items = [
      fakeItem({ shoppingListItemId: "1", groceryCategoryCode: "fresh_produce" }),
      fakeItem({ shoppingListItemId: "2", groceryCategoryCode: "meat_seafood" }),
      fakeItem({ shoppingListItemId: "3", groceryCategoryCode: "seasonings" }),
      fakeItem({ shoppingListItemId: "4", groceryCategoryCode: "staples" })
    ]

    expect(filterItemsByDestination(items, "all")).toHaveLength(4)
    expect(filterItemsByDestination(items, "wet_market").map((i) => i.shoppingListItemId)).toEqual([
      "1",
      "2"
    ])
    expect(filterItemsByDestination(items, "supermarket").map((i) => i.shoppingListItemId)).toEqual(
      ["3", "4"]
    )
  })

  test("filters items correctly by check status", () => {
    const items = [
      fakeItem({ shoppingListItemId: "1", checked: false }),
      fakeItem({ shoppingListItemId: "2", checked: true }),
      fakeItem({ shoppingListItemId: "3", checked: false })
    ]

    expect(filterItemsByCheckStatus(items, "all")).toHaveLength(3)
    expect(filterItemsByCheckStatus(items, "remaining").map((i) => i.shoppingListItemId)).toEqual([
      "1",
      "3"
    ])
    expect(filterItemsByCheckStatus(items, "checked").map((i) => i.shoppingListItemId)).toEqual([
      "2"
    ])
  })
})
