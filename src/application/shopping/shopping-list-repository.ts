import type { PurchaseBasketLineV2 } from "../../domain/pricing/purchasing-v2.js"
import type { ShoppingQuantityPolicyRef } from "../../domain/shopping/shopping-list.js"
import type { GroceryCategoryCode } from "../../domain/shopping/grocery-category-config.js"
import type { ShoppingWarning } from "../../domain/shopping/shopping-list.js"

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
  readonly checked: boolean
  readonly checkedAt: string | null
  /**
   * Whether finishing the trip has already settled this line against the pantry.
   *
   * Absent from a list read before the column existed, which reads as false — the honest answer for
   * a list nothing had ever settled.
   */
  readonly transferredToPantry: boolean
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

/**
 * What one press of "đi chợ xong" moved into the pantry.
 *
 * `transferredLineCount` is this press; `totalTransferredLineCount` is everything the revision has
 * ever moved. They differ because the transfer latches per item, not per trip: ticking more items
 * after an earlier press and pressing again moves only the new ones.
 */
export interface PantryTransferResult {
  readonly transferId: string
  readonly transferredLineCount: number
  readonly totalTransferredLineCount: number
}

export interface ShoppingListRepository {
  load(planId: string, revisionId?: string | null): Promise<ShoppingListReadResult | null>
  setChecked(shoppingListItemId: string, checked: boolean): Promise<ShoppingItemCheckState>
  applyToPantry(revisionId: string): Promise<PantryTransferResult>
}

export interface ShoppingListItemV2 extends PurchaseBasketLineV2 {
  readonly wholeUnit?: { readonly unitCode: string; readonly baseQuantityPerPiece: string }
  readonly shoppingListItemId: string
  readonly foodNameVi: string
  readonly groceryCategoryCode: GroceryCategoryCode
  readonly checked: boolean
  readonly checkedAt: string | null
  readonly transferredToPantry: boolean
  readonly policyRefs: readonly ShoppingQuantityPolicyRef[]
  readonly sources: readonly (ShoppingListSource & {
    readonly quantityPolicyRef: ShoppingQuantityPolicyRef
  })[]
}
export interface ReadyShoppingListV2 extends Omit<ReadyShoppingList, "items"> {
  readonly snapshotVersion: "shopping-list-v2"
  readonly items: readonly ShoppingListItemV2[]
}
export type VersionedShoppingListReadResult = ShoppingListReadResult | ReadyShoppingListV2
export interface VersionedShoppingListRepository extends Omit<ShoppingListRepository, "load"> {
  load(planId: string, revisionId?: string | null): Promise<VersionedShoppingListReadResult | null>
}

export type AnyReadyShoppingList = Omit<ReadyShoppingList, "items"> & {
  readonly snapshotVersion?: "shopping-list-v2"
  readonly items: readonly AnyShoppingListItem[]
}
export type AnyShoppingListItem = ShoppingListItem | ShoppingListItemV2
