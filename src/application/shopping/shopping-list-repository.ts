import type { GroceryCategoryCode } from "@/domain/shopping/grocery-category-config"
import type { ShoppingWarning } from "@/domain/shopping/shopping-list"

export type ShoppingListRepositoryErrorCode =
  "UNAUTHORIZED" | "DEPENDENCY_UNAVAILABLE" | "INVALID_STORED_DATA"

export class ShoppingListRepositoryError extends Error {
  readonly code: ShoppingListRepositoryErrorCode

  constructor(code: ShoppingListRepositoryErrorCode) {
    super("Shopping list repository request failed.")
    this.name = "ShoppingListRepositoryError"
    this.code = code
  }
}

export interface ShoppingListSource {
  readonly dayIndex: number
  readonly mealPlanItemId: string
  readonly mealOptionId: string
  readonly mealOptionVersionId: string
  readonly mealOptionNameVi: string
  readonly mealOptionRecipeId: string
  readonly recipeVersionId: string
  readonly recipeIngredientId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly requiredBaseQuantity: string
}

export interface ShoppingListItem {
  readonly shoppingListItemId: string
  readonly foodId: string
  readonly foodNameVi: string
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
  readonly groceryCategoryCode: GroceryCategoryCode
  readonly checked: boolean
  readonly checkedAt: string | null
  readonly sources: readonly ShoppingListSource[]
}

export interface ReadyShoppingList {
  readonly status: "ready"
  readonly planId: string
  readonly revisionId: string
  readonly weekStart: string
  readonly calculationFingerprint: string
  readonly budgetVnd: number
  readonly budgetStatus: "within" | "over"
  readonly overageVnd: number
  readonly totalEstimatedCostVnd: number
  readonly warnings: readonly ShoppingWarning[]
  readonly items: readonly ShoppingListItem[]
}

export interface LegacyShoppingListUnavailable {
  readonly status: "legacy_unavailable"
  readonly code: "SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION"
  readonly planId: string
  readonly revisionId: string
  readonly weekStart: string
}

export type ShoppingListReadResult = ReadyShoppingList | LegacyShoppingListUnavailable

export interface ShoppingItemCheckState {
  readonly shoppingListItemId: string
  readonly checked: boolean
  readonly checkedAt: string | null
}

export interface ShoppingListRepository {
  load(planId: string, revisionId?: string | null): Promise<ShoppingListReadResult | null>
  setChecked(shoppingListItemId: string, checked: boolean): Promise<ShoppingItemCheckState>
}
