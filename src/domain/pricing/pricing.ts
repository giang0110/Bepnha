export interface PriceFreshnessConfigV1 {
  readonly version: "price-freshness-v1"
  readonly currentMaxAgeDays: number
  readonly usableMaxAgeDays: number
}

export const PRICE_FRESHNESS_CONFIG_V1: PriceFreshnessConfigV1 = Object.freeze({
  version: "price-freshness-v1",
  currentMaxAgeDays: 30,
  usableMaxAgeDays: 90
})

export interface RecipeCostIngredient {
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly baseQuantity: string
  readonly order: number
}

export interface FoodPriceInput {
  readonly foodPriceId: string
  readonly priceBookId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly packageBaseQuantity: string
  readonly packagePriceVnd: number
  readonly purchaseIncrement: string
  readonly observedAt: string
}

export interface CanonicalFoodRequirement {
  readonly sourceId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly requiredBaseQuantity: string
}

export interface PurchaseBasketLine {
  readonly foodId: string
  readonly baseUnitId: string
  readonly requiredBaseQuantity: string
  readonly packageBaseQuantity: string
  readonly purchaseIncrement: string
  readonly purchasePackageCount: string
  readonly purchaseBaseQuantity: string
  readonly leftoverBaseQuantity: string
  readonly packagePriceVnd: number
  readonly lineCostVnd: number
  readonly foodPriceId: string
  readonly priceBookId: string
  readonly priceFoodFactVersionId: string
  readonly observedAt: string
  readonly freshness: "current" | "stale_usable"
}

export interface PurchaseBasketWarning {
  readonly code: "STALE_PRICE"
  readonly foodId: string
  readonly foodPriceId: string
  readonly observedAt: string
  readonly ageDays: number
}

export type PurchaseBasketFatalCode =
  | "INVALID_DECIMAL"
  | "INVALID_PRICE"
  | "MISSING_PRICE"
  | "PRICE_TOO_OLD"
  | "FUTURE_PRICE"
  | "INVALID_PRICE_DATE"
  | "INVALID_PRICE_CONFIG"
  | "PRICE_FOOD_MISMATCH"
  | "DUPLICATE_PRICE"

export type PurchaseBasketResult =
  | {
      readonly ok: true
      readonly value: {
        readonly lines: readonly PurchaseBasketLine[]
        readonly warnings: readonly PurchaseBasketWarning[]
        readonly totalEstimatedCostVnd: number
      }
    }
  | {
      readonly ok: false
      readonly error: { readonly code: PurchaseBasketFatalCode; readonly foodId: string }
    }
