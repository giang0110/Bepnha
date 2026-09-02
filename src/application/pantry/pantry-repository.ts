export type PantryRepositoryErrorCode =
  | "UNAUTHORIZED"
  | "VERSION_CONFLICT"
  | "DEPENDENCY_UNAVAILABLE"
  | "INVALID_STORED_DATA"

export class PantryRepositoryError extends Error {
  readonly code: PantryRepositoryErrorCode

  constructor(code: PantryRepositoryErrorCode) {
    super("Pantry repository request failed.")
    this.name = "PantryRepositoryError"
    this.code = code
  }
}

export interface PantryItemRecord {
  readonly pantryItemId: string
  readonly householdId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly quantity: string
  readonly unitId: string
  readonly baseQuantity: string
  readonly baseUnitId: string
  readonly version: number
  readonly updatedAt: string
}

export interface PantryUpsertInput {
  readonly householdId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly unitId: string
  readonly quantity: string
  readonly expectedVersion: number
}

export interface PantryRepository {
  load(householdId: string): Promise<readonly PantryItemRecord[]>
  upsert(input: PantryUpsertInput): Promise<PantryItemRecord>
  remove(pantryItemId: string, expectedVersion: number): Promise<string>
}
