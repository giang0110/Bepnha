import type { CatalogReadRepository } from "@/application/catalog/catalog-read-repository"
import {
  canonicalRecipeCalculationInput,
  type RecipeCalculationInputV1
} from "@/domain/calculation/recipe-calculation-input"
import { REQUIRED_NUTRIENT_CODES, SUPPORTED_ALLERGEN_CODES } from "@/domain/catalog/catalog"
import { calculateAdultEquivalent } from "@/domain/portion/calculate-adult-equivalent"
import { PORTION_CONFIG_V1 } from "@/domain/portion/portion-config"
import { PRICE_FRESHNESS_CONFIG_V1 } from "@/domain/pricing/pricing"
import { parseCanonicalDecimal } from "@/domain/shared/decimal"

export interface LoadRecipeCalculationRequest {
  readonly recipeVersionId: string
  readonly priceBookId: string
  readonly calculationDate: string
  readonly memberGroups: readonly {
    readonly memberKind: string
    readonly ageBand: string
    readonly memberCount: number
  }[]
}

export type LoadRecipeCalculationResult =
  | {
      readonly ok: true
      readonly value: {
        readonly input: RecipeCalculationInputV1
        readonly canonicalInput: string
      }
    }
  | {
      readonly ok: false
      readonly reason:
        | "NOT_FOUND"
        | "DEPENDENCY_UNAVAILABLE"
        | "UNPUBLISHED_CATALOG"
        | "CATALOG_ID_MISMATCH"
        | "INCOMPLETE_CATALOG_LINEAGE"
        | "DUPLICATE_CATALOG_CHILD"
        | "INVALID_CALCULATION_REQUEST"
    }

const HASH_PATTERN = /^[0-9a-f]{64}$/u
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

function isPositiveDecimal(value: string): boolean {
  return parseCanonicalDecimal(value, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false,
    allowZero: false
  }).ok
}

function dateIsValid(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

export async function loadRecipeCalculationInput(
  repository: CatalogReadRepository,
  request: LoadRecipeCalculationRequest
): Promise<LoadRecipeCalculationResult> {
  const household = calculateAdultEquivalent(request.memberGroups)
  if (
    !household.ok ||
    !dateIsValid(request.calculationDate) ||
    request.recipeVersionId.length === 0 ||
    request.priceBookId.length === 0
  ) {
    return { ok: false, reason: "INVALID_CALCULATION_REQUEST" }
  }

  const loaded = await repository.getPublishedRecipeCalculation(
    request.recipeVersionId,
    request.priceBookId
  )
  if (!loaded.ok) return loaded

  const record = loaded.value
  if (
    record.recipePublicationStatus !== "published" ||
    record.priceBookPublicationStatus !== "published"
  ) {
    return { ok: false, reason: "UNPUBLISHED_CATALOG" }
  }
  if (
    record.recipe.recipeVersionId !== request.recipeVersionId ||
    record.priceBook.priceBookId !== request.priceBookId
  ) {
    return { ok: false, reason: "CATALOG_ID_MISMATCH" }
  }
  if (
    !HASH_PATTERN.test(record.recipe.contentHash) ||
    !HASH_PATTERN.test(record.priceBook.contentHash) ||
    record.recipe.ingredients.length === 0
  ) {
    return { ok: false, reason: "INCOMPLETE_CATALOG_LINEAGE" }
  }

  const ingredientIds = record.recipe.ingredients.map((ingredient) => ingredient.recipeIngredientId)
  const ingredientFoodIds = record.recipe.ingredients.map((ingredient) => ingredient.food.foodId)
  const ingredientOrders = record.recipe.ingredients.map((ingredient) => String(ingredient.order))
  if (
    hasDuplicate(ingredientIds) ||
    hasDuplicate(ingredientFoodIds) ||
    hasDuplicate(ingredientOrders)
  ) {
    return { ok: false, reason: "DUPLICATE_CATALOG_CHILD" }
  }

  for (const ingredient of record.recipe.ingredients) {
    const nutrientCodes = ingredient.fact.nutrients.map((nutrient) => nutrient.nutrientCode)
    const allergenCodes = ingredient.fact.allergenAssessments.map(
      (assessment) => assessment.allergenCode
    )
    if (
      !HASH_PATTERN.test(ingredient.fact.contentHash) ||
      !isPositiveDecimal(ingredient.quantity) ||
      !isPositiveDecimal(ingredient.fact.edibleFraction) ||
      ingredient.fact.conversion.unitId !== ingredient.unitId ||
      !isPositiveDecimal(ingredient.fact.conversion.baseQuantityPerUnit) ||
      !isPositiveDecimal(ingredient.fact.conversion.grossGramsPerUnit) ||
      hasDuplicate(nutrientCodes) ||
      hasDuplicate(allergenCodes) ||
      REQUIRED_NUTRIENT_CODES.some((code) => !nutrientCodes.includes(code)) ||
      SUPPORTED_ALLERGEN_CODES.some((code) => !allergenCodes.includes(code)) ||
      ingredient.fact.allergenAssessments.some((assessment) => assessment.status === "unknown") ||
      ingredient.fact.categoryAncestry.length === 0
    ) {
      return { ok: false, reason: "INCOMPLETE_CATALOG_LINEAGE" }
    }
  }

  const priceFoodIds = record.priceBook.prices.map((price) => price.foodId)
  if (hasDuplicate(priceFoodIds)) {
    return { ok: false, reason: "DUPLICATE_CATALOG_CHILD" }
  }
  const requiredFoodIds = new Set(ingredientFoodIds)
  const relevantPrices = record.priceBook.prices.filter((price) =>
    requiredFoodIds.has(price.foodId)
  )
  if (
    relevantPrices.length !== requiredFoodIds.size ||
    relevantPrices.some(
      (price) =>
        !isPositiveDecimal(price.packageBaseQuantity) ||
        !Number.isSafeInteger(price.packagePriceVnd) ||
        price.packagePriceVnd <= 0 ||
        !dateIsValid(price.observedAt)
    )
  ) {
    return { ok: false, reason: "INCOMPLETE_CATALOG_LINEAGE" }
  }

  const input: RecipeCalculationInputV1 = {
    calculationVersion: "recipe-calculation-v1",
    portionConfig: PORTION_CONFIG_V1,
    priceFreshnessConfig: PRICE_FRESHNESS_CONFIG_V1,
    calculationDate: request.calculationDate,
    memberGroups: household.value.memberGroups,
    recipe: record.recipe,
    priceBook: { ...record.priceBook, prices: relevantPrices }
  }

  return {
    ok: true,
    value: { input, canonicalInput: canonicalRecipeCalculationInput(input) }
  }
}
