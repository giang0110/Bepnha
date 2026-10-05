import type { IngredientLabels } from "./ingredient-labels"
import { mealRoleLabel } from "./cooking-sequence"
import type { PlanItemView } from "./planner-api"
import { stepIngredientDetails, type StepIngredientDetail } from "./step-ingredient-details"

export interface PrePrepDishGroup {
  readonly dishLabel: string
  readonly ingredients: readonly StepIngredientDetail[]
}

export interface ExtractPrePrepOptions {
  readonly skipStaple?: boolean
}

/**
 * Extracts and deduplicates all ingredients for a meal, grouped by dish (meal role).
 * This allows cooks to gather, wash, chop, and marinate all ingredients before cooking begins.
 */
export function extractMealPrePrepGroups(
  item: PlanItemView,
  labels: IngredientLabels,
  options: ExtractPrePrepOptions = {}
): readonly PrePrepDishGroup[] {
  let dishes = [...item.components].sort((left, right) => left.sortOrder - right.sortOrder)
  if (options.skipStaple) {
    dishes = dishes.filter((dish) => dish.mealRole !== "staple")
  }

  return dishes.map((dish) => {
    const stepIngredientIds = dish.recipe.steps.flatMap((step) => step.ingredientIds)
    const recipeIngredientIds = dish.recipe.ingredients.map((ing) => ing.recipeIngredientId)
    const allIds = Array.from(new Set([...recipeIngredientIds, ...stepIngredientIds]))

    const details = stepIngredientDetails({
      ingredientIds: allIds,
      recipeIngredients: dish.recipe.ingredients,
      scaledIngredients: item.scaledIngredients,
      labels,
      ...(dish.mealOptionRecipeId === undefined
        ? {}
        : { mealOptionRecipeId: dish.mealOptionRecipeId })
    })

    return {
      dishLabel: mealRoleLabel(dish.mealRole),
      ingredients: details
    }
  })
}
