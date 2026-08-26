export const CATALOG_DIMENSIONS = ["mass", "volume", "count"] as const

export type CatalogDimension = (typeof CATALOG_DIMENSIONS)[number]

export interface FoodFactUnitConversion {
  readonly unitId: string
  readonly unitCode: string
  readonly sourceDimension: CatalogDimension
  readonly sourceToDimensionBase: string
  readonly foodBaseUnitId: string
  readonly foodBaseDimension: CatalogDimension
  readonly foodBaseUnitToDimensionBase: string
  readonly baseQuantityPerUnit: string
  readonly grossGramsPerUnit: string
  readonly displayStep: string
}
