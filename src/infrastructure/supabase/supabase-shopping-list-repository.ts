import type { SupabaseClient } from "@supabase/supabase-js"

import {
  ShoppingListRepositoryError,
  type LegacyShoppingListUnavailable,
  type ReadyShoppingList,
  type PantryTransferResult,
  type ShoppingItemCheckState,
  type ShoppingListItem,
  type ShoppingListReadResult,
  type ShoppingListRepository,
  type ShoppingListSource
} from "../../application/shopping/shopping-list-repository.js"
import { ExactDecimal } from "../../domain/shared/decimal.js"
import {
  GROCERY_CATEGORIES,
  type GroceryCategoryCode
} from "../../domain/shopping/grocery-category-config.js"
import type { ShoppingWarning } from "../../domain/shopping/shopping-list.js"

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
    // Absent means the field is not there yet — a list read against a database that has not taken
    // the migration. False is the right reading of that: nothing had settled this line, because
    // nothing could. It is the pre-existing behaviour, and pressing the button is idempotent.
    transferredToPantry: value.transferredToPantry === true,
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

function parseTransferResult(value: unknown): PantryTransferResult {
  // Counts decide what the screen tells the household about their own pantry, so a shape that is
  // not what the function promises is a fault, not something to coerce into zero.
  if (!isRecord(value)) invalidStoredData()
  const transferredLineCount = value.transferredLineCount
  const totalTransferredLineCount = value.totalTransferredLineCount
  if (
    typeof transferredLineCount !== "number" ||
    !Number.isInteger(transferredLineCount) ||
    typeof totalTransferredLineCount !== "number" ||
    !Number.isInteger(totalTransferredLineCount)
  ) {
    invalidStoredData()
  }
  return {
    transferId: nonEmptyString(value.transferId),
    transferredLineCount,
    totalTransferredLineCount
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
    },
    async applyToPantry(revisionId) {
      const { data, error } = await client.rpc("apply_shopping_to_pantry", {
        p_meal_plan_revision_id: revisionId
      })
      if (error !== null) throw rpcFailure(error)
      return parseTransferResult(data)
    }
  }
}

interface ShoppingFetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly json: () => Promise<unknown>
}

type ShoppingFetcher = (url: string, init: RequestInit) => Promise<ShoppingFetchResponse>

/**
 * Uses a same-origin GET for reads so the service worker can retain an exact revision response.
 * Narrow writes remain the existing RLS-protected RPC calls on the authenticated Supabase client.
 */
export function createBrowserShoppingListRepository(
  client: SupabaseClient<Database>,
  fetcher: ShoppingFetcher = fetch
): ShoppingListRepository {
  const mutations = createSupabaseShoppingListRepository(client)
  return {
    async load(planId, revisionId) {
      const { data, error } = await client.auth.getSession()
      const token = data.session?.access_token
      if (error !== null || token === undefined) {
        throw new ShoppingListRepositoryError("UNAUTHORIZED")
      }
      const query = new URLSearchParams({ planId })
      if (revisionId !== undefined && revisionId !== null) query.set("revisionId", revisionId)
      let response: ShoppingFetchResponse
      try {
        response = await fetcher(`/api/shopping/current?${query.toString()}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch {
        throw new ShoppingListRepositoryError("DEPENDENCY_UNAVAILABLE")
      }
      if (!response.ok) {
        throw new ShoppingListRepositoryError(
          response.status === 401 || response.status === 403
            ? "UNAUTHORIZED"
            : "DEPENDENCY_UNAVAILABLE"
        )
      }
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !Object.hasOwn(payload, "shoppingList")) invalidStoredData()
      return payload.shoppingList === null ? null : parseReadResult(payload.shoppingList)
    },
    setChecked: (shoppingListItemId, checked) => mutations.setChecked(shoppingListItemId, checked),
    applyToPantry: (revisionId) => mutations.applyToPantry(revisionId)
  }
}
