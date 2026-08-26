import {
  classifyPriceFreshness,
  type StalePriceWarning
} from "@/domain/pricing/classify-price-freshness"
import type { FoodPriceInput, RecipeCostIngredient } from "@/domain/pricing/pricing"
import { PRICE_FRESHNESS_CONFIG_V1, type PriceFreshnessConfigV1 } from "@/domain/pricing/pricing"
import {
  ExactDecimal,
  ROUND_HALF_UP,
  decimalToCanonical,
  parseCanonicalDecimal
} from "@/domain/shared/decimal"

export type RecipeCostFatalCode =
  | "INVALID_DECIMAL"
  | "INVALID_PRICE"
  | "MISSING_PRICE"
  | "PRICE_TOO_OLD"
  | "FUTURE_PRICE"
  | "INVALID_PRICE_DATE"
  | "INVALID_PRICE_CONFIG"
  | "PRICE_FOOD_MISMATCH"
  | "DUPLICATE_PRICE"

export type RecipeConsumptionCostResult =
  | {
      readonly ok: true
      readonly value: {
        readonly contributions: readonly {
          readonly foodId: string
          readonly requiredBaseQuantity: string
          readonly packageBaseQuantity: string
          readonly packagePriceVnd: number
          readonly rawCostVnd: string
        }[]
        readonly warnings: readonly (StalePriceWarning & { readonly foodId: string })[]
        readonly totalRawCostVnd: string
        readonly totalEstimatedCostVnd: number
      }
    }
  | {
      readonly ok: false
      readonly error: { readonly code: RecipeCostFatalCode; readonly foodId: string }
    }

function failure(code: RecipeCostFatalCode, foodId: string): RecipeConsumptionCostResult {
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

export function calculateRecipeConsumptionCost(
  ingredients: readonly RecipeCostIngredient[],
  prices: readonly FoodPriceInput[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1 = PRICE_FRESHNESS_CONFIG_V1
): RecipeConsumptionCostResult {
  const requirements = new Map<
    string,
    { readonly baseUnitId: string; readonly quantity: InstanceType<typeof ExactDecimal> }
  >()

  for (const ingredient of [...ingredients].sort((left, right) => {
    if (left.foodId !== right.foodId) return left.foodId < right.foodId ? -1 : 1
    if (left.order !== right.order) return left.order - right.order
    return left.recipeIngredientId < right.recipeIngredientId ? -1 : 1
  })) {
    const quantity = parsePositive(ingredient.baseQuantity)
    if (!quantity.ok) return failure("INVALID_DECIMAL", ingredient.foodId)

    const existing = requirements.get(ingredient.foodId)
    if (existing !== undefined && existing.baseUnitId !== ingredient.baseUnitId) {
      return failure("PRICE_FOOD_MISMATCH", ingredient.foodId)
    }
    requirements.set(ingredient.foodId, {
      baseUnitId: ingredient.baseUnitId,
      quantity: (existing?.quantity ?? new ExactDecimal(0)).plus(quantity.value)
    })
  }

  const pricesByFood = new Map<string, FoodPriceInput>()
  for (const price of prices) {
    if (pricesByFood.has(price.foodId)) return failure("DUPLICATE_PRICE", price.foodId)
    if (!requirements.has(price.foodId)) return failure("PRICE_FOOD_MISMATCH", price.foodId)
    pricesByFood.set(price.foodId, price)
  }

  const contributions: {
    foodId: string
    requiredBaseQuantity: string
    packageBaseQuantity: string
    packagePriceVnd: number
    rawCostVnd: string
  }[] = []
  const warnings: (StalePriceWarning & { foodId: string })[] = []
  let totalRawCost = new ExactDecimal(0)

  for (const foodId of [...requirements.keys()].sort()) {
    const requirement = requirements.get(foodId)
    const price = pricesByFood.get(foodId)
    if (requirement === undefined || price === undefined) return failure("MISSING_PRICE", foodId)
    if (price.baseUnitId !== requirement.baseUnitId) {
      return failure("PRICE_FOOD_MISMATCH", foodId)
    }

    const packageQuantity = parsePositive(price.packageBaseQuantity)
    const purchaseIncrement = parsePositive(price.purchaseIncrement)
    if (
      !packageQuantity.ok ||
      !purchaseIncrement.ok ||
      !Number.isSafeInteger(price.packagePriceVnd) ||
      price.packagePriceVnd <= 0
    ) {
      return failure("INVALID_PRICE", foodId)
    }

    const freshness = classifyPriceFreshness(price.observedAt, calculationDate, freshnessConfig)
    if (!freshness.ok) return failure(freshness.error.code, foodId)
    if (freshness.freshness === "stale_usable") {
      warnings.push({ ...freshness.warnings[0], foodId })
    }

    const rawCost = requirement.quantity.div(packageQuantity.value).times(price.packagePriceVnd)
    totalRawCost = totalRawCost.plus(rawCost)
    contributions.push({
      foodId,
      requiredBaseQuantity: decimalToCanonical(requirement.quantity),
      packageBaseQuantity: decimalToCanonical(packageQuantity.value),
      packagePriceVnd: price.packagePriceVnd,
      rawCostVnd: decimalToCanonical(rawCost)
    })
  }

  const roundedTotal = totalRawCost.toDecimalPlaces(0, ROUND_HALF_UP)
  if (!roundedTotal.isInteger() || roundedTotal.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    return failure("INVALID_PRICE", "total")
  }

  return {
    ok: true,
    value: {
      contributions,
      warnings,
      totalRawCostVnd: decimalToCanonical(totalRawCost),
      totalEstimatedCostVnd: roundedTotal.toNumber()
    }
  }
}
