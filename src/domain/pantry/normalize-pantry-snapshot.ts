import { decimalToCanonical, parseCanonicalDecimal } from "../shared/decimal"
import type {
  PantryBaseDimension,
  PantryItemSnapshotV1,
  PantrySnapshotNormalizationResult
} from "./pantry"

export interface PantryItemNormalizationInputV1 {
  readonly pantryItemId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly foodFactFoodId: string
  readonly quantity: string
  readonly unitId: string
  readonly baseQuantity: string
  readonly baseUnitId: string
  readonly foodBaseUnitId: string
  readonly baseDimension: PantryBaseDimension
  readonly version: number
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function normalizePantrySnapshotV1(
  items: readonly PantryItemNormalizationInputV1[]
): PantrySnapshotNormalizationResult {
  const seenFoodIds = new Set<string>()
  const normalizedItems: PantryItemSnapshotV1[] = []

  for (const item of items) {
    const quantity = parseCanonicalDecimal(item.quantity, { allowNegative: false })
    const baseQuantity = parseCanonicalDecimal(item.baseQuantity, { allowNegative: false })

    if (!quantity.ok || !baseQuantity.ok) {
      return {
        ok: false,
        error: { code: "INVALID_PANTRY_QUANTITY", pantryItemId: item.pantryItemId }
      }
    }

    if (!Number.isSafeInteger(item.version) || item.version < 1) {
      return {
        ok: false,
        error: { code: "INVALID_PANTRY_VERSION", pantryItemId: item.pantryItemId }
      }
    }

    if (item.foodId !== item.foodFactFoodId) {
      return {
        ok: false,
        error: { code: "PANTRY_FACT_LINEAGE_MISMATCH", pantryItemId: item.pantryItemId }
      }
    }

    if (item.baseUnitId !== item.foodBaseUnitId) {
      return {
        ok: false,
        error: { code: "PANTRY_BASE_UNIT_MISMATCH", pantryItemId: item.pantryItemId }
      }
    }

    if (seenFoodIds.has(item.foodId)) {
      return {
        ok: false,
        error: { code: "DUPLICATE_PANTRY_FOOD", foodId: item.foodId }
      }
    }
    seenFoodIds.add(item.foodId)

    normalizedItems.push({
      pantryItemId: item.pantryItemId,
      foodId: item.foodId,
      foodFactVersionId: item.foodFactVersionId,
      quantity: decimalToCanonical(quantity.value),
      unitId: item.unitId,
      baseQuantity: decimalToCanonical(baseQuantity.value),
      baseUnitId: item.baseUnitId,
      baseDimension: item.baseDimension,
      version: item.version
    })
  }

  normalizedItems.sort(
    (left, right) =>
      compareStableText(left.foodId, right.foodId) ||
      compareStableText(left.pantryItemId, right.pantryItemId)
  )

  return {
    ok: true,
    value: {
      version: "pantry-snapshot-v1",
      items: normalizedItems
    }
  }
}
