import { applyPantryDeduction } from "@/domain/pantry/apply-pantry-deduction"
import { classifyPriceFreshness } from "@/domain/pricing/classify-price-freshness"
import {
  PRICE_FRESHNESS_CONFIG_V1,
  type CanonicalFoodDeduction,
  type CanonicalFoodRequirement,
  type FoodPriceInput,
  type PriceFreshnessConfigV1,
  type PurchaseBasketFatalCode,
  type PurchaseBasketLine,
  type PurchaseBasketResult,
  type PurchaseBasketWarning
} from "@/domain/pricing/pricing"
import {
  ExactDecimal,
  ROUND_CEIL,
  decimalToCanonical,
  parseCanonicalDecimal
} from "@/domain/shared/decimal"

function failure(code: PurchaseBasketFatalCode, foodId: string): PurchaseBasketResult {
  return { ok: false, error: { code, foodId } }
}

function parsePositive(value: string) {
  return parseCanonicalDecimal(value, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false,
    allowZero: false
  })
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

export function calculatePurchaseBasket(
  requirementsInput: readonly CanonicalFoodRequirement[],
  pricesInput: readonly FoodPriceInput[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1 = PRICE_FRESHNESS_CONFIG_V1,
  deductionsInput: readonly CanonicalFoodDeduction[] = []
): PurchaseBasketResult {
  const requirements = new Map<
    string,
    { readonly baseUnitId: string; readonly quantity: InstanceType<typeof ExactDecimal> }
  >()

  const sortedRequirements = [...requirementsInput].sort(
    (left, right) =>
      compareText(left.foodId, right.foodId) ||
      compareText(left.foodFactVersionId, right.foodFactVersionId) ||
      compareText(left.sourceId, right.sourceId)
  )

  for (const requirement of sortedRequirements) {
    const quantity = parsePositive(requirement.requiredBaseQuantity)
    if (!quantity.ok) return failure("INVALID_DECIMAL", requirement.foodId)

    const existing = requirements.get(requirement.foodId)
    if (existing !== undefined && existing.baseUnitId !== requirement.baseUnitId) {
      return failure("PRICE_FOOD_MISMATCH", requirement.foodId)
    }

    requirements.set(requirement.foodId, {
      baseUnitId: requirement.baseUnitId,
      quantity: (existing?.quantity ?? new ExactDecimal(0)).plus(quantity.value)
    })
  }

  const deductionsByFood = new Map<string, CanonicalFoodDeduction>()
  for (const deduction of [...deductionsInput].sort((left, right) =>
    compareText(left.foodId, right.foodId)
  )) {
    const requirement = requirements.get(deduction.foodId)
    if (requirement === undefined || requirement.baseUnitId !== deduction.baseUnitId) {
      return failure("PANTRY_DEDUCTION_MISMATCH", deduction.foodId)
    }
    if (deductionsByFood.has(deduction.foodId)) {
      return failure("DUPLICATE_PANTRY_DEDUCTION", deduction.foodId)
    }
    const validated = applyPantryDeduction("0", deduction.availableBaseQuantity)
    if (!validated.ok) return failure("PANTRY_DEDUCTION_MISMATCH", deduction.foodId)
    deductionsByFood.set(deduction.foodId, deduction)
  }

  const pricesByFood = new Map<string, FoodPriceInput>()
  const sortedPrices = [...pricesInput].sort(
    (left, right) =>
      compareText(left.foodId, right.foodId) || compareText(left.foodPriceId, right.foodPriceId)
  )
  for (const price of sortedPrices) {
    if (!requirements.has(price.foodId)) return failure("PRICE_FOOD_MISMATCH", price.foodId)
    if (pricesByFood.has(price.foodId)) return failure("DUPLICATE_PRICE", price.foodId)
    pricesByFood.set(price.foodId, price)
  }

  const lines: PurchaseBasketLine[] = []
  const warnings: PurchaseBasketWarning[] = []
  let totalCost = new ExactDecimal(0)

  for (const foodId of [...requirements.keys()].sort(compareText)) {
    const requirement = requirements.get(foodId)
    const price = pricesByFood.get(foodId)
    if (requirement === undefined || price === undefined) return failure("MISSING_PRICE", foodId)
    if (price.baseUnitId !== requirement.baseUnitId) {
      return failure("PRICE_FOOD_MISMATCH", foodId)
    }

    const grossRequiredBaseQuantity = decimalToCanonical(requirement.quantity)
    const deduction = deductionsByFood.get(foodId)
    const pantry = applyPantryDeduction(
      grossRequiredBaseQuantity,
      deduction?.availableBaseQuantity ?? "0"
    )
    if (!pantry.ok) return failure("PANTRY_DEDUCTION_MISMATCH", foodId)
    const purchaseRequiredQuantity = new ExactDecimal(pantry.value.remainingBaseQuantity)

    const packageQuantity = parsePositive(price.packageBaseQuantity)
    const purchaseIncrement = parsePositive(price.purchaseIncrement)
    if (
      !packageQuantity.ok ||
      !purchaseIncrement.ok ||
      !purchaseIncrement.value.isInteger() ||
      !Number.isSafeInteger(price.packagePriceVnd) ||
      price.packagePriceVnd <= 0
    ) {
      return failure("INVALID_PRICE", foodId)
    }

    const freshness = classifyPriceFreshness(price.observedAt, calculationDate, freshnessConfig)
    if (!freshness.ok) return failure(freshness.error.code, foodId)

    const packageCount = purchaseRequiredQuantity
      .div(packageQuantity.value)
      .div(purchaseIncrement.value)
      .toDecimalPlaces(0, ROUND_CEIL)
      .times(purchaseIncrement.value)
    const purchaseBaseQuantity = packageCount.times(packageQuantity.value)
    const leftoverBaseQuantity = purchaseBaseQuantity.minus(purchaseRequiredQuantity)
    const lineCost = packageCount.times(price.packagePriceVnd)

    if (
      !packageCount.isInteger() ||
      !lineCost.isInteger() ||
      lineCost.isNegative() ||
      lineCost.greaterThan(Number.MAX_SAFE_INTEGER)
    ) {
      return failure("INVALID_PRICE", foodId)
    }

    totalCost = totalCost.plus(lineCost)
    if (!totalCost.isInteger() || totalCost.greaterThan(Number.MAX_SAFE_INTEGER)) {
      return failure("INVALID_PRICE", "total")
    }

    if (freshness.freshness === "stale_usable") {
      warnings.push({
        ...freshness.warnings[0],
        foodId,
        foodPriceId: price.foodPriceId
      })
    }

    lines.push({
      foodId,
      baseUnitId: requirement.baseUnitId,
      requiredBaseQuantity: grossRequiredBaseQuantity,
      pantryDeductedBaseQuantity: pantry.value.deductedBaseQuantity,
      purchaseRequiredBaseQuantity: pantry.value.remainingBaseQuantity,
      packageBaseQuantity: decimalToCanonical(packageQuantity.value),
      purchaseIncrement: decimalToCanonical(purchaseIncrement.value),
      purchasePackageCount: decimalToCanonical(packageCount),
      purchaseBaseQuantity: decimalToCanonical(purchaseBaseQuantity),
      leftoverBaseQuantity: decimalToCanonical(leftoverBaseQuantity),
      packagePriceVnd: price.packagePriceVnd,
      lineCostVnd: lineCost.toNumber(),
      foodPriceId: price.foodPriceId,
      priceBookId: price.priceBookId,
      priceFoodFactVersionId: price.foodFactVersionId,
      observedAt: price.observedAt,
      freshness: freshness.freshness
    })
  }

  return {
    ok: true,
    value: {
      lines,
      warnings,
      totalEstimatedCostVnd: totalCost.toNumber()
    }
  }
}
