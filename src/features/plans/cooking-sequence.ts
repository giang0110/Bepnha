import type { IngredientLabels } from "./ingredient-labels"
import type { PlanItemView } from "./planner-api"
import { stepConditions, stepIngredientNames } from "./step-details"

/**
 * What each dish in a meal is called. A component's `mealRole` is a code; a cook reads a word.
 *
 * Shared rather than duplicated: both the meal details panel and the cooking screen name the same
 * dishes, and two copies would drift the first time a role is added.
 */
export const MEAL_ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  staple: "Cơm",
  main: "Món mặn",
  vegetable: "Rau",
  soup: "Canh"
})

export function mealRoleLabel(role: string): string {
  return MEAL_ROLE_LABELS[role] ?? role
}

export interface CookingStep {
  /** Stable across renders: dish position and step order, both of which the plan fixes. */
  readonly key: string
  readonly dishLabel: string
  /** 1-based, so it can be shown as "Món 2 / 4" without arithmetic at the call site. */
  readonly dishNumber: number
  readonly dishCount: number
  readonly stepNumber: number
  readonly stepCount: number
  readonly instructionVi: string
  readonly conditions: readonly string[]
  readonly ingredientNames: readonly string[]
  readonly timerMinutes: number | null
}

/**
 * Flattens a meal into the order it is actually cooked.
 *
 * Dishes in their `sortOrder`, and within each dish the steps in their own order — never
 * interleaved. That interleaving was a real defect once: a global re-sort by step number put "cho
 * gạo và nước vào nồi" between two steps of the fried chicken, which is not a sequence anyone can
 * follow.
 *
 * The result is flat because cooking is: one instruction at a time, carrying which dish it belongs
 * to and where it sits, so a cook who looks up knows where they are.
 */
export function cookingSequence(item: PlanItemView, labels: IngredientLabels): CookingStep[] {
  const dishes = [...item.components].sort((left, right) => left.sortOrder - right.sortOrder)

  return dishes.flatMap((dish, dishIndex) => {
    const steps = [...dish.recipe.steps].sort((left, right) => left.order - right.order)

    return steps.map((step, stepIndex) => ({
      key: `${dishIndex}:${step.order}`,
      dishLabel: mealRoleLabel(dish.mealRole),
      dishNumber: dishIndex + 1,
      dishCount: dishes.length,
      stepNumber: stepIndex + 1,
      stepCount: steps.length,
      instructionVi: step.instructionVi,
      conditions: stepConditions(step),
      ingredientNames: stepIngredientNames(step, dish.recipe.ingredients, labels),
      timerMinutes: typeof step.timerMinutes === "number" ? step.timerMinutes : null
    }))
  })
}
