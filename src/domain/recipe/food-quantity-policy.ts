import type { CatalogDimension } from "../catalog/catalog"
export interface FoodQuantityPolicyV1 {
  readonly id: string
  readonly versionNumber: number
  readonly version: "food-quantity-v1"
  readonly foodFactVersionId: string
  readonly baseUnitId: string
  readonly baseDimension: CatalogDimension
  readonly foodForm:
    "portionable_mass" | "seasoning_mass" | "divisible_volume" | "whole_count" | "whole_piece"
  readonly stepBaseQuantity: string
  readonly rounding: "ceil" | "half_up"
  readonly provenance: string
  readonly contentHash: string
}
