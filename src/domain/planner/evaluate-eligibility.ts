import {
  REQUIRED_NUTRIENT_CODES,
  SUPPORTED_ALLERGEN_CODES,
  type RecipeIngredientLineage
} from "@/domain/catalog/catalog"
import { evaluateHardRules } from "@/domain/catalog/evaluate-hard-rules"
import { isHardRuleCode } from "@/domain/catalog/hard-rule-mapping"
import { scaleMealOption } from "@/domain/meal-option/scale-meal-option"
import { validateMealOptionVersion } from "@/domain/meal-option/validate-meal-option"
import { calculateRecipeNutrition } from "@/domain/nutrition/calculate-recipe-nutrition"
import { calculatePurchaseBasket } from "@/domain/pricing/calculate-purchase-basket"
import type { CanonicalFoodRequirement, PurchaseBasketLine } from "@/domain/pricing/pricing"

import type { NormalizedPlannerInputV1, PlannerCandidateInput } from "./planner-input"
import type { PlannerFatalCode, PlannerWarning } from "./planner-outcome"

export interface EligibleMealOption {
  readonly mealOptionId: string
  readonly mealOptionVersionId: string
  readonly mealOptionContentHash: string
  readonly mealOptionCode: string
  readonly mealOptionNameVi: string
  readonly elapsedMinutes: number
  readonly adultEquivalent: string
  readonly mealScaleFactor: string
  readonly mealOption: PlannerCandidateInput["mealOption"]
  readonly scaledIngredients: readonly {
    readonly sourceId: string
    readonly foodId: string
    readonly foodFactVersionId: string
    readonly baseUnitId: string
    readonly baseQuantity: string
    readonly grossGrams: string
  }[]
  readonly nutrition: Extract<
    ReturnType<typeof calculateRecipeNutrition>,
    { readonly ok: true }
  >["value"]
  readonly primaryProteinGroup: string
  readonly cookingStyleCodes: readonly string[]
  readonly mainRecipeVersionIds: readonly string[]
  readonly roles: readonly string[]
  readonly foodCategoryCodes: readonly string[]
  readonly foodCategoryCodesByFood: Readonly<Record<string, readonly string[]>>
  readonly requirements: readonly CanonicalFoodRequirement[]
  readonly prices: PlannerCandidateInput["prices"]
  readonly basketLines: readonly PurchaseBasketLine[]
  readonly warnings: readonly PlannerWarning[]
}

export type EligibilityResult =
  | {
      readonly ok: true
      readonly value: {
        readonly eligible: readonly EligibleMealOption[]
        readonly warnings: readonly PlannerWarning[]
        readonly rejected: readonly EligibilityRejection[]
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: PlannerFatalCode
        readonly ruleCode?: string
        readonly scope?: string
      }
    }

export interface EligibilityRejection {
  readonly mealOptionVersionId: string
  readonly stage: 1 | 2 | 3 | 4 | 5 | 6 | 7
  readonly code: string
}

const HASH_PATTERN = /^[0-9a-f]{64}$/u

function reject(
  candidate: PlannerCandidateInput,
  stage: EligibilityRejection["stage"],
  code: string
): EligibilityRejection {
  return { mealOptionVersionId: candidate.mealOption.mealOptionVersionId, stage, code }
}

function completeLineage(candidate: PlannerCandidateInput): boolean {
  return candidate.ingredientLineage.every(
    (lineage) =>
      lineage.foodFactStatus === "published" &&
      HASH_PATTERN.test(lineage.foodFactContentHash) &&
      lineage.categoryAncestry.length > 0 &&
      new Set(lineage.allergenAssessments.map((item) => item.allergenCode)).size ===
        SUPPORTED_ALLERGEN_CODES.length &&
      SUPPORTED_ALLERGEN_CODES.every((code) =>
        lineage.allergenAssessments.some(
          (assessment) => assessment.allergenCode === code && assessment.status !== "unknown"
        )
      )
  )
}

function nutritionComplete(candidate: PlannerCandidateInput): boolean {
  return candidate.ingredientLineage.every(
    (lineage) =>
      new Set(lineage.nutrients.map((item) => item.nutrientCode)).size ===
        REQUIRED_NUTRIENT_CODES.length &&
      REQUIRED_NUTRIENT_CODES.every((code) =>
        lineage.nutrients.some((nutrient) => nutrient.nutrientCode === code)
      )
  )
}

function diagnostic(rejections: readonly EligibilityRejection[]): PlannerFatalCode {
  if (rejections.some((item) => item.stage === 2 || item.stage === 6)) {
    return "INCOMPLETE_CATALOG_LINEAGE"
  }
  if (rejections.some((item) => item.stage === 5)) return "NO_USABLE_PRICE"
  return "HARD_FILTER_EXHAUSTED"
}

export function evaluatePlannerEligibility(input: NormalizedPlannerInputV1): EligibilityResult {
  const unsupported = input.hardRuleCodes.find(
    (ruleCode) => !isHardRuleCode(ruleCode) || ruleCode === "allergen_other"
  )
  if (unsupported !== undefined) {
    return { ok: false, error: { code: "UNSUPPORTED_HARD_RULE", ruleCode: unsupported } }
  }

  const eligible: EligibleMealOption[] = []
  const rejected: EligibilityRejection[] = []
  for (const candidate of input.candidates) {
    if (
      candidate.identityStatus !== "published" ||
      candidate.mealOption.status !== "published" ||
      candidate.priceBookStatus !== "published" ||
      !HASH_PATTERN.test(candidate.mealOptionContentHash) ||
      candidate.mealOption.contentHash !== candidate.mealOptionContentHash ||
      !HASH_PATTERN.test(candidate.priceBookContentHash) ||
      candidate.mealOption.components.some(
        (component) =>
          component.recipeStatus !== "published" || !HASH_PATTERN.test(component.recipeContentHash)
      )
    ) {
      rejected.push(reject(candidate, 1, "PUBLICATION_INVALID"))
      continue
    }
    if (!completeLineage(candidate)) {
      rejected.push(reject(candidate, 2, "INCOMPLETE_LINEAGE"))
      continue
    }
    const hardRuleInput: RecipeIngredientLineage[] = candidate.ingredientLineage.map((lineage) => ({
      recipeIngredientId: `${lineage.mealOptionRecipeId}:${lineage.recipeIngredientId}`,
      allergenAssessments: lineage.allergenAssessments,
      categoryAncestry: lineage.categoryAncestry,
      dietaryTagCodes: lineage.dietaryTagCodes
    }))
    const hardRules = evaluateHardRules(input.hardRuleCodes, hardRuleInput)
    if (hardRules.status !== "eligible") {
      rejected.push(
        reject(candidate, hardRules.status === "unknown_lineage" ? 2 : 3, hardRules.status)
      )
      continue
    }
    if (candidate.mealOption.elapsedMinutes > input.maxElapsedMinutes) {
      rejected.push(reject(candidate, 4, "TIME_LIMIT_EXCEEDED"))
      continue
    }
    const scaled = scaleMealOption(candidate.mealOption, input.memberGroups, input.portionConfig)
    if (!scaled.ok) {
      rejected.push(reject(candidate, 6, scaled.error.code))
      continue
    }
    const requirements: CanonicalFoodRequirement[] = scaled.value.ingredients.map((ingredient) => ({
      sourceId: ingredient.sourceId,
      foodId: ingredient.foodId,
      foodFactVersionId: ingredient.foodFactVersionId,
      baseUnitId: ingredient.baseUnitId,
      requiredBaseQuantity: ingredient.baseQuantity
    }))
    const basket = calculatePurchaseBasket(
      requirements,
      candidate.prices,
      input.calculationDate,
      input.priceFreshnessConfig
    )
    if (!basket.ok) {
      rejected.push(reject(candidate, 5, basket.error.code))
      continue
    }
    if (!nutritionComplete(candidate)) {
      rejected.push(reject(candidate, 6, "INCOMPLETE_NUTRITION"))
      continue
    }
    const lineageBySource = new Map(
      candidate.ingredientLineage.map((item) => [
        `${item.mealOptionRecipeId}:${item.recipeIngredientId}`,
        item
      ])
    )
    const nutritionInput = scaled.value.ingredients.flatMap((ingredient, index) => {
      const ingredientLineage = lineageBySource.get(ingredient.sourceId)
      return ingredientLineage === undefined
        ? []
        : [
            {
              recipeIngredientId: ingredient.sourceId,
              order: index + 1,
              grossGrams: ingredient.grossGrams,
              edibleFraction: ingredientLineage.edibleFraction,
              nutrients: ingredientLineage.nutrients
            }
          ]
    })
    if (nutritionInput.length !== scaled.value.ingredients.length) {
      rejected.push(reject(candidate, 6, "INCOMPLETE_NUTRITION_LINEAGE"))
      continue
    }
    const nutrition = calculateRecipeNutrition(nutritionInput)
    if (!nutrition.ok) {
      rejected.push(reject(candidate, 6, nutrition.error.code))
      continue
    }
    const structure = validateMealOptionVersion(candidate.mealOption)
    if (!structure.ok) {
      rejected.push(reject(candidate, 7, structure.error.code))
      continue
    }
    eligible.push({
      mealOptionId: structure.value.mealOptionId,
      mealOptionVersionId: structure.value.mealOptionVersionId,
      mealOptionContentHash: structure.value.contentHash,
      mealOptionCode: candidate.mealOptionCode,
      mealOptionNameVi: candidate.mealOptionNameVi,
      elapsedMinutes: structure.value.elapsedMinutes,
      adultEquivalent: scaled.value.adultEquivalent,
      mealScaleFactor: scaled.value.mealScaleFactor,
      mealOption: candidate.mealOption,
      scaledIngredients: scaled.value.ingredients,
      nutrition: nutrition.value,
      primaryProteinGroup: structure.value.primaryProteinGroup,
      cookingStyleCodes: structure.value.cookingStyleCodes,
      mainRecipeVersionIds: structure.value.mainRecipeVersionIds,
      roles: structure.value.components.map((component) => component.mealRole).sort(),
      foodCategoryCodes: [
        ...new Set(candidate.ingredientLineage.flatMap((lineage) => lineage.categoryAncestry))
      ].sort(),
      foodCategoryCodesByFood: Object.fromEntries(
        candidate.ingredientLineage
          .map((lineage) => [lineage.foodId, [...lineage.categoryAncestry].sort()] as const)
          .sort(([left], [right]) => left.localeCompare(right))
      ),
      requirements,
      prices: candidate.prices,
      basketLines: basket.value.lines,
      warnings: basket.value.warnings
    })
  }

  rejected.sort(
    (left, right) =>
      left.mealOptionVersionId.localeCompare(right.mealOptionVersionId) ||
      left.stage - right.stage ||
      left.code.localeCompare(right.code)
  )
  if (eligible.length === 0) {
    return {
      ok: false,
      error: {
        code: diagnostic(rejected),
        scope: "EXACT_LOADED_CATALOG_SNAPSHOT"
      }
    }
  }
  const warnings = eligible
    .flatMap((candidate) => candidate.warnings)
    .sort((left, right) => {
      if (left.code !== "STALE_PRICE" || right.code !== "STALE_PRICE") return 0
      return (
        left.foodId.localeCompare(right.foodId) || left.foodPriceId.localeCompare(right.foodPriceId)
      )
    })
  return { ok: true, value: { eligible, warnings, rejected } }
}
