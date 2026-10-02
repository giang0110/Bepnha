import { CATALOG_DIMENSIONS, type FoodFactUnitConversion } from "../catalog/catalog"
import {
  ExactDecimal,
  ROUND_CEIL,
  ROUND_HALF_UP,
  parseCanonicalDecimal,
  roundDecimal
} from "../shared/decimal"
import type { FoodQuantityPolicyV1 } from "./food-quantity-policy"
import { conversionIsConsistent, type ScaledRecipeIngredient } from "./scale-recipe"

export type CookingAdjustmentReason =
  "UNCHANGED" | "ROUND_UP_TO_WHOLE_UNIT" | "ROUND_TO_PHYSICAL_STEP" | "MINIMUM_PHYSICAL_STEP"
export type CookingQuantityErrorCode =
  | "MISSING_QUANTITY_POLICY"
  | "INVALID_QUANTITY_POLICY"
  | "QUANTITY_POLICY_MISMATCH"
  | "INVALID_UNIT_CONVERSION"
  | "INVALID_COOKING_QUANTITY"
  | "MISSING_WHOLE_PIECE_CONVERSION"
export type CookingQuantityResult =
  | {
      readonly ok: true
      readonly value: {
        readonly actualIngredient: ScaledRecipeIngredient
        readonly theoreticalIngredient: ScaledRecipeIngredient
        readonly policyRef: {
          readonly id: string
          readonly contentHash: string
          readonly versionNumber: number
        }
        readonly adjustmentReason: CookingAdjustmentReason
      }
    }
  | { readonly ok: false; readonly error: { readonly code: CookingQuantityErrorCode } }

export function normalizeCookingQuantity(
  ingredient: ScaledRecipeIngredient,
  conversion: FoodFactUnitConversion,
  policy: FoodQuantityPolicyV1 | null
): CookingQuantityResult {
  const failure = (code: CookingQuantityErrorCode): CookingQuantityResult => ({
    ok: false,
    error: { code }
  })
  if (policy === null) return failure("MISSING_QUANTITY_POLICY")
  const step = parseCanonicalDecimal(policy.stepBaseQuantity, {
    allowNegative: false,
    allowZero: false
  })
  if (
    policy.version !== "food-quantity-v1" ||
    !Number.isSafeInteger(policy.versionNumber) ||
    policy.versionNumber < 1 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
      policy.id
    ) ||
    !/^[a-f0-9]{64}$/u.test(policy.contentHash) ||
    typeof policy.provenance !== "string" ||
    policy.provenance.trim().length === 0 ||
    !step.ok
  )
    return failure("INVALID_QUANTITY_POLICY")
  if (
    policy.foodFactVersionId !== ingredient.foodFactVersionId ||
    policy.baseUnitId !== ingredient.baseUnitId ||
    policy.baseUnitId !== conversion.foodBaseUnitId ||
    policy.baseDimension !== conversion.foodBaseDimension
  )
    return failure("QUANTITY_POLICY_MISMATCH")
  if (
    conversion.unitId !== ingredient.unitId ||
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
  const source = parseCanonicalDecimal(ingredient.sourceQuantity, {
    allowNegative: false,
    allowZero: false
  })
  const base = parseCanonicalDecimal(ingredient.baseQuantity, {
    allowNegative: false,
    allowZero: false
  })
  const gross = parseCanonicalDecimal(ingredient.grossGrams, {
    allowNegative: false,
    allowZero: false
  })
  if (
    !source.ok ||
    !base.ok ||
    !gross.ok ||
    !base.value.eq(
      roundDecimal(source.value.mul(conversion.baseQuantityPerUnit), 18, ROUND_HALF_UP)
    ) ||
    !gross.value.eq(roundDecimal(source.value.mul(conversion.grossGramsPerUnit), 18, ROUND_HALF_UP))
  )
    return failure("INVALID_COOKING_QUANTITY")
  let actual = base.value
    .div(step.value)
    .toDecimalPlaces(0, policy.rounding === "ceil" ? ROUND_CEIL : ROUND_HALF_UP)
    .mul(step.value)
  const minimum = actual.isZero()
  if (minimum) actual = step.value
  const sourceQuantity = roundDecimal(actual.div(conversion.baseQuantityPerUnit), 18, ROUND_HALF_UP)
  const baseQuantity = roundDecimal(actual, 18, ROUND_HALF_UP)
  const grossGrams = roundDecimal(
    actual.mul(conversion.grossGramsPerUnit).div(conversion.baseQuantityPerUnit),
    18,
    ROUND_HALF_UP
  )
  if (
    !new ExactDecimal(sourceQuantity).gt(0) ||
    !new ExactDecimal(grossGrams).gt(0) ||
    !parseCanonicalDecimal(baseQuantity).ok ||
    !parseCanonicalDecimal(sourceQuantity).ok ||
    !parseCanonicalDecimal(grossGrams).ok
  )
    return failure("INVALID_COOKING_QUANTITY")
  const adjustmentReason: CookingAdjustmentReason = actual.eq(base.value)
    ? "UNCHANGED"
    : minimum
      ? "MINIMUM_PHYSICAL_STEP"
      : policy.rounding === "ceil"
        ? "ROUND_UP_TO_WHOLE_UNIT"
        : "ROUND_TO_PHYSICAL_STEP"
  return {
    ok: true,
    value: {
      actualIngredient: { ...ingredient, sourceQuantity, baseQuantity, grossGrams },
      theoreticalIngredient: ingredient,
      policyRef: {
        id: policy.id,
        contentHash: policy.contentHash,
        versionNumber: policy.versionNumber
      },
      adjustmentReason
    }
  }
}
