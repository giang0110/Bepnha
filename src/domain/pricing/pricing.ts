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
