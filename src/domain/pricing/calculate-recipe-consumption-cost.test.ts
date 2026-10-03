import { describe, expect, test } from "vitest"

import {
  calculateRecipeConsumptionCost,
  calculateRecipeConsumptionCostV2
} from "@/domain/pricing/calculate-recipe-consumption-cost"

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

describe("consumption-cost-v2", () => {
  const v2Egg = {
    version: "purchase-v2" as const,
    foodPriceId: "egg-price",
    priceBookId: "book",
    foodId: "egg",
    foodFactVersionId: "egg-v1",
    baseUnitId: "item",
    baseDimension: "count" as const,
    quoteBaseQuantity: "10",
    quotePriceVnd: 24000,
    purchaseRule: { mode: "fixed_pack" as const, packIncrement: "1" },
    purchaseProvenance: "Fixture ten whole eggs",
    purchaseTermsContentHash: "a".repeat(64),
    observedAt: "2026-10-01"
  }
  test("costs three actual eggs separately from the purchased ten-egg box", () => {
    expect(
      calculateRecipeConsumptionCostV2(
        [
          {
            recipeIngredientId: "egg",
            foodId: "egg",
            foodFactVersionId: "egg-v1",
            baseUnitId: "item",
            baseQuantity: "3",
            order: 1
          }
        ],
        [v2Egg],
        "2026-10-02"
      )
    ).toMatchObject({ ok: true, value: { totalEstimatedCostVnd: 7200 } })
  })
  test("costs actual mass at the declared loose quote rate", () => {
    const price = {
      ...v2Egg,
      foodId: "fish",
      foodFactVersionId: "fish-v1",
      baseUnitId: "g",
      baseDimension: "mass" as const,
      quoteBaseQuantity: "1000",
      quotePriceVnd: 100000,
      purchaseRule: { mode: "loose_mass" as const, saleStepBaseQuantity: "50" }
    }
    expect(
      calculateRecipeConsumptionCostV2(
        [
          {
            recipeIngredientId: "fish",
            foodId: "fish",
            foodFactVersionId: "fish-v1",
            baseUnitId: "g",
            baseQuantity: "620",
            order: 1
          }
        ],
        [price],
        "2026-10-02"
      )
    ).toMatchObject({ ok: true, value: { totalEstimatedCostVnd: 62000 } })
  })
  test("rounds aggregate consumption money once and exports bounded decimal costs", () => {
    const prices = Array.from({ length: 6 }, (_, i) => ({
      ...v2Egg,
      foodId: `egg-${i}`,
      foodPriceId: `price-${i}`,
      quoteBaseQuantity: "12",
      quotePriceVnd: 1
    }))
    const ingredients = prices.map((price, i) => ({
      recipeIngredientId: `ingredient-${i}`,
      foodId: price.foodId,
      foodFactVersionId: "egg-v1",
      baseUnitId: "item",
      baseQuantity: "1",
      order: i + 1
    }))
    const result = calculateRecipeConsumptionCostV2(ingredients, prices, "2026-10-02")
    expect(result).toMatchObject({
      ok: true,
      value: { totalRawCostVnd: "0.5", totalEstimatedCostVnd: 1 }
    })
    if (!result.ok) throw new Error(result.error.code)
    expect(
      result.value.contributions.every((line) => (line.rawCostVnd.split(".")[1]?.length ?? 0) <= 18)
    ).toBe(true)
  })
})

test("consumption v2 refuses a theoretical fractional whole egg", () => {
  const price = {
    version: "purchase-v2" as const,
    foodPriceId: "egg-price",
    priceBookId: "book",
    foodId: "egg",
    foodFactVersionId: "egg-v1",
    baseUnitId: "item",
    baseDimension: "count" as const,
    quoteBaseQuantity: "10",
    quotePriceVnd: 24000,
    purchaseRule: { mode: "fixed_pack" as const, packIncrement: "1" },
    purchaseProvenance: "Fixture box of10",
    purchaseTermsContentHash: "a".repeat(64),
    observedAt: "2026-10-01"
  }
  expect(
    calculateRecipeConsumptionCostV2(
      [
        {
          recipeIngredientId: "egg",
          foodId: "egg",
          foodFactVersionId: "egg-v1",
          baseUnitId: "item",
          baseQuantity: "2.4",
          order: 1
        }
      ],
      [price],
      "2026-10-02"
    )
  ).toMatchObject({ ok: false, error: { code: "INVALID_DECIMAL" } })
})
