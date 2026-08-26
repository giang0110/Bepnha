import {
  REQUIRED_NUTRIENT_CODES,
  SUPPORTED_ALLERGEN_CODES,
  type FoodFactLineageInput
} from "@/domain/catalog/catalog"
import { parseCanonicalDecimal } from "@/domain/shared/decimal"

export type CatalogNormalizationErrorCode =
  | "INVALID_DECIMAL"
  | "DUPLICATE_CATALOG_ENTRY"
  | "UNKNOWN_ALLERGEN_LINEAGE"
  | "INCOMPLETE_NUTRITION"

export type NormalizeFoodFactLineageResult =
  | { readonly ok: true; readonly value: FoodFactLineageInput }
  | { readonly ok: false; readonly error: { readonly code: CatalogNormalizationErrorCode } }

function failure(code: CatalogNormalizationErrorCode): NormalizeFoodFactLineageResult {
  return { ok: false, error: { code } }
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

export function normalizeFoodFactLineage(
  input: FoodFactLineageInput
): NormalizeFoodFactLineageResult {
  const edibleFraction = parseCanonicalDecimal(input.edibleFraction, {
    maxScale: 6,
    maxIntegerDigits: 1,
    allowNegative: false,
    allowZero: false
  })
  if (!edibleFraction.ok || edibleFraction.value.greaterThan(1)) {
    return failure("INVALID_DECIMAL")
  }

  const allergenCodes = input.allergenAssessments.map((assessment) => assessment.allergenCode)
  const nutrientCodes = input.nutrients.map((nutrient) => nutrient.nutrientCode)
  if (
    hasDuplicate(allergenCodes) ||
    hasDuplicate(nutrientCodes) ||
    hasDuplicate(input.categoryAncestry) ||
    hasDuplicate(input.dietaryTagCodes)
  ) {
    return failure("DUPLICATE_CATALOG_ENTRY")
  }

  if (
    SUPPORTED_ALLERGEN_CODES.some((code) => !allergenCodes.includes(code)) ||
    input.allergenAssessments.some(
      (assessment) =>
        !SUPPORTED_ALLERGEN_CODES.some((code) => code === assessment.allergenCode) ||
        assessment.status === "unknown"
    )
  ) {
    return failure("UNKNOWN_ALLERGEN_LINEAGE")
  }

  if (
    REQUIRED_NUTRIENT_CODES.some((code) => !nutrientCodes.includes(code)) ||
    input.nutrients.some(
      (nutrient) =>
        !parseCanonicalDecimal(nutrient.amountPer100g, {
          maxScale: 6,
          maxIntegerDigits: 12,
          allowNegative: false
        }).ok
    )
  ) {
    return failure("INCOMPLETE_NUTRITION")
  }

  if (input.categoryAncestry.length === 0) {
    return failure("UNKNOWN_ALLERGEN_LINEAGE")
  }

  return {
    ok: true,
    value: {
      ...input,
      allergenAssessments: [...input.allergenAssessments].sort((left, right) =>
        left.allergenCode < right.allergenCode ? -1 : 1
      ),
      nutrients: [...input.nutrients].sort((left, right) =>
        left.nutrientCode < right.nutrientCode ? -1 : 1
      ),
      categoryAncestry: [...input.categoryAncestry].sort(),
      dietaryTagCodes: [...input.dietaryTagCodes].sort()
    }
  }
}
