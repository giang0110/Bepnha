import { describeIngredient, type IngredientLabels } from "./ingredient-labels"
import type { PlanIngredientView, PlanRecipeIngredientView } from "./planner-api"

export type StepIngredientDetail =
  | {
      readonly recipeIngredientId: string
      readonly status: "exact"
      readonly label: string
    }
  | {
      readonly recipeIngredientId: string
      readonly status: "unavailable"
      readonly label: string
    }

interface Input {
  readonly ingredientIds: readonly string[]
  readonly mealOptionRecipeId?: string
  readonly recipeIngredients: readonly PlanRecipeIngredientView[]
  readonly scaledIngredients: readonly PlanIngredientView[]
  readonly labels: IngredientLabels
}

function unavailableLabel(foodId: string, labels: IngredientLabels): string {
  return `${labels.foodNames.get(foodId) ?? foodId} — chưa có lượng đã tính`
}

/**
 * Joins editorial step references to the exact scaled source emitted by `scaleMealOption`.
 *
 * Recipe ingredient ids alone are not globally unique within a meal. The component id is part of
 * the authoritative source key, so missing or mismatched lineage is shown as unavailable rather
 * than borrowing a plausible-looking quantity from another dish.
 */
export function stepIngredientDetails(input: Input): StepIngredientDetail[] {
  const recipeById = new Map(
    input.recipeIngredients.map((ingredient) => [ingredient.recipeIngredientId, ingredient])
  )
  const scaledBySource = new Map(
    input.scaledIngredients.map((ingredient) => [ingredient.sourceId, ingredient])
  )

  return input.ingredientIds.flatMap<StepIngredientDetail>((recipeIngredientId) => {
    const recipeIngredient = recipeById.get(recipeIngredientId)
    if (recipeIngredient === undefined) return []
    const sourceId =
      input.mealOptionRecipeId === undefined
        ? null
        : `${input.mealOptionRecipeId}:${recipeIngredientId}`
    const scaled = sourceId === null ? undefined : scaledBySource.get(sourceId)
    if (scaled === undefined || scaled.foodId !== recipeIngredient.foodId) {
      return [
        {
          recipeIngredientId,
          status: "unavailable" as const,
          label: unavailableLabel(recipeIngredient.foodId, input.labels)
        }
      ]
    }
    return [
      {
        recipeIngredientId,
        status: "exact" as const,
        label: describeIngredient(scaled, input.labels)
      }
    ]
  })
}
