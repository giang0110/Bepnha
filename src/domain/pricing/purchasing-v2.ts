import { decimalToCanonical, parseCanonicalDecimal } from "../shared/decimal"
import { CATALOG_DIMENSIONS, type CatalogDimension } from "../catalog/catalog"
import type { PurchaseBasketFatalCode, PurchaseBasketWarning } from "./pricing"
export type PurchaseRuleV2 =
  | { readonly mode: "fixed_pack"; readonly packIncrement: string }
  | { readonly mode: "loose_mass" | "loose_count"; readonly saleStepBaseQuantity: string }
export interface FoodPriceInputV2 {
  readonly version: "purchase-v2"
  readonly foodPriceId: string
  readonly priceBookId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly baseDimension: CatalogDimension
  readonly quoteBaseQuantity: string
  readonly quotePriceVnd: number
  readonly purchaseRule: PurchaseRuleV2
  readonly purchaseProvenance: string
  readonly purchaseTermsContentHash: string
  readonly observedAt: string
}
export interface PurchaseBasketLineV2 extends Omit<FoodPriceInputV2, "foodFactVersionId"> {
  readonly priceFoodFactVersionId: string
  readonly requiredBaseQuantity: string
  readonly pantryDeductedBaseQuantity: string
  readonly purchaseRequiredBaseQuantity: string
  readonly purchaseUnitCount: string
  readonly purchaseBaseQuantity: string
  readonly leftoverBaseQuantity: string
  readonly lineCostVnd: number
  readonly freshness: "current" | "stale_usable"
}
export interface PurchaseBasketV2 {
  readonly lines: readonly PurchaseBasketLineV2[]
  readonly warnings: readonly PurchaseBasketWarning[]
  readonly totalEstimatedCostVnd: number
}
export type PurchaseBasketFatalCodeV2 =
  PurchaseBasketFatalCode | "INVALID_PURCHASE_RULE" | "PURCHASE_AMOUNT_OUT_OF_RANGE"
export type PurchaseBasketResultV2 =
  | { readonly ok: true; readonly value: PurchaseBasketV2 }
  | {
      readonly ok: false
      readonly error: { readonly code: PurchaseBasketFatalCodeV2; readonly foodId: string }
    }

export type PriceNormalizationV2 =
  | { readonly ok: true; readonly value: FoodPriceInputV2 }
  | {
      readonly ok: false
      readonly error: { readonly code: "INVALID_PRICE" | "INVALID_PURCHASE_RULE" }
    }

export function normalizeFoodPriceV2(price: FoodPriceInputV2): PriceNormalizationV2 {
  const fail = (code: "INVALID_PRICE" | "INVALID_PURCHASE_RULE"): PriceNormalizationV2 => ({
    ok: false,
    error: { code }
  })
  const quote = parseCanonicalDecimal(price.quoteBaseQuantity, {
    allowNegative: false,
    allowZero: false
  })
  if (
    price.version !== "purchase-v2" ||
    !quote.ok ||
    !Number.isSafeInteger(price.quotePriceVnd) ||
    price.quotePriceVnd < 1 ||
    [
      price.foodId,
      price.foodPriceId,
      price.priceBookId,
      price.foodFactVersionId,
      price.baseUnitId
    ].some((id) => typeof id !== "string" || id.trim().length === 0)
  )
    return fail("INVALID_PRICE")
  if (
    !CATALOG_DIMENSIONS.includes(price.baseDimension) ||
    typeof price.purchaseProvenance !== "string" ||
    price.purchaseProvenance.trim().length === 0 ||
    !/^[a-f0-9]{64}$/u.test(price.purchaseTermsContentHash)
  )
    return fail("INVALID_PURCHASE_RULE")
  const rule = price.purchaseRule
  if (typeof rule !== "object" || rule === null || Object.keys(rule).length !== 2)
    return fail("INVALID_PURCHASE_RULE")
  if (price.baseDimension === "count" && !quote.value.isInteger())
    return fail("INVALID_PURCHASE_RULE")
  if (rule.mode === "fixed_pack") {
    const increment = parseCanonicalDecimal(rule.packIncrement, {
      allowNegative: false,
      allowZero: false
    })
    if (!increment.ok || !increment.value.isInteger()) return fail("INVALID_PURCHASE_RULE")
    return {
      ok: true,
      value: {
        ...price,
        quoteBaseQuantity: decimalToCanonical(quote.value),
        purchaseRule: { mode: "fixed_pack", packIncrement: decimalToCanonical(increment.value) }
      }
    }
  }
  if (
    (rule.mode !== "loose_mass" && rule.mode !== "loose_count") ||
    (rule.mode === "loose_mass" && price.baseDimension !== "mass") ||
    (rule.mode === "loose_count" && price.baseDimension !== "count")
  )
    return fail("INVALID_PURCHASE_RULE")
  const step = parseCanonicalDecimal(rule.saleStepBaseQuantity, {
    allowNegative: false,
    allowZero: false
  })
  if (!step.ok || (rule.mode === "loose_count" && !step.value.isInteger()))
    return fail("INVALID_PURCHASE_RULE")
  return {
    ok: true,
    value: {
      ...price,
      quoteBaseQuantity: decimalToCanonical(quote.value),
      purchaseRule: { mode: rule.mode, saleStepBaseQuantity: decimalToCanonical(step.value) }
    }
  }
}
