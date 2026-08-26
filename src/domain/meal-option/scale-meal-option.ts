import type { MealOptionVersionInput } from "@/domain/meal-option/meal-option"
import { validateMealOptionVersion } from "@/domain/meal-option/validate-meal-option"
import {
  calculateAdultEquivalent,
  type PortionMemberGroupInput
} from "@/domain/portion/calculate-adult-equivalent"
import { PORTION_CONFIG_V1, type PortionConfigV1 } from "@/domain/portion/portion-config"
import { scaleRecipe, type RecipeScaleErrorCode } from "@/domain/recipe/scale-recipe"
import { ExactDecimal, decimalToCanonical } from "@/domain/shared/decimal"

export type ScaleMealOptionResult =
  | {
      readonly ok: true
      readonly value: {
        readonly mealOptionId: string
        readonly mealOptionVersionId: string
        readonly adultEquivalent: string
        readonly mealScaleFactor: string
        readonly elapsedMinutes: number
        readonly primaryProteinGroup: string
        readonly cookingStyleCodes: readonly string[]
        readonly mainRecipeVersionIds: readonly string[]
        readonly components: readonly {
          readonly mealOptionRecipeId: string
          readonly mealRole: string
          readonly sortOrder: number
          readonly recipeId: string
          readonly recipeVersionId: string
          readonly recipeScaleFactor: string
        }[]
        readonly ingredients: readonly {
          readonly sourceId: string
          readonly mealOptionRecipeId: string
          readonly recipeIngredientId: string
          readonly foodId: string
          readonly foodFactVersionId: string
          readonly baseUnitId: string
          readonly baseQuantity: string
          readonly grossGrams: string
          readonly componentSortOrder: number
          readonly ingredientOrder: number
        }[]
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: RecipeScaleErrorCode | "INVALID_MEAL_OPTION" | "INVALID_MEMBER_TOTAL"
      }
    }

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

export function scaleMealOption(
  input: MealOptionVersionInput,
  memberGroups: readonly PortionMemberGroupInput[],
  portionConfig: PortionConfigV1 = PORTION_CONFIG_V1
): ScaleMealOptionResult {
  const validation = validateMealOptionVersion(input)
  if (!validation.ok) return { ok: false, error: { code: "INVALID_MEAL_OPTION" } }

  const demand = calculateAdultEquivalent(memberGroups, portionConfig)
  if (!demand.ok) return { ok: false, error: { code: demand.error.code } }

  const mealScaleFactor = new ExactDecimal(demand.value.adultEquivalent).div(
    validation.value.yieldAdultEquivalent
  )
  const components: {
    mealOptionRecipeId: string
    mealRole: string
    sortOrder: number
    recipeId: string
    recipeVersionId: string
    recipeScaleFactor: string
  }[] = []
  const ingredients: {
    sourceId: string
    mealOptionRecipeId: string
    recipeIngredientId: string
    foodId: string
    foodFactVersionId: string
    baseUnitId: string
    baseQuantity: string
    grossGrams: string
    componentSortOrder: number
    ingredientOrder: number
  }[] = []

  for (const component of validation.value.components) {
    const scaledRecipe = scaleRecipe(component.recipe, memberGroups, portionConfig)
    if (!scaledRecipe.ok) return scaledRecipe

    components.push({
      mealOptionRecipeId: component.mealOptionRecipeId,
      mealRole: component.mealRole,
      sortOrder: component.sortOrder,
      recipeId: component.recipeId,
      recipeVersionId: component.recipeVersionId,
      recipeScaleFactor: scaledRecipe.value.scaleFactor
    })
    for (const ingredient of scaledRecipe.value.ingredients) {
      ingredients.push({
        sourceId: `${component.mealOptionRecipeId}:${ingredient.recipeIngredientId}`,
        mealOptionRecipeId: component.mealOptionRecipeId,
        recipeIngredientId: ingredient.recipeIngredientId,
        foodId: ingredient.foodId,
        foodFactVersionId: ingredient.foodFactVersionId,
        baseUnitId: ingredient.baseUnitId,
        baseQuantity: ingredient.baseQuantity,
        grossGrams: ingredient.grossGrams,
        componentSortOrder: component.sortOrder,
        ingredientOrder: ingredient.order
      })
    }
  }

  ingredients.sort(
    (left, right) =>
      compareText(left.foodId, right.foodId) ||
      left.componentSortOrder - right.componentSortOrder ||
      left.ingredientOrder - right.ingredientOrder ||
      compareText(left.sourceId, right.sourceId)
  )

  return {
    ok: true,
    value: {
      mealOptionId: validation.value.mealOptionId,
      mealOptionVersionId: validation.value.mealOptionVersionId,
      adultEquivalent: demand.value.adultEquivalent,
      mealScaleFactor: decimalToCanonical(mealScaleFactor),
      elapsedMinutes: validation.value.elapsedMinutes,
      primaryProteinGroup: validation.value.primaryProteinGroup,
      cookingStyleCodes: validation.value.cookingStyleCodes,
      mainRecipeVersionIds: validation.value.mainRecipeVersionIds,
      components,
      ingredients
    }
  }
}
