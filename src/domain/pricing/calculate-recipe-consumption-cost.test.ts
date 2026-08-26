import { describe, expect, test } from "vitest"

import { calculateRecipeConsumptionCost } from "@/domain/pricing/calculate-recipe-consumption-cost"

const ingredients = [
  {
    recipeIngredientId: "ingredient-rice-v1",
    foodId: "food-rice",
    foodFactVersionId: "fact-rice-recipe-v1",
    baseUnitId: "unit-g",
    baseQuantity: "425",
    order: 1
  }
] as const

const price = {
  foodPriceId: "price-rice-v1",
  priceBookId: "book-v1",
  foodId: "food-rice",
  foodFactVersionId: "fact-rice-price-v2",
  baseUnitId: "unit-g",
  packageBaseQuantity: "1000",
  packagePriceVnd: 30_001,
  purchaseIncrement: "5",
  observedAt: "2026-08-01"
} as const

function expectCost(
  costIngredients: Parameters<typeof calculateRecipeConsumptionCost>[0] = ingredients,
  prices: Parameters<typeof calculateRecipeConsumptionCost>[1] = [price],
  calculationDate = "2026-08-26"
) {
  const result = calculateRecipeConsumptionCost(costIngredients, prices, calculationDate)

  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}

describe("calculateRecipeConsumptionCost", () => {
  test("calculates proportional consumption cost and rounds the sum once", () => {
    const result = expectCost()

    expect(result).toEqual({
      contributions: [
        {
          foodId: "food-rice",
          requiredBaseQuantity: "425",
          packageBaseQuantity: "1000",
          packagePriceVnd: 30_001,
          rawCostVnd: "12750.425"
        }
      ],
      warnings: [],
      totalRawCostVnd: "12750.425",
      totalEstimatedCostVnd: 12_750
    })
  })

  test("matches prices by stable food even when fact versions differ", () => {
    expect(expectCost().contributions[0]?.foodId).toBe("food-rice")
  })

  test("aggregates stable-food requirements before costing and ignores purchase increment", () => {
    const result = expectCost([
      ingredients[0],
      {
        ...ingredients[0],
        recipeIngredientId: "ingredient-rice-v2",
        foodFactVersionId: "fact-rice-recipe-v3",
        baseQuantity: "575",
        order: 2
      }
    ])

    expect(result.contributions[0]).toMatchObject({
      requiredBaseQuantity: "1000",
      rawCostVnd: "30001"
    })
    expect(result.totalEstimatedCostVnd).toBe(30_001)
  })

  test("returns a successful stale cost with an explicit warning", () => {
    const result = expectCost(ingredients, [{ ...price, observedAt: "2026-07-26" }])

    expect(result.totalEstimatedCostVnd).toBe(12_750)
    expect(result.warnings).toEqual([
      {
        code: "STALE_PRICE",
        foodId: "food-rice",
        observedAt: "2026-07-26",
        ageDays: 31
      }
    ])
  })

  test.each([
    [[], "MISSING_PRICE"],
    [[price, price], "DUPLICATE_PRICE"],
    [[{ ...price, observedAt: "2026-05-27" }], "PRICE_TOO_OLD"],
    [[{ ...price, observedAt: "2026-08-27" }], "FUTURE_PRICE"],
    [[{ ...price, baseUnitId: "unit-kg" }], "PRICE_FOOD_MISMATCH"]
  ] as const)("fails atomically instead of treating invalid price data as zero", (prices, code) => {
    expect(calculateRecipeConsumptionCost(ingredients, prices, "2026-08-26")).toEqual({
      ok: false,
      error: { code, foodId: "food-rice" }
    })
  })

  test("is deterministic under ingredient and price reordering", () => {
    const secondFood = {
      ...ingredients[0],
      recipeIngredientId: "ingredient-oil",
      foodId: "food-oil",
      foodFactVersionId: "fact-oil-v1",
      baseQuantity: "27",
      order: 2
    }
    const secondPrice = {
      ...price,
      foodPriceId: "price-oil-v1",
      foodId: "food-oil",
      foodFactVersionId: "fact-oil-price-v1",
      packageBaseQuantity: "100",
      packagePriceVnd: 10_000
    }

    const first = expectCost([ingredients[0], secondFood], [price, secondPrice])
    const second = expectCost([secondFood, ingredients[0]], [secondPrice, price])

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  test("does not accept recipe instruction text as a cost input", () => {
    const firstRecipe = { steps: [{ instructionVi: "Thêm dầu." }], ingredients }
    const secondRecipe = { steps: [{ instructionVi: "Dọn món." }], ingredients }

    expect(calculateRecipeConsumptionCost(firstRecipe.ingredients, [price], "2026-08-26")).toEqual(
      calculateRecipeConsumptionCost(secondRecipe.ingredients, [price], "2026-08-26")
    )
  })
})
