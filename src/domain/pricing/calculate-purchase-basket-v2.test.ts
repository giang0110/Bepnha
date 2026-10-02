import { describe, expect, test } from "vitest"
import { calculatePurchaseBasketV2 } from "./calculate-purchase-basket-v2"
import type { FoodPriceInputV2 } from "./purchasing-v2"
import { PRICE_FRESHNESS_CONFIG_V1, type CanonicalFoodDeduction } from "./pricing"

const price: FoodPriceInputV2 = {
  version: "purchase-v2",
  foodPriceId: "price-fish",
  priceBookId: "book-1",
  foodId: "fish",
  foodFactVersionId: "fish-v1",
  baseUnitId: "g",
  baseDimension: "mass",
  quoteBaseQuantity: "1000",
  quotePriceVnd: 100000,
  purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "50" },
  observedAt: "2026-10-01",
  purchaseProvenance: "Fixture: weighed portions, 50g sale step",
  purchaseTermsContentHash: "a".repeat(64)
}
const needed = (quantity: string, foodId = "fish", baseUnitId = "g", sourceId = "meal-1") => ({
  sourceId,
  foodId,
  foodFactVersionId: `${foodId}-v1`,
  baseUnitId,
  requiredBaseQuantity: quantity
})
const calculate = (
  quantity: string,
  selectedPrice: FoodPriceInputV2 = price,
  deductions: readonly CanonicalFoodDeduction[] = []
) =>
  calculatePurchaseBasketV2(
    [needed(quantity, selectedPrice.foodId, selectedPrice.baseUnitId)],
    [selectedPrice],
    "2026-10-02",
    PRICE_FRESHNESS_CONFIG_V1,
    deductions
  )
function basket(result: ReturnType<typeof calculatePurchaseBasketV2>) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}
const eggPrice: FoodPriceInputV2 = {
  ...price,
  foodId: "egg",
  foodPriceId: "price-egg",
  foodFactVersionId: "egg-v1",
  baseUnitId: "item",
  baseDimension: "count",
  quoteBaseQuantity: "1",
  quotePriceVnd: 2400,
  purchaseRule: { mode: "loose_count", saleStepBaseQuantity: "1" }
}

describe("purchase-v2", () => {
  test("buys600g fish at the verified loose rate, with no surplus", () => {
    expect(basket(calculate("600"))).toMatchObject({
      totalEstimatedCostVnd: 60000,
      lines: [
        {
          requiredBaseQuantity: "600",
          purchaseUnitCount: "12",
          purchaseBaseQuantity: "600",
          leftoverBaseQuantity: "0",
          lineCostVnd: 60000,
          purchaseRule: price.purchaseRule,
          purchaseTermsContentHash: price.purchaseTermsContentHash
        }
      ]
    })
  })
  test("buys650g for620g need at a50g step", () => {
    expect(basket(calculate("620"))).toMatchObject({
      lines: [{ purchaseBaseQuantity: "650", leftoverBaseQuantity: "30", lineCostVnd: 65000 }]
    })
  })
  test("keeps a fixed1000g pack and explains400g surplus", () => {
    expect(
      basket(
        calculate("600", { ...price, purchaseRule: { mode: "fixed_pack", packIncrement: "1" } })
      )
    ).toMatchObject({
      lines: [
        {
          purchaseUnitCount: "1",
          purchaseBaseQuantity: "1000",
          leftoverBaseQuantity: "400",
          lineCostVnd: 100000
        }
      ]
    })
  })
  test("distinguishes loose eggs from a box of10 after subtracting2 pantry eggs", () => {
    const deductions = [{ foodId: "egg", baseUnitId: "item", availableBaseQuantity: "2" }]
    expect(basket(calculate("3", eggPrice, deductions))).toMatchObject({
      lines: [
        {
          requiredBaseQuantity: "3",
          pantryDeductedBaseQuantity: "2",
          purchaseRequiredBaseQuantity: "1",
          purchaseBaseQuantity: "1",
          lineCostVnd: 2400,
          leftoverBaseQuantity: "0"
        }
      ]
    })
    expect(
      basket(
        calculate(
          "3",
          {
            ...eggPrice,
            quoteBaseQuantity: "10",
            quotePriceVnd: 24000,
            purchaseRule: { mode: "fixed_pack", packIncrement: "1" }
          },
          deductions
        )
      )
    ).toMatchObject({
      lines: [{ purchaseBaseQuantity: "10", leftoverBaseQuantity: "9", lineCostVnd: 24000 }]
    })
  })
  test("aggregates actual weekly needs then subtracts pantry before sale rounding", () => {
    const result = calculatePurchaseBasketV2(
      [needed("300", "fish", "g", "meal-1"), needed("320", "fish", "g", "meal-2")],
      [price],
      "2026-10-02",
      PRICE_FRESHNESS_CONFIG_V1,
      [{ foodId: "fish", baseUnitId: "g", availableBaseQuantity: "100" }]
    )
    expect(basket(result)).toMatchObject({
      lines: [
        {
          requiredBaseQuantity: "620",
          pantryDeductedBaseQuantity: "100",
          purchaseRequiredBaseQuantity: "520",
          purchaseBaseQuantity: "550",
          leftoverBaseQuantity: "30",
          lineCostVnd: 55000
        }
      ]
    })
  })
  test("keeps a fully-covered source line with zero purchase", () => {
    expect(
      basket(
        calculate("600", price, [{ foodId: "fish", baseUnitId: "g", availableBaseQuantity: "700" }])
      )
    ).toMatchObject({
      totalEstimatedCostVnd: 0,
      lines: [
        {
          requiredBaseQuantity: "600",
          pantryDeductedBaseQuantity: "600",
          purchaseRequiredBaseQuantity: "0",
          purchaseUnitCount: "0",
          purchaseBaseQuantity: "0",
          lineCostVnd: 0,
          leftoverBaseQuantity: "0"
        }
      ]
    })
  })
  test("rounds currency per loose line and sums those integers", () => {
    const a = {
      ...price,
      quoteBaseQuantity: "2",
      quotePriceVnd: 1,
      purchaseRule: { mode: "loose_mass" as const, saleStepBaseQuantity: "1" }
    }
    const b = { ...a, foodId: "other", foodPriceId: "price-other", foodFactVersionId: "other-v1" }
    const result = basket(
      calculatePurchaseBasketV2(
        [needed("1"), needed("1", "other")],
        [b, a],
        "2026-10-02",
        PRICE_FRESHNESS_CONFIG_V1,
        []
      )
    )
    expect(result.lines.map((line) => line.lineCostVnd)).toEqual([1, 1])
    expect(result.totalEstimatedCostVnd).toBe(2)
  })
  test("rounds whole pack increments instead of allowing partial packs", () => {
    expect(
      basket(
        calculate("600", { ...price, purchaseRule: { mode: "fixed_pack", packIncrement: "2" } })
      )
    ).toMatchObject({
      lines: [
        { purchaseUnitCount: "2", purchaseBaseQuantity: "2000", leftoverBaseQuantity: "1400" }
      ]
    })
  })
  test.each([
    { purchaseRule: { mode: "fixed_pack", packIncrement: "0.5" } },
    { purchaseRule: { mode: "fixed_pack", packIncrement: "0" } },
    { purchaseRule: { mode: "loose_count", saleStepBaseQuantity: "1" } },
    { purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "0" } },
    { purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "-1" } },
    { purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "NaN" } },
    { purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "50", packIncrement: "1" } },
    { purchaseTermsContentHash: "bad" },
    { purchaseProvenance: "" }
  ])("rejects invalid purchase terms %j", (changed) => {
    expect(calculate("600", { ...price, ...changed } as FoodPriceInputV2)).toMatchObject({
      ok: false,
      error: { code: "INVALID_PURCHASE_RULE" }
    })
  })
  test("rejects fractional count steps and count quotes", () => {
    expect(
      calculate("3", {
        ...eggPrice,
        purchaseRule: { mode: "loose_count", saleStepBaseQuantity: "0.5" }
      }).ok
    ).toBe(false)
    expect(
      calculate("3", {
        ...eggPrice,
        quoteBaseQuantity: "2.4",
        purchaseRule: { mode: "fixed_pack", packIncrement: "1" }
      }).ok
    ).toBe(false)
  })
  test.each([0, -1, NaN, Infinity, 1.5])(
    "rejects invalid quote price %s even with a full pantry",
    (quotePriceVnd) => {
      expect(
        calculate("600", { ...price, quotePriceVnd }, [
          { foodId: "fish", baseUnitId: "g", availableBaseQuantity: "700" }
        ])
      ).toMatchObject({ ok: false, error: { code: "INVALID_PRICE" } })
    }
  )
  test.each(["0", "NaN", "Infinity", "1e3", "-1"])("rejects invalid actual need %s", (quantity) => {
    expect(calculate(quantity)).toMatchObject({ ok: false, error: { code: "INVALID_DECIMAL" } })
  })
  test("fails missing, duplicate or unit-conflicting prices", () => {
    expect(
      calculatePurchaseBasketV2([needed("600")], [], "2026-10-02", PRICE_FRESHNESS_CONFIG_V1, [])
    ).toMatchObject({ ok: false, error: { code: "MISSING_PRICE" } })
    expect(
      calculatePurchaseBasketV2(
        [needed("600")],
        [price, price],
        "2026-10-02",
        PRICE_FRESHNESS_CONFIG_V1,
        []
      )
    ).toMatchObject({ ok: false, error: { code: "DUPLICATE_PRICE" } })
    expect(
      calculatePurchaseBasketV2(
        [needed("600")],
        [{ ...price, baseUnitId: "kg" }],
        "2026-10-02",
        PRICE_FRESHNESS_CONFIG_V1,
        []
      )
    ).toMatchObject({ ok: false, error: { code: "PRICE_FOOD_MISMATCH" } })
  })
  test("rejects duplicate or incompatible pantry deductions", () => {
    const deduction = { foodId: "fish", baseUnitId: "g", availableBaseQuantity: "100" }
    expect(calculate("600", price, [deduction, deduction])).toMatchObject({
      ok: false,
      error: { code: "DUPLICATE_PANTRY_DEDUCTION" }
    })
    expect(calculate("600", price, [{ ...deduction, baseUnitId: "kg" }])).toMatchObject({
      ok: false,
      error: { code: "PANTRY_DEDUCTION_MISMATCH" }
    })
  })
  test("warns on usable stale prices, rejects expired or future prices", () => {
    expect(basket(calculate("600", { ...price, observedAt: "2026-08-20" })).warnings).toMatchObject(
      [{ code: "STALE_PRICE" }]
    )
    expect(calculate("600", { ...price, observedAt: "2026-06-01" })).toMatchObject({
      ok: false,
      error: { code: "PRICE_TOO_OLD" }
    })
    expect(calculate("600", { ...price, observedAt: "2026-10-03" })).toMatchObject({
      ok: false,
      error: { code: "FUTURE_PRICE" }
    })
  })
  test("rejects line and aggregate costs outside safe integer currency", () => {
    expect(
      calculate("2", {
        ...price,
        quoteBaseQuantity: "1",
        quotePriceVnd: Number.MAX_SAFE_INTEGER,
        purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "1" }
      })
    ).toMatchObject({ ok: false, error: { code: "PURCHASE_AMOUNT_OUT_OF_RANGE" } })
    const a = {
      ...price,
      quoteBaseQuantity: "1",
      quotePriceVnd: Number.MAX_SAFE_INTEGER,
      purchaseRule: { mode: "loose_mass" as const, saleStepBaseQuantity: "1" }
    }
    const b = { ...a, foodId: "other", foodPriceId: "other-price" }
    expect(
      calculatePurchaseBasketV2(
        [needed("1"), needed("1", "other")],
        [a, b],
        "2026-10-02",
        PRICE_FRESHNESS_CONFIG_V1,
        []
      )
    ).toMatchObject({ ok: false, error: { code: "PURCHASE_AMOUNT_OUT_OF_RANGE", foodId: "total" } })
  })
})

test("rejects fractional actual whole-count needs", () => {
  expect(calculate("2.4", eggPrice)).toMatchObject({
    ok: false,
    error: { code: "INVALID_DECIMAL" }
  })
})
test("rejects fractional whole-count pantry rather than discarding part of an egg", () => {
  expect(
    calculate("3", eggPrice, [{ foodId: "egg", baseUnitId: "item", availableBaseQuantity: "2.4" }])
  ).toMatchObject({ ok: false, error: { code: "PANTRY_DEDUCTION_MISMATCH" } })
})
