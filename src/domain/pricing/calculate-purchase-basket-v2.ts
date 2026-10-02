import { applyPantryDeduction } from "../pantry/apply-pantry-deduction.js"
import {
  ExactDecimal,
  ROUND_CEIL,
  ROUND_HALF_UP,
  decimalToCanonical,
  parseCanonicalDecimal
} from "../shared/decimal.js"
import { classifyPriceFreshness } from "./classify-price-freshness.js"
import {
  normalizeFoodPriceV2,
  type FoodPriceInputV2,
  type PurchaseBasketFatalCodeV2,
  type PurchaseBasketLineV2,
  type PurchaseBasketResultV2
} from "./purchasing-v2.js"
import {
  PRICE_FRESHNESS_CONFIG_V1,
  type CanonicalFoodRequirement,
  type CanonicalFoodDeduction,
  type PriceFreshnessConfigV1,
  type PurchaseBasketWarning
} from "./pricing.js"

export function calculatePurchaseBasketV2(
  requirementsInput: readonly CanonicalFoodRequirement[],
  pricesInput: readonly FoodPriceInputV2[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1 = PRICE_FRESHNESS_CONFIG_V1,
  deductionsInput: readonly CanonicalFoodDeduction[] = []
): PurchaseBasketResultV2 {
  const fail = (code: PurchaseBasketFatalCodeV2, foodId: string): PurchaseBasketResultV2 => ({
    ok: false,
    error: { code, foodId }
  })
  const dateCheck = classifyPriceFreshness(calculationDate, calculationDate, freshnessConfig)
  if (!dateCheck.ok) return fail(dateCheck.error.code, "input")
  const requirements = new Map<
    string,
    { readonly baseUnitId: string; readonly quantity: InstanceType<typeof ExactDecimal> }
  >()
  const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1)
  for (const requirement of requirementsInput.toSorted(
    (a, b) =>
      compare(a.foodId, b.foodId) ||
      compare(a.foodFactVersionId, b.foodFactVersionId) ||
      compare(a.sourceId, b.sourceId)
  )) {
    const quantity = parseCanonicalDecimal(requirement.requiredBaseQuantity, {
      allowNegative: false,
      allowZero: false
    })
    if (!quantity.ok) return fail("INVALID_DECIMAL", requirement.foodId)
    const existing = requirements.get(requirement.foodId)
    if (existing !== undefined && existing.baseUnitId !== requirement.baseUnitId)
      return fail("PRICE_FOOD_MISMATCH", requirement.foodId)
    const total = (existing?.quantity ?? new ExactDecimal(0)).plus(quantity.value)
    if (!parseCanonicalDecimal(decimalToCanonical(total)).ok)
      return fail("PURCHASE_AMOUNT_OUT_OF_RANGE", requirement.foodId)
    requirements.set(requirement.foodId, { baseUnitId: requirement.baseUnitId, quantity: total })
  }
  const deductions = new Map<string, CanonicalFoodDeduction>()
  for (const deduction of deductionsInput.toSorted((a, b) => compare(a.foodId, b.foodId))) {
    const requirement = requirements.get(deduction.foodId)
    if (requirement === undefined || requirement.baseUnitId !== deduction.baseUnitId)
      return fail("PANTRY_DEDUCTION_MISMATCH", deduction.foodId)
    if (deductions.has(deduction.foodId))
      return fail("DUPLICATE_PANTRY_DEDUCTION", deduction.foodId)
    if (!applyPantryDeduction("0", deduction.availableBaseQuantity).ok)
      return fail("PANTRY_DEDUCTION_MISMATCH", deduction.foodId)
    deductions.set(deduction.foodId, deduction)
  }
  const prices = new Map<string, FoodPriceInputV2>()
  for (const price of pricesInput.toSorted(
    (a, b) => compare(a.foodId, b.foodId) || compare(a.foodPriceId, b.foodPriceId)
  )) {
    if (!requirements.has(price.foodId)) return fail("PRICE_FOOD_MISMATCH", price.foodId)
    if (prices.has(price.foodId)) return fail("DUPLICATE_PRICE", price.foodId)
    const validated = normalizeFoodPriceV2(price)
    if (!validated.ok) return fail(validated.error.code, price.foodId)
    prices.set(price.foodId, validated.value)
  }
  const lines: PurchaseBasketLineV2[] = []
  const warnings: PurchaseBasketWarning[] = []
  let totalCost = new ExactDecimal(0)
  for (const foodId of [...requirements.keys()].sort(compare)) {
    const requirement = requirements.get(foodId)!
    const price = prices.get(foodId)
    if (price === undefined) return fail("MISSING_PRICE", foodId)
    if (price.baseUnitId !== requirement.baseUnitId) return fail("PRICE_FOOD_MISMATCH", foodId)
    if (price.baseDimension === "count" && !requirement.quantity.isInteger())
      return fail("INVALID_DECIMAL", foodId)
    const deduction = deductions.get(foodId)
    if (
      price.baseDimension === "count" &&
      deduction !== undefined &&
      !new ExactDecimal(deduction.availableBaseQuantity).isInteger()
    )
      return fail("PANTRY_DEDUCTION_MISMATCH", foodId)
    const pantry = applyPantryDeduction(
      decimalToCanonical(requirement.quantity),
      deductions.get(foodId)?.availableBaseQuantity ?? "0"
    )
    if (!pantry.ok) return fail("PANTRY_DEDUCTION_MISMATCH", foodId)
    const freshness = classifyPriceFreshness(price.observedAt, calculationDate, freshnessConfig)
    if (!freshness.ok) return fail(freshness.error.code, foodId)
    const remaining = new ExactDecimal(pantry.value.remainingBaseQuantity)
    const quote = new ExactDecimal(price.quoteBaseQuantity)
    let unitCount: InstanceType<typeof ExactDecimal>
    let purchase: InstanceType<typeof ExactDecimal>
    let cost: InstanceType<typeof ExactDecimal>
    if (price.purchaseRule.mode === "fixed_pack") {
      const increment = new ExactDecimal(price.purchaseRule.packIncrement)
      unitCount = remaining.div(quote).div(increment).toDecimalPlaces(0, ROUND_CEIL).mul(increment)
      purchase = unitCount.mul(quote)
      cost = unitCount.mul(price.quotePriceVnd)
    } else {
      const step = new ExactDecimal(price.purchaseRule.saleStepBaseQuantity)
      unitCount = remaining.div(step).toDecimalPlaces(0, ROUND_CEIL)
      purchase = unitCount.mul(step)
      cost = purchase.div(quote).mul(price.quotePriceVnd).toDecimalPlaces(0, ROUND_HALF_UP)
    }
    const leftover = purchase.minus(remaining)
    if (
      !unitCount.isInteger() ||
      !cost.isInteger() ||
      cost.lt(0) ||
      cost.gt(Number.MAX_SAFE_INTEGER) ||
      [unitCount, purchase, leftover].some(
        (value) => !parseCanonicalDecimal(decimalToCanonical(value), { allowNegative: false }).ok
      )
    )
      return fail("PURCHASE_AMOUNT_OUT_OF_RANGE", foodId)
    totalCost = totalCost.plus(cost)
    if (totalCost.gt(Number.MAX_SAFE_INTEGER)) return fail("PURCHASE_AMOUNT_OUT_OF_RANGE", "total")
    if (freshness.freshness === "stale_usable")
      warnings.push({ ...freshness.warnings[0], foodId, foodPriceId: price.foodPriceId })
    lines.push({
      version: "purchase-v2",
      foodId,
      foodPriceId: price.foodPriceId,
      priceBookId: price.priceBookId,
      priceFoodFactVersionId: price.foodFactVersionId,
      baseUnitId: price.baseUnitId,
      baseDimension: price.baseDimension,
      quoteBaseQuantity: price.quoteBaseQuantity,
      quotePriceVnd: price.quotePriceVnd,
      purchaseRule: price.purchaseRule,
      purchaseProvenance: price.purchaseProvenance,
      purchaseTermsContentHash: price.purchaseTermsContentHash,
      observedAt: price.observedAt,
      freshness: freshness.freshness,
      requiredBaseQuantity: decimalToCanonical(requirement.quantity),
      pantryDeductedBaseQuantity: pantry.value.deductedBaseQuantity,
      purchaseRequiredBaseQuantity: pantry.value.remainingBaseQuantity,
      purchaseUnitCount: decimalToCanonical(unitCount),
      purchaseBaseQuantity: decimalToCanonical(purchase),
      leftoverBaseQuantity: decimalToCanonical(leftover),
      lineCostVnd: cost.toNumber()
    })
  }
  return { ok: true, value: { lines, warnings, totalEstimatedCostVnd: totalCost.toNumber() } }
}
