import type { FoodFactUnitConversion } from "../catalog/catalog.js"

export interface RecipeIngredientInput {
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly quantity: string
  readonly order: number
  readonly conversion: FoodFactUnitConversion | null
}

/**
 * How hot a step is cooked, when the recipe says.
 *
 * A home kitchen's stovetop is set by eye, not by degrees, so a heat level is the honest unit for
 * most steps. An oven or a pan of frying oil is the opposite: only a number means anything there.
 * Neither derives from the other, so a step carries whichever its own instruction needs.
 */
export type RecipeHeatLevel = "low" | "medium" | "high"

export const RECIPE_HEAT_LEVELS: readonly RecipeHeatLevel[] = Object.freeze([
  "low",
  "medium",
  "high"
])

export function isRecipeHeatLevel(value: unknown): value is RecipeHeatLevel {
  return RECIPE_HEAT_LEVELS.includes(value as RecipeHeatLevel)
}

export interface RecipeStepInput {
  readonly order: number
  readonly instructionVi: string
  readonly timerMinutes: number | null
  /** `null` means the recipe has not said, which is not the same as medium. */
  readonly heatLevel: RecipeHeatLevel | null
  /** Below 40 is not cooking; above 300 is beyond a domestic oven or a pan of oil. */
  readonly temperatureCelsius: number | null
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
      heatLevel: step.heatLevel,
      temperatureCelsius: step.temperatureCelsius,
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
          step.timerMinutes > elapsedMinutes)) ||
      (step.heatLevel !== null && !isRecipeHeatLevel(step.heatLevel)) ||
      (step.temperatureCelsius !== null &&
        (!Number.isSafeInteger(step.temperatureCelsius) ||
          step.temperatureCelsius < 40 ||
          step.temperatureCelsius > 300))
    ) {
      return invalidSteps()
    }
  }

  return { ok: true, value: normalized }
}
