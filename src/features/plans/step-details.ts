import type { IngredientLabels } from "./ingredient-labels"
import type { PlanRecipeIngredientView, PlanStepView } from "./planner-api"

const HEAT_LEVEL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  low: "Lửa nhỏ",
  medium: "Lửa vừa",
  high: "Lửa lớn"
})

/**
 * The conditions a step is cooked under, in the order a cook needs them.
 *
 * Only what the recipe actually says is shown. A step with no timer, no heat level and no
 * temperature produces an empty list rather than invented defaults: "lửa vừa" on a step that never
 * specified it would read as instruction, and a wrong one.
 */
export function stepConditions(step: PlanStepView): string[] {
  const conditions: string[] = []
  if (step.timerMinutes !== null) conditions.push(`${step.timerMinutes} phút`)
  if (step.heatLevel !== null) {
    conditions.push(HEAT_LEVEL_LABELS[step.heatLevel] ?? step.heatLevel)
  }
  if (step.temperatureCelsius !== null) conditions.push(`${step.temperatureCelsius}°C`)
  return conditions
}

/**
 * Names the ingredients a step reaches for.
 *
 * The identifiers are the fallback rather than the answer, as elsewhere on this page: a link the
 * recipe carries but the lookup cannot name is still shown, because dropping it would quietly tell
 * the cook a step uses fewer ingredients than it does.
 */
export function stepIngredientNames(
  step: PlanStepView,
  ingredients: readonly PlanRecipeIngredientView[],
  labels: IngredientLabels
): string[] {
  const foodIdByIngredient = new Map(
    ingredients.map((ingredient) => [ingredient.recipeIngredientId, ingredient.foodId])
  )
  return step.ingredientIds.map((ingredientId) => {
    const foodId = foodIdByIngredient.get(ingredientId)
    if (foodId === undefined) return ingredientId
    return labels.foodNames.get(foodId) ?? foodId
  })
}
