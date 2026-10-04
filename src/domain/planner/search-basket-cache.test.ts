import { describe, expect, test } from "vitest"

import { calculatePurchaseBasketV2 } from "../pricing/calculate-purchase-basket-v2"
import type { FoodPriceInputV2, PurchaseBasketV2 } from "../pricing/purchasing-v2"
import { PLANNER_CONFIG_V1 } from "./planner-config"
import { mealSetKey, searchBoundedWeek, type SearchMealIdentity } from "./search-week"

const meals: readonly SearchMealIdentity[] = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({
  mealOptionId: id,
  mealOptionVersionId: `${id}-v1`,
  mainRecipeVersionIds: [`recipe-${id}`]
}))
const prices: readonly FoodPriceInputV2[] = [
  {
    version: "purchase-v2",
    foodPriceId: "fish-price",
    priceBookId: "book",
    foodId: "fish",
    foodFactVersionId: "fish-fact",
    baseUnitId: "g",
    baseDimension: "mass",
    quoteBaseQuantity: "1000",
    quotePriceVnd: 100_000,
    purchaseRule: { mode: "fixed_pack", packIncrement: "1" },
    purchaseProvenance: "Synthetic verified 1 kg packs",
    purchaseTermsContentHash: "a".repeat(64),
    observedAt: "2026-10-04"
  },
  {
    version: "purchase-v2",
    foodPriceId: "egg-price",
    priceBookId: "book",
    foodId: "egg",
    foodFactVersionId: "egg-fact",
    baseUnitId: "item",
    baseDimension: "count",
    quoteBaseQuantity: "10",
    quotePriceVnd: 20_000,
    purchaseRule: { mode: "loose_count", saleStepBaseQuantity: "1" },
    purchaseProvenance: "Synthetic verified individual eggs",
    purchaseTermsContentHash: "b".repeat(64),
    observedAt: "2026-10-04"
  }
]

function runSearch(cached: boolean, pantryFish = "75", conflictingPrices = false) {
  let calculations = 0
  let keyCalculations = 0
  const computedBaskets = new Map<string, PurchaseBasketV2>()
  const result = searchBoundedWeek({
    eligible: meals,
    config: PLANNER_CONFIG_V1,
    emptyBasket: { lines: [], warnings: [], totalEstimatedCostVnd: 0 },
    ...(cached
      ? {
          basketCacheKey: (selected: readonly SearchMealIdentity[]) => {
            keyCalculations += 1
            return mealSetKey(selected)
          }
        }
      : {}),
    basketFor: (selected: readonly SearchMealIdentity[]) => {
      calculations += 1
      const basket = calculatePurchaseBasketV2(
        selected.flatMap((meal) => [
          {
            foodId: "fish",
            foodFactVersionId: "fish-fact",
            baseUnitId: "g",
            sourceId: `${meal.mealOptionVersionId}:fish`,
            requiredBaseQuantity: "150"
          },
          {
            foodId: "egg",
            foodFactVersionId: "egg-fact",
            baseUnitId: "item",
            sourceId: `${meal.mealOptionVersionId}:egg`,
            requiredBaseQuantity: "1"
          }
        ]),
        conflictingPrices &&
          selected.some((meal) => meal.mealOptionId === "a") &&
          selected.some((meal) => meal.mealOptionId === "b")
          ? [...prices, { ...prices[1]!, foodPriceId: "conflicting-egg-price" }]
          : prices,
        "2026-10-04",
        undefined,
        [{ foodId: "fish", baseUnitId: "g", availableBaseQuantity: pantryFish }]
      )
      if (!basket.ok) {
        if (basket.error.code === "DUPLICATE_PRICE") return null
        throw new Error(basket.error.code)
      }
      computedBaskets.set(mealSetKey(selected), basket.value)
      return basket.value
    },
    qualityLowerBound: () => 0,
    complete: (selected: readonly SearchMealIdentity[]) => ({
      selected: selected.map((meal) => meal.mealOptionVersionId),
      basket: computedBaskets.get(mealSetKey(selected))!
    })
  })
  return { result, calculations, keyCalculations }
}

describe("purchase basket reuse in bounded week search", () => {
  test("calculates each meal set once when only day order changes", () => {
    const uncached = runSearch(false)
    const cached = runSearch(true)

    expect(cached.result).toEqual(uncached.result)
    expect(cached.result.complete).toHaveLength(125)
    expect(cached.calculations).toBeLessThan(uncached.calculations / 2)
    expect(cached.result.complete[0]?.basket.lines).toEqual([
      expect.objectContaining({ foodId: "egg", purchaseBaseQuantity: "7", lineCostVnd: 14_000 }),
      expect.objectContaining({
        foodId: "fish",
        requiredBaseQuantity: "1050",
        pantryDeductedBaseQuantity: "75",
        purchaseBaseQuantity: "1000",
        leftoverBaseQuantity: "25",
        lineCostVnd: 100_000
      })
    ])
  })

  test("never reuses a previous search's pantry deduction", () => {
    const stocked = runSearch(true, "1500")
    const depleted = runSearch(true, "0")
    expect(stocked.result.complete[0]?.basket.totalEstimatedCostVnd).toBe(14_000)
    expect(depleted.result.complete[0]?.basket.totalEstimatedCostVnd).toBe(214_000)
    expect(depleted.result).toEqual(runSearch(false, "0").result)
  })

  test("reuses rejected baskets without admitting conflicting prices", () => {
    const uncached = runSearch(false, "75", true)
    const cached = runSearch(true, "75", true)
    expect(cached.result).toEqual(uncached.result)
    expect(cached.result.complete).toEqual([])
    expect(cached.calculations).toBeLessThan(uncached.calculations / 2)
  })

  test("avoids key construction when candidates exceed cache capacity", () => {
    const largeCatalog = Array.from({ length: PLANNER_CONFIG_V1.frontier.maxSize + 1 }, (_, i) => ({
      mealOptionId: `meal-${i}`,
      mealOptionVersionId: `meal-${i}-v1`,
      mainRecipeVersionIds: [`recipe-${i}`]
    }))
    let keyCalculations = 0
    let calculations = 0
    const result = searchBoundedWeek({
      eligible: largeCatalog,
      config: PLANNER_CONFIG_V1,
      emptyBasket: { lines: [], warnings: [], totalEstimatedCostVnd: 0 },
      basketCacheKey: (selected) => {
        keyCalculations += 1
        return mealSetKey(selected)
      },
      basketFor: () => {
        calculations += 1
        const basket = calculatePurchaseBasketV2(
          [
            {
              foodId: "fish",
              foodFactVersionId: "fish-fact",
              baseUnitId: "g",
              sourceId: "fish-source",
              requiredBaseQuantity: "150"
            }
          ],
          [prices[0]!, { ...prices[0]!, foodPriceId: "conflicting-fish-price" }],
          "2026-10-04"
        )
        if (basket.ok || basket.error.code !== "DUPLICATE_PRICE")
          throw new Error("Expected conflicting prices to be rejected")
        return null
      },
      qualityLowerBound: () => 0,
      complete: () => null
    })
    expect(result.complete).toEqual([])
    expect(calculations).toBe(largeCatalog.length)
    expect(keyCalculations).toBe(0)
  })

  test("uses an unambiguous key while preserving repeated meal versions", () => {
    const versions = (ids: readonly string[]) =>
      ids.map((id) => ({ ...meals[0]!, mealOptionVersionId: id }))
    expect(mealSetKey(versions(["a|b", "c"]))).not.toBe(mealSetKey(versions(["a", "b|c"])))
    expect(mealSetKey(versions(["a", "a"]))).not.toBe(mealSetKey(versions(["a"])))
    expect(mealSetKey(versions(["a", "b"]))).toBe(mealSetKey(versions(["b", "a"])))
  })
})
