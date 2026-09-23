import { describe, expect, test } from "vitest"

import type { PantryFoodOption } from "@/application/pantry/pantry-food-options-repository"

import { describeIngredient, EMPTY_INGREDIENT_LABELS, ingredientLabels } from "./ingredient-labels"
import type { PlanIngredientView } from "./planner-api"

const GAM = "70010000-0000-0000-0000-000000000001"
const MILILIT = "70010000-0000-0000-0000-000000000003"
const GAO = "60000000-0000-0000-0000-000000000001"

const options: readonly PantryFoodOption[] = [
  {
    foodId: GAO,
    foodNameVi: "Gạo tẻ",
    foodFactVersionId: "fact-1",
    baseUnitId: GAM,
    units: [{ unitId: GAM, unitCode: "g", unitNameVi: "gam" }]
  },
  {
    foodId: "60000000-0000-0000-0000-000000000002",
    foodNameVi: "Dầu ăn",
    foodFactVersionId: "fact-2",
    baseUnitId: MILILIT,
    units: [{ unitId: MILILIT, unitCode: "ml", unitNameVi: "mililít" }]
  }
]

function ingredient(overrides: Partial<PlanIngredientView> = {}): PlanIngredientView {
  return {
    sourceId: "source-1",
    foodId: GAO,
    foodFactVersionId: "fact-1",
    baseUnitId: GAM,
    baseQuantity: "480",
    grossGrams: "480",
    ...overrides
  }
}

describe("ingredient labels on the week view", () => {
  test("names the food and its unit, which is what a person shops by", () => {
    const labels = ingredientLabels(options)

    expect(describeIngredient(ingredient(), labels)).toBe("Gạo tẻ — 480 g")
    expect(
      describeIngredient(
        ingredient({
          foodId: "60000000-0000-0000-0000-000000000002",
          baseUnitId: MILILIT,
          baseQuantity: "24"
        }),
        labels
      )
    ).toBe("Dầu ăn — 24 ml")
  })

  test("resolves production identifiers, which are uuids rather than readable codes", () => {
    // The replaced implementation decided the unit with `baseUnitId.endsWith("unit-g")`. That is the
    // shape test fixtures use, so it was green here while every line in production read
    // "480 đơn vị cơ sở" — a label that names neither the food nor the unit.
    const labels = ingredientLabels(options)
    const rendered = describeIngredient(ingredient(), labels)

    expect(rendered).not.toMatch(/đơn vị cơ sở/u)
    expect(rendered).toContain("g")
    expect(labels.unitCodes.get(GAM)).toBe("g")
    expect(labels.foodNames.get(GAO)).toBe("Gạo tẻ")
  })

  test("keeps the quantity when nothing is known, and says which food is unnamed", () => {
    expect(describeIngredient(ingredient(), EMPTY_INGREDIENT_LABELS)).toBe(`${GAO} — 480`)
  })

  test("names the food even when only its unit is unknown", () => {
    const labels = ingredientLabels([{ ...options[0]!, units: [] }])

    expect(describeIngredient(ingredient(), labels)).toBe("Gạo tẻ — 480")
  })

  test("builds one unit map across every food, since a unit is shared", () => {
    const labels = ingredientLabels(options)

    expect(labels.unitCodes.size).toBe(2)
    expect(labels.foodNames.size).toBe(2)
  })
})
