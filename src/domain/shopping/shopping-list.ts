import type { GroceryCategoryCode } from "./grocery-category-config"

export type ShoppingProjectionFatalCode =
  | "INCOMPLETE_SHOPPING_LINEAGE"
  | "INCOMPATIBLE_CANONICAL_DIMENSION"
  | "PURCHASE_BASKET_PROJECTION_MISMATCH"

export interface ShoppingFactRefV1 {
  readonly foodFactVersionId: string
  readonly contentHash: string
}

export interface ShoppingSourceV1 {
  readonly dayIndex: number
  readonly mealOptionId: string
  readonly mealOptionVersionId: string
  readonly mealOptionRecipeId: string
  readonly recipeVersionId: string
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly requiredBaseQuantity: string
}

export type ShoppingWarning =
  | {
      readonly code: "STALE_PRICE"
      readonly foodId: string
      readonly foodPriceId: string
      readonly observedAt: string
      readonly ageDays: number
    }
  | {
      readonly code: "CATEGORY_AMBIGUITY"
      readonly foodId: string
      readonly factCategoryEvidence: readonly {
        readonly foodFactVersionId: string
        readonly categoryAncestry: readonly string[]
      }[]
    }
  | {
      readonly code: "CATEGORY_UNMAPPED"
      readonly foodId: string
      readonly factCategoryEvidence: readonly {
        readonly foodFactVersionId: string
        readonly categoryAncestry: readonly string[]
      }[]
    }

export interface ShoppingListSnapshotLineV1 {
  readonly foodId: string
  readonly baseUnitId: string
  readonly requiredBaseQuantity: string
  readonly pantryDeductedBaseQuantity: string
  readonly purchaseRequiredBaseQuantity: string
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
  readonly factRefs: readonly ShoppingFactRefV1[]
  readonly sources: readonly ShoppingSourceV1[]
}

export interface ShoppingListSnapshotV1 {
  readonly version: "shopping-list-v1"
  readonly groceryCategoryConfigVersion: "grocery-category-v1"
  readonly lines: readonly ShoppingListSnapshotLineV1[]
  readonly totalEstimatedCostVnd: number
  readonly warnings: readonly ShoppingWarning[]
}

export type BuildShoppingListSnapshotResult =
  | { readonly ok: true; readonly value: ShoppingListSnapshotV1 }
  | {
      readonly ok: false
      readonly error: { readonly code: ShoppingProjectionFatalCode; readonly foodId?: string }
    }
