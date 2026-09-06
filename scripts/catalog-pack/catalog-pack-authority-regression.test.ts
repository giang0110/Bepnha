import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { validateCatalogPackValue } from "./catalog-pack-validator.ts"

describe("catalog pack nutrient authority constraints", () => {
  test("rejects nutrient precision beyond the authoritative six-decimal scale", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.foods[0]!.fact.nutrients[0]!.amountPer100g = "1.1234567"

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "INVALID_DECIMAL"
    )
  })

  test("rejects nutrient magnitude beyond the authoritative twelve integer digits", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.foods[0]!.fact.nutrients[0]!.amountPer100g = "1234567890123"

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "INVALID_DECIMAL"
    )
  })
})

describe("catalog pack publication authority constraints", () => {
  test("requires the exact reviewed category ancestry", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    const fish = pack.foods.find((food) => food.code === "test_fish")!
    fish.fact.categoryAncestry = [fish.fact.categoryCode, "food"]

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "INVALID_CATEGORY_ANCESTRY"
    )
  })

  test("rejects unsupported dietary tags", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.foods[0]!.fact.dietaryTagCodes = ["vegan"]

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "REFERENCE_CODE_UNSUPPORTED"
    )
  })

  test("requires at least one food conversion", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.foods[0]!.fact.conversions = []

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "FOOD_CONVERSION_REQUIRED"
    )
  })

  test("requires recipe ingredients and steps even when both are empty", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.recipes[0]!.version.ingredients = []
    pack.recipes[0]!.version.steps = []

    const codes = validateCatalogPackValue(pack).diagnostics.map((item) => item.code)
    expect(codes).toContain("RECIPE_INGREDIENT_REQUIRED")
    expect(codes).toContain("RECIPE_STEP_REQUIRED")
  })

  test("rejects duplicate food usage inside one recipe", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    const recipe = pack.recipes[0]!
    const duplicate = structuredClone(recipe.version.ingredients[0]!)
    duplicate.ingredientCode = "duplicate_food_ingredient"
    duplicate.order = 2
    recipe.version.ingredients.push(duplicate)
    recipe.version.steps[0]!.ingredientCodes.push(duplicate.ingredientCode)

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "DUPLICATE_RECIPE_FOOD"
    )
  })

  test("rejects a recipe timer longer than elapsed minutes", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    const recipe = pack.recipes[0]!
    recipe.version.steps[0]!.timerMinutes = recipe.version.elapsedMinutes + 1

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "INVALID_DURATION"
    )
  })

  test("rejects an empty price book even when no meal option is reachable", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.mealOptions = []
    pack.priceBook.prices = []

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "PRICE_ROW_REQUIRED"
    )
  })

  test.each(["pending", "placeholder"])(
    "rejects the placeholder price source %s",
    (placeholder) => {
      const pack = structuredClone(buildReadyCatalogPack())
      pack.priceBook.prices[0]!.sourceReference = placeholder

      expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
        "INVALID_SOURCE_REFERENCE"
      )
    }
  )
})
