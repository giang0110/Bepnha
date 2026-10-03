import { CATALOG_DIMENSIONS, type FoodFactUnitConversion } from "../catalog/catalog.ts"
import { parseCanonicalDecimal, type ExactDecimalValue } from "../shared/decimal.ts"
import { conversionIsConsistent } from "./scale-recipe.ts"
import type { CatalogDimension } from "../catalog/catalog.ts"
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

export type FoodQuantityPolicyDefinition = Pick<
  FoodQuantityPolicyV1,
  "baseUnitId" | "baseDimension" | "foodForm" | "stepBaseQuantity" | "rounding" | "provenance"
>
export type FoodQuantityPolicyDefinitionError =
  | "INVALID_QUANTITY_POLICY"
  | "QUANTITY_POLICY_MISMATCH"
  | "INVALID_UNIT_CONVERSION"
  | "MISSING_WHOLE_PIECE_CONVERSION"
export function validateFoodQuantityPolicyDefinition(
  policy: FoodQuantityPolicyDefinition,
  conversion: FoodFactUnitConversion
):
  | { readonly ok: true; readonly step: ExactDecimalValue }
  | { readonly ok: false; readonly error: { readonly code: FoodQuantityPolicyDefinitionError } } {
  const failure = (code: FoodQuantityPolicyDefinitionError) => ({
    ok: false as const,
    error: { code }
  })
  const step = parseCanonicalDecimal(policy.stepBaseQuantity, {
    allowNegative: false,
    allowZero: false
  })
  if (!step.ok || typeof policy.provenance !== "string" || policy.provenance.trim().length === 0)
    return failure("INVALID_QUANTITY_POLICY")
  if (
    policy.baseUnitId !== conversion.foodBaseUnitId ||
    policy.baseDimension !== conversion.foodBaseDimension
  )
    return failure("QUANTITY_POLICY_MISMATCH")
  if (
    !CATALOG_DIMENSIONS.includes(conversion.sourceDimension) ||
    !CATALOG_DIMENSIONS.includes(conversion.foodBaseDimension) ||
    !conversionIsConsistent(conversion)
  )
    return failure("INVALID_UNIT_CONVERSION")
  const physicalStep = step.value.mul(conversion.foodBaseUnitToDimensionBase)
  if (policy.foodForm === "portionable_mass" || policy.foodForm === "seasoning_mass") {
    if (
      policy.baseDimension !== "mass" ||
      policy.rounding !== "half_up" ||
      !physicalStep.eq(policy.foodForm === "portionable_mass" ? "1" : "0.1")
    )
      return failure("INVALID_QUANTITY_POLICY")
  } else if (policy.foodForm === "divisible_volume") {
    if (
      policy.baseDimension !== "volume" ||
      policy.rounding !== "half_up" ||
      !physicalStep.eq("0.1")
    )
      return failure("INVALID_QUANTITY_POLICY")
  } else if (policy.foodForm === "whole_count") {
    if (
      policy.baseDimension !== "count" ||
      policy.rounding !== "ceil" ||
      !physicalStep.isInteger() ||
      physicalStep.lt(1)
    )
      return failure("INVALID_QUANTITY_POLICY")
  } else if (policy.foodForm === "whole_piece") {
    if (policy.rounding !== "ceil") return failure("INVALID_QUANTITY_POLICY")
    if (conversion.sourceDimension !== "count") return failure("MISSING_WHOLE_PIECE_CONVERSION")
    const piecesPerStep = step.value
      .mul(conversion.sourceToDimensionBase)
      .div(conversion.baseQuantityPerUnit)
    if (!piecesPerStep.isInteger() || piecesPerStep.lt(1))
      return failure("MISSING_WHOLE_PIECE_CONVERSION")
  } else return failure("INVALID_QUANTITY_POLICY")
  return { ok: true, step: step.value }
}
