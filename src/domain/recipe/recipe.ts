import type { FoodFactUnitConversion } from "@/domain/catalog/catalog"

export interface RecipeIngredientInput {
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly quantity: string
  readonly order: number
  readonly conversion: FoodFactUnitConversion | null
}

export interface RecipeStepInput {
  readonly order: number
  readonly instructionVi: string
  readonly timerMinutes: number | null
  readonly ingredientIds: readonly string[]
}

export type NormalizedRecipeStep = RecipeStepInput

export interface RecipeVersionInput {
  readonly recipeId: string
  readonly recipeVersionId: string
  readonly yieldAdultEquivalent: string
  readonly activeMinutes: number
  readonly elapsedMinutes: number
  readonly ingredients: readonly RecipeIngredientInput[]
  readonly steps: readonly RecipeStepInput[]
}

export type RecipeStepNormalizationResult =
  | { readonly ok: true; readonly value: readonly NormalizedRecipeStep[] }
  | { readonly ok: false; readonly error: { readonly code: "INVALID_RECIPE_STEPS" } }

function invalidSteps(): RecipeStepNormalizationResult {
  return { ok: false, error: { code: "INVALID_RECIPE_STEPS" } }
}

export function normalizeRecipeSteps(
  steps: readonly RecipeStepInput[],
  recipeIngredientIds: readonly string[],
  elapsedMinutes: number
): RecipeStepNormalizationResult {
  if (!Number.isSafeInteger(elapsedMinutes) || elapsedMinutes < 1 || elapsedMinutes > 180) {
    return invalidSteps()
  }

  const knownIngredientIds = new Set(recipeIngredientIds)
  if (knownIngredientIds.size !== recipeIngredientIds.length) {
    return invalidSteps()
  }

  const normalized = [...steps]
    .sort((left, right) => left.order - right.order)
    .map((step) => ({
      order: step.order,
      instructionVi: step.instructionVi.trim(),
      timerMinutes: step.timerMinutes,
      ingredientIds: [...step.ingredientIds].sort()
    }))

  if (normalized.length === 0) {
    return invalidSteps()
  }

  for (const [index, step] of normalized.entries()) {
    const instructionLength = Array.from(step.instructionVi).length
    const ingredientIds = new Set(step.ingredientIds)
    if (
      step.order !== index + 1 ||
      instructionLength < 1 ||
      instructionLength > 500 ||
      ingredientIds.size !== step.ingredientIds.length ||
      step.ingredientIds.some((ingredientId) => !knownIngredientIds.has(ingredientId)) ||
      (step.timerMinutes !== null &&
        (!Number.isSafeInteger(step.timerMinutes) ||
          step.timerMinutes < 0 ||
          step.timerMinutes > elapsedMinutes))
    ) {
      return invalidSteps()
    }
  }

  return { ok: true, value: normalized }
}
