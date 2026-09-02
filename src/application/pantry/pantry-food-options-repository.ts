export interface PantryFoodUnitOption {
  readonly unitId: string
  readonly unitCode: string
  readonly unitNameVi: string
}

export interface PantryFoodOption {
  readonly foodId: string
  readonly foodNameVi: string
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly units: readonly PantryFoodUnitOption[]
}

export interface PantryFoodOptionsRepository {
  load(): Promise<readonly PantryFoodOption[]>
}
