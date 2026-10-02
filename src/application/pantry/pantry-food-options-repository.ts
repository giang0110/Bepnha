export interface PantryFoodUnitOption {
  readonly baseQuantityPerUnit?: string
  readonly unitId: string
  readonly unitCode: string
  readonly unitNameVi: string
}

export interface PantryFoodOption {
  readonly wholeUnitPolicy?: {
    readonly policyId: string
    readonly contentHash: string
    readonly baseQuantityPerPiece: string
  }
  readonly foodId: string
  readonly foodNameVi: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly units: readonly PantryFoodUnitOption[]
}

export interface PantryFoodOptionsRepository {
  load(): Promise<readonly PantryFoodOption[]>
}
