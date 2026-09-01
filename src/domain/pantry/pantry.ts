export type PantryBaseDimension = "mass" | "volume" | "count"

export interface PantryItemSnapshotV1 {
  readonly pantryItemId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly quantity: string
  readonly unitId: string
  readonly baseQuantity: string
  readonly baseUnitId: string
  readonly baseDimension: PantryBaseDimension
  readonly version: number
}

export interface PantrySnapshotV1 {
  readonly version: "pantry-snapshot-v1"
  readonly items: readonly PantryItemSnapshotV1[]
}

export type PantrySnapshotNormalizationError =
  | { readonly code: "DUPLICATE_PANTRY_FOOD"; readonly foodId: string }
  | { readonly code: "INVALID_PANTRY_QUANTITY"; readonly pantryItemId: string }
  | { readonly code: "PANTRY_FACT_LINEAGE_MISMATCH"; readonly pantryItemId: string }
  | { readonly code: "PANTRY_BASE_UNIT_MISMATCH"; readonly pantryItemId: string }
  | { readonly code: "INVALID_PANTRY_VERSION"; readonly pantryItemId: string }

export type PantrySnapshotNormalizationResult =
  | { readonly ok: true; readonly value: PantrySnapshotV1 }
  | { readonly ok: false; readonly error: PantrySnapshotNormalizationError }
