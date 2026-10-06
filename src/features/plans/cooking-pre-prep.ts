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
 * Formats a rice portion in grams into human-friendly Vietnamese kitchen estimates.
 * Standard Vietnamese rice cooker cup or rice bowl leveled ~ 150g raw rice.
 */
export function formatRiceHouseholdEstimateVi(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return ""
  const cups = grams / 150
  const rounded = Math.round(cups * 2) / 2
  const cupStr = rounded.toString().replace(".", ",")
  const label = rounded === 1 ? "1 bát/cốc" : `${cupStr} bát/cốc`
  return `~${label} đong`
}

/**
 * Extracts a concise summary of the staple (rice) ingredient requirement for display in banners and preps.
 * e.g. "Gạo tẻ — 400 g (~2,5 bát/cốc đong)"
 */
export function extractStapleRiceSummary(
  item: PlanItemView,
  labels: IngredientLabels
): string | null {
  const stapleDish = item.components.find((c) => c.mealRole === "staple")
  if (!stapleDish) return null

  const recipeIngredientIds = stapleDish.recipe.ingredients.map((ing) => ing.recipeIngredientId)
  const details = stepIngredientDetails({
    ingredientIds: recipeIngredientIds,
    recipeIngredients: stapleDish.recipe.ingredients,
    scaledIngredients: item.scaledIngredients,
    labels,
    ...(stapleDish.mealOptionRecipeId === undefined
      ? {}
      : { mealOptionRecipeId: stapleDish.mealOptionRecipeId })
  })

  if (details.length === 0) return null

  return details
    .map((d) => {
      const sourceId = stapleDish.mealOptionRecipeId
        ? `${stapleDish.mealOptionRecipeId}:${d.recipeIngredientId}`
        : null
      const scaled = sourceId
        ? item.scaledIngredients.find((ing) => ing.sourceId === sourceId)
        : undefined

      if (scaled) {
        const unit = labels.unitCodes.get(scaled.baseUnitId)
        const name = labels.foodNames.get(scaled.foodId) ?? ""
        const isRice = /\bgạo\b/iu.test(name) || /\bgao\b/iu.test(name)
        if (isRice && (unit === "g" || unit === "gam")) {
          const grams = Number.parseFloat(scaled.baseQuantity.replace(",", "."))
          const estimate = formatRiceHouseholdEstimateVi(grams)
          if (estimate) {
            return `${d.label} (${estimate})`
          }
        }
      }
      return d.label
    })
    .join(", ")
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

    // If this is the staple dish (rice), add household cup estimate to rice ingredients
    const enhancedDetails =
      dish.mealRole === "staple"
        ? details.map((d) => {
            const sourceId = dish.mealOptionRecipeId
              ? `${dish.mealOptionRecipeId}:${d.recipeIngredientId}`
              : null
            const scaled = sourceId
              ? item.scaledIngredients.find((ing) => ing.sourceId === sourceId)
              : undefined

            if (scaled) {
              const unit = labels.unitCodes.get(scaled.baseUnitId)
              const name = labels.foodNames.get(scaled.foodId) ?? ""
              const isRice = /\bgạo\b/iu.test(name) || /\bgao\b/iu.test(name)
              if (isRice && (unit === "g" || unit === "gam")) {
                const grams = Number.parseFloat(scaled.baseQuantity.replace(",", "."))
                const estimate = formatRiceHouseholdEstimateVi(grams)
                if (estimate) {
                  return { ...d, label: `${d.label} (${estimate})` }
                }
              }
            }
            return d
          })
        : details

    return {
      dishLabel: mealRoleLabel(dish.mealRole),
      ingredients: enhancedDetails
    }
  })
}
