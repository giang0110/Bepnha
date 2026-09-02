import type { SupabaseClient } from "@supabase/supabase-js"

import {
  ShoppingListRepositoryError,
  type LegacyShoppingListUnavailable,
  type ReadyShoppingList,
  type ShoppingItemCheckState,
  type ShoppingListItem,
  type ShoppingListReadResult,
  type ShoppingListRepository,
  type ShoppingListSource
} from "@/application/shopping/shopping-list-repository"
import { ExactDecimal } from "@/domain/shared/decimal"
import {
  GROCERY_CATEGORIES,
  type GroceryCategoryCode
} from "@/domain/shopping/grocery-category-config"
import type { ShoppingWarning } from "@/domain/shopping/shopping-list"

import type { Database } from "./database.types.js"

type UnknownRecord = Record<string, unknown>

type RpcError = {
  readonly code?: string
}

const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/u
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const GROCERY_CATEGORY_CODES = new Set<GroceryCategoryCode>(
  GROCERY_CATEGORIES.map((category) => category.code)
)

function invalidStoredData(): never {
  throw new ShoppingListRepositoryError("INVALID_STORED_DATA")
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalidStoredData()
  return value
}

function dateOnly(value: unknown): string {
  const parsed = nonEmptyString(value)
  if (!DATE_ONLY.test(parsed)) invalidStoredData()
  return parsed
}

function canonicalDecimal(value: unknown, allowZero: boolean): string {
  if (typeof value !== "string" || !CANONICAL_DECIMAL.test(value)) invalidStoredData()
  if (!allowZero && value === "0") invalidStoredData()
  return value
}

function safeInteger(value: unknown, minimum = 0): number {
  let parsed: number
  if (typeof value === "number") {
    parsed = value
  } else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/u.test(value)) {
    parsed = Number(value)
  } else {
    return invalidStoredData()
  }
  if (!Number.isSafeInteger(parsed) || parsed < minimum) invalidStoredData()
  return parsed
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) invalidStoredData()
  return value.map(nonEmptyString)
}

function parseFactCategoryEvidence(value: unknown) {
  if (!Array.isArray(value)) invalidStoredData()
  return value.map((candidate) => {
    if (!isRecord(candidate)) invalidStoredData()
    return {
      foodFactVersionId: nonEmptyString(candidate.foodFactVersionId),
      categoryAncestry: parseStringArray(candidate.categoryAncestry)
    }
  })
}

function parseWarning(value: unknown): ShoppingWarning {
  if (!isRecord(value)) invalidStoredData()
  const code = value.code
  if (code === "STALE_PRICE") {
    return {
      code,
      foodId: nonEmptyString(value.foodId),
      foodPriceId: nonEmptyString(value.foodPriceId),
      observedAt: dateOnly(value.observedAt),
      ageDays: safeInteger(value.ageDays)
    }
  }
  if (code === "CATEGORY_AMBIGUITY" || code === "CATEGORY_UNMAPPED") {
    return {
      code,
      foodId: nonEmptyString(value.foodId),
      factCategoryEvidence: parseFactCategoryEvidence(value.factCategoryEvidence)
    }
  }
  return invalidStoredData()
}

function parseWarnings(value: unknown): ShoppingWarning[] {
  if (!Array.isArray(value)) invalidStoredData()
  return value.map(parseWarning)
}

function parseGroceryCategory(value: unknown): GroceryCategoryCode {
  if (typeof value !== "string" || !GROCERY_CATEGORY_CODES.has(value as GroceryCategoryCode)) {
    return invalidStoredData()
  }
  return value as GroceryCategoryCode
}

function parseSource(value: unknown): ShoppingListSource {
  if (!isRecord(value)) invalidStoredData()
  const dayIndex = safeInteger(value.dayIndex)
  if (dayIndex > 6) invalidStoredData()
  return {
    dayIndex,
    mealPlanItemId: nonEmptyString(value.mealPlanItemId),
    mealOptionId: nonEmptyString(value.mealOptionId),
    mealOptionVersionId: nonEmptyString(value.mealOptionVersionId),
    mealOptionNameVi: nonEmptyString(value.mealOptionNameVi),
    mealOptionRecipeId: nonEmptyString(value.mealOptionRecipeId),
    recipeVersionId: nonEmptyString(value.recipeVersionId),
    recipeIngredientId: nonEmptyString(value.recipeIngredientId),
    foodFactVersionId: nonEmptyString(value.foodFactVersionId),
    baseUnitId: nonEmptyString(value.baseUnitId),
    requiredBaseQuantity: canonicalDecimal(value.requiredBaseQuantity, false)
  }
}

function parseSources(value: unknown): ShoppingListSource[] {
  if (!Array.isArray(value) || value.length === 0) invalidStoredData()
  return value.map(parseSource)
}

function parseCheckedAt(checked: boolean, value: unknown): string | null {
  if (!checked) {
    if (value !== null) invalidStoredData()
    return null
  }
  return nonEmptyString(value)
}

function parseItem(value: unknown): ShoppingListItem {
  if (!isRecord(value)) invalidStoredData()
  if (typeof value.checked !== "boolean") invalidStoredData()
  const checked = value.checked
  const requiredBaseQuantity = canonicalDecimal(value.requiredBaseQuantity, false)
  const pantryDeductedBaseQuantity = canonicalDecimal(value.pantryDeductedBaseQuantity, true)
  const purchaseRequiredBaseQuantity = canonicalDecimal(value.purchaseRequiredBaseQuantity, true)
  const packageBaseQuantity = canonicalDecimal(value.packageBaseQuantity, false)
  const purchaseIncrement = canonicalDecimal(value.purchaseIncrement, false)
  const purchasePackageCount = canonicalDecimal(value.purchasePackageCount, true)
  const purchaseBaseQuantity = canonicalDecimal(value.purchaseBaseQuantity, true)
  const leftoverBaseQuantity = canonicalDecimal(value.leftoverBaseQuantity, true)

  const required = new ExactDecimal(requiredBaseQuantity)
  const deducted = new ExactDecimal(pantryDeductedBaseQuantity)
  const purchaseRequired = new ExactDecimal(purchaseRequiredBaseQuantity)
  const packageBase = new ExactDecimal(packageBaseQuantity)
  const packageCount = new ExactDecimal(purchasePackageCount)
  const purchaseBase = new ExactDecimal(purchaseBaseQuantity)
  const leftover = new ExactDecimal(leftoverBaseQuantity)

  if (
    !required.equals(deducted.plus(purchaseRequired)) ||
    purchaseBase.lessThan(purchaseRequired) ||
    !purchaseBase.equals(packageBase.times(packageCount)) ||
    !leftover.equals(purchaseBase.minus(purchaseRequired))
  ) {
    invalidStoredData()
  }

  const packagePriceVnd = safeInteger(value.packagePriceVnd, 1)
  const lineCostVnd = safeInteger(value.lineCostVnd)
  if (!new ExactDecimal(packagePriceVnd).times(packageCount).equals(lineCostVnd)) {
    invalidStoredData()
  }

  return {
    shoppingListItemId: nonEmptyString(value.shoppingListItemId),
    foodId: nonEmptyString(value.foodId),
    foodNameVi: nonEmptyString(value.foodNameVi),
    baseUnitId: nonEmptyString(value.baseUnitId),
    requiredBaseQuantity,
    pantryDeductedBaseQuantity,
    purchaseRequiredBaseQuantity,
    packageBaseQuantity,
    purchaseIncrement,
    purchasePackageCount,
    purchaseBaseQuantity,
    leftoverBaseQuantity,
    packagePriceVnd,
    lineCostVnd,
    foodPriceId: nonEmptyString(value.foodPriceId),
    priceBookId: nonEmptyString(value.priceBookId),
    priceFoodFactVersionId: nonEmptyString(value.priceFoodFactVersionId),
    observedAt: dateOnly(value.observedAt),
    freshness:
      value.freshness === "current" || value.freshness === "stale_usable"
        ? value.freshness
        : invalidStoredData(),
    groceryCategoryCode: parseGroceryCategory(value.groceryCategoryCode),
    checked,
    checkedAt: parseCheckedAt(checked, value.checkedAt),
    sources: parseSources(value.sources)
  }
}

function parseItems(value: unknown): ShoppingListItem[] {
  if (!Array.isArray(value)) invalidStoredData()
  return value.map(parseItem)
}

function parseLegacy(value: UnknownRecord): LegacyShoppingListUnavailable {
  if (value.code !== "SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION") invalidStoredData()
  return {
    status: "legacy_unavailable",
    code: "SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION",
    planId: nonEmptyString(value.planId),
    revisionId: nonEmptyString(value.revisionId),
    weekStart: dateOnly(value.weekStart)
  }
}

function parseReady(value: UnknownRecord): ReadyShoppingList {
  const calculationFingerprint = nonEmptyString(value.calculationFingerprint)
  if (!SHA256.test(calculationFingerprint)) invalidStoredData()
  const budgetVnd = safeInteger(value.budgetVnd)
  const overageVnd = safeInteger(value.overageVnd)
  const totalEstimatedCostVnd = safeInteger(value.totalEstimatedCostVnd)
  const budgetStatus = value.budgetStatus
  if (budgetStatus !== "within" && budgetStatus !== "over") invalidStoredData()
  if (budgetStatus === "within" && (overageVnd !== 0 || totalEstimatedCostVnd > budgetVnd)) {
    invalidStoredData()
  }
  if (
    budgetStatus === "over" &&
    (totalEstimatedCostVnd <= budgetVnd || overageVnd !== totalEstimatedCostVnd - budgetVnd)
  ) {
    invalidStoredData()
  }
  const items = parseItems(value.items)
  if (items.reduce((sum, item) => sum + item.lineCostVnd, 0) !== totalEstimatedCostVnd) {
    invalidStoredData()
  }
  return {
    status: "ready",
    planId: nonEmptyString(value.planId),
    revisionId: nonEmptyString(value.revisionId),
    weekStart: dateOnly(value.weekStart),
    calculationFingerprint,
    budgetVnd,
    budgetStatus,
    overageVnd,
    totalEstimatedCostVnd,
    warnings: parseWarnings(value.warnings),
    items
  }
}

function parseReadResult(value: unknown): ShoppingListReadResult {
  if (!isRecord(value)) invalidStoredData()
  if (value.status === "ready") return parseReady(value)
  if (value.status === "legacy_unavailable") return parseLegacy(value)
  return invalidStoredData()
}

function parseCheckState(
  value: unknown,
  expectedItemId: string,
  expectedChecked: boolean
): ShoppingItemCheckState {
  if (!isRecord(value) || typeof value.checked !== "boolean") invalidStoredData()
  const shoppingListItemId = nonEmptyString(value.shoppingListItemId)
  if (shoppingListItemId !== expectedItemId || value.checked !== expectedChecked)
    invalidStoredData()
  return {
    shoppingListItemId,
    checked: expectedChecked,
    checkedAt: parseCheckedAt(expectedChecked, value.checkedAt)
  }
}

function rpcFailure(error: RpcError): ShoppingListRepositoryError {
  return new ShoppingListRepositoryError(
    error.code === "42501" ? "UNAUTHORIZED" : "DEPENDENCY_UNAVAILABLE"
  )
}

export function createSupabaseShoppingListRepository(
  client: SupabaseClient<Database>
): ShoppingListRepository {
  return {
    async load(planId, revisionId) {
      const args =
        revisionId === undefined || revisionId === null
          ? { p_plan_id: planId }
          : { p_plan_id: planId, p_revision_id: revisionId }
      const { data, error } = await client.rpc("get_shopping_list", args)
      if (error !== null) throw rpcFailure(error)
      return data === null ? null : parseReadResult(data)
    },

    async setChecked(shoppingListItemId, checked) {
      const { data, error } = await client.rpc("set_shopping_item_checked", {
        p_shopping_list_item_id: shoppingListItemId,
        p_checked: checked
      })
      if (error !== null) throw rpcFailure(error)
      return parseCheckState(data, shoppingListItemId, checked)
    }
  }
}
