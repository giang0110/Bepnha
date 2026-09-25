import { describe, expect, test } from "vitest"

import { pantryRestockCandidates } from "./pantry-restock"

function line(overrides: Partial<Parameters<typeof pantryRestockCandidates>[0][number]> = {}) {
  return {
    shoppingListItemId: "item-1",
    foodId: "food-1",
    leftoverBaseQuantity: "300",
    checked: true,
    ...overrides
  }
}

describe("pantry restock candidates", () => {
  test("keeps a bought line that leaves something over", () => {
    expect(pantryRestockCandidates([line()])).toEqual([
      { shoppingListItemId: "item-1", foodId: "food-1", leftoverBaseQuantity: "300" }
    ])
  })

  test("ignores a line nobody ticked, however much it would leave over", () => {
    // Unticked means it never went in the trolley. Stocking the pantry from it would invent food.
    expect(pantryRestockCandidates([line({ checked: false })])).toEqual([])
  })

  test("ignores a bought line that leaves nothing over", () => {
    // The package was consumed exactly by this week's cooking, so nothing durable was gained.
    expect(pantryRestockCandidates([line({ leftoverBaseQuantity: "0" })])).toEqual([])
  })

  test("reads the leftover as a decimal rather than as a string", () => {
    // "0.0" and "0" are the same quantity and neither belongs in the pantry; "0.5" does. A string
    // comparison against "0" gets the first of those wrong.
    const results = pantryRestockCandidates([
      line({ shoppingListItemId: "zero", leftoverBaseQuantity: "0.0" }),
      line({ shoppingListItemId: "half", leftoverBaseQuantity: "0.5" })
    ])
    expect(results.map((item) => item.shoppingListItemId)).toEqual(["half"])
  })
})
