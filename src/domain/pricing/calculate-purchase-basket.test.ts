import { describe, expect, test } from "vitest"

import { calculatePurchaseBasket } from "@/domain/pricing/calculate-purchase-basket"
import { calculateRecipeConsumptionCost } from "@/domain/pricing/calculate-recipe-consumption-cost"

const riceRequirement = {
  sourceId: "recipe-rice-1",
  foodId: "food-rice",
  foodFactVersionId: "fact-rice-v1",
  baseUnitId: "unit-g",
  requiredBaseQuantity: "1000"
} as const

const ricePrice = {
  foodPriceId: "price-rice-v1",
  priceBookId: "book-v1",
  foodId: "food-rice",
  foodFactVersionId: "fact-rice-price-v1",
  baseUnitId: "unit-g",
  packageBaseQuantity: "1000",
  packagePriceVnd: 30_000,
  purchaseIncrement: "1",
  observedAt: "2026-08-01"
} as const

describe("calculatePurchaseBasket", () => {
  test.each([
    ["999.999", "1", "1000", 30_000],
    ["1000", "1", "1000", 30_000],
    ["1000.001", "2", "2000", 60_000]
  ] as const)(
    "rounds required quantity %s to whole packages",
    (requiredBaseQuantity, purchasePackageCount, purchaseBaseQuantity, lineCostVnd) => {
      const result = calculatePurchaseBasket(
        [{ ...riceRequirement, requiredBaseQuantity }],
        [ricePrice],
        "2026-08-26"
      )

      expect(result).toMatchObject({
        ok: true,
        value: {
          lines: [{ purchasePackageCount, purchaseBaseQuantity, lineCostVnd }],
          totalEstimatedCostVnd: lineCostVnd
        }
      })
    }
  )

  test("aggregates stable-food requirements before package rounding", () => {
    const result = calculatePurchaseBasket(
      [
        { ...riceRequirement, requiredBaseQuantity: "425" },
        {
          ...riceRequirement,
          sourceId: "recipe-rice-2",
          foodFactVersionId: "fact-rice-v2",
          requiredBaseQuantity: "575"
        }
      ],
      [ricePrice],
      "2026-08-26"
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        lines: [
          {
            foodId: "food-rice",
            requiredBaseQuantity: "1000",
            purchasePackageCount: "1",
            lineCostVnd: 30_000
          }
        ],
        totalEstimatedCostVnd: 30_000
      }
    })
  })

  test("applies a positive whole-package purchase increment", () => {
    const result = calculatePurchaseBasket(
      [{ ...riceRequirement, requiredBaseQuantity: "1001" }],
      [{ ...ricePrice, purchaseIncrement: "3" }],
      "2026-08-26"
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        lines: [
          {
            purchaseIncrement: "3",
            purchasePackageCount: "3",
            purchaseBaseQuantity: "3000",
            leftoverBaseQuantity: "1999",
            lineCostVnd: 90_000
          }
        ]
      }
    })
  })

  test("returns stale-but-usable prices with exact lineage and a warning", () => {
    const result = calculatePurchaseBasket(
      [riceRequirement],
      [{ ...ricePrice, observedAt: "2026-07-26" }],
      "2026-08-26"
    )

    expect(result).toEqual({
      ok: true,
      value: {
        lines: [
          {
            foodId: "food-rice",
            baseUnitId: "unit-g",
            requiredBaseQuantity: "1000",
            packageBaseQuantity: "1000",
            purchaseIncrement: "1",
            purchasePackageCount: "1",
            purchaseBaseQuantity: "1000",
            leftoverBaseQuantity: "0",
            packagePriceVnd: 30_000,
            lineCostVnd: 30_000,
            foodPriceId: "price-rice-v1",
            priceBookId: "book-v1",
            priceFoodFactVersionId: "fact-rice-price-v1",
            observedAt: "2026-07-26",
            freshness: "stale_usable"
          }
        ],
        warnings: [
          {
            code: "STALE_PRICE",
            foodId: "food-rice",
            foodPriceId: "price-rice-v1",
            observedAt: "2026-07-26",
            ageDays: 31
          }
        ],
        totalEstimatedCostVnd: 30_000
      }
    })
  })

  test("keeps a price usable through day 90", () => {
    const result = calculatePurchaseBasket(
      [riceRequirement],
      [{ ...ricePrice, observedAt: "2026-05-28" }],
      "2026-08-26"
    )

    expect(result).toMatchObject({
      ok: true,
      value: { warnings: [{ code: "STALE_PRICE", ageDays: 90 }] }
    })
  })

  test.each([
    [[], "MISSING_PRICE", "food-rice"],
    [[ricePrice, ricePrice], "DUPLICATE_PRICE", "food-rice"],
    [[{ ...ricePrice, foodId: "food-extra" }], "PRICE_FOOD_MISMATCH", "food-extra"],
    [[{ ...ricePrice, baseUnitId: "unit-kg" }], "PRICE_FOOD_MISMATCH", "food-rice"],
    [[{ ...ricePrice, purchaseIncrement: "0.5" }], "INVALID_PRICE", "food-rice"],
    [[{ ...ricePrice, observedAt: "2026-05-27" }], "PRICE_TOO_OLD", "food-rice"],
    [[{ ...ricePrice, observedAt: "2026-08-27" }], "FUTURE_PRICE", "food-rice"]
  ] as const)("fails atomically for unusable price input", (prices, code, foodId) => {
    expect(calculatePurchaseBasket([riceRequirement], prices, "2026-08-26")).toEqual({
      ok: false,
      error: { code, foodId }
    })
  })

  test("rejects a VND line total outside the safe integer range", () => {
    expect(
      calculatePurchaseBasket(
        [{ ...riceRequirement, requiredBaseQuantity: "2000" }],
        [{ ...ricePrice, packagePriceVnd: Number.MAX_SAFE_INTEGER }],
        "2026-08-26"
      )
    ).toEqual({ ok: false, error: { code: "INVALID_PRICE", foodId: "food-rice" } })
  })

  test("is byte-equivalent under requirement and price shuffling", () => {
    const oilRequirement = {
      ...riceRequirement,
      sourceId: "recipe-oil-1",
      foodId: "food-oil",
      foodFactVersionId: "fact-oil-v1",
      requiredBaseQuantity: "40"
    }
    const oilPrice = {
      ...ricePrice,
      foodPriceId: "price-oil-v1",
      foodId: "food-oil",
      foodFactVersionId: "fact-oil-price-v1",
      packageBaseQuantity: "100",
      packagePriceVnd: 10_000
    }

    const first = calculatePurchaseBasket(
      [riceRequirement, oilRequirement],
      [ricePrice, oilPrice],
      "2026-08-26"
    )
    const second = calculatePurchaseBasket(
      [oilRequirement, riceRequirement],
      [oilPrice, ricePrice],
      "2026-08-26"
    )

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  test("keeps proportional recipe cost distinct from authoritative basket cost", () => {
    const basket = calculatePurchaseBasket(
      [{ ...riceRequirement, requiredBaseQuantity: "425" }],
      [ricePrice],
      "2026-08-26"
    )
    const consumption = calculateRecipeConsumptionCost(
      [
        {
          recipeIngredientId: riceRequirement.sourceId,
          foodId: riceRequirement.foodId,
          foodFactVersionId: riceRequirement.foodFactVersionId,
          baseUnitId: riceRequirement.baseUnitId,
          baseQuantity: "425",
          order: 1
        }
      ],
      [ricePrice],
      "2026-08-26"
    )

    expect(basket).toMatchObject({ ok: true, value: { totalEstimatedCostVnd: 30_000 } })
    expect(consumption).toMatchObject({ ok: true, value: { totalEstimatedCostVnd: 12_750 } })
  })
})
