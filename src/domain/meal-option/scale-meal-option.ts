import type { MealOptionVersionInput, NormalizedMealOptionVersion } from "./meal-option.js"
import { validateMealOptionVersion } from "./validate-meal-option.js"
import {
  calculateAdultEquivalent,
  type PortionMemberGroupInput
} from "../portion/calculate-adult-equivalent.js"
import { PORTION_CONFIG_V1, type PortionConfigV1 } from "../portion/portion-config.js"
import type { FoodFactUnitConversion } from "../catalog/catalog.js"
import type { RecipeVersionInput } from "../recipe/recipe.js"
import {
  scaleRecipe,
  scaleRecipeForAdultEquivalent,
  type ScaleRecipeResult,
  type RecipeScaleErrorCode
} from "../recipe/scale-recipe.js"
import {
  ExactDecimal,
  decimalToCanonical,
  parseCanonicalDecimal,
  roundDecimal,
  ROUND_HALF_UP
} from "../shared/decimal.js"

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

  const result = scaleMealWithDemand(
    validation.value,
    demand.value.adultEquivalent,
    (recipe) => scaleRecipe(recipe, memberGroups, portionConfig),
    false
  )
  if (!result.ok) return result
  return {
    ok: true,
    value: {
      ...result.value,
      ingredients: result.value.ingredients.map((ingredient) => ({
        sourceId: ingredient.sourceId,
        mealOptionRecipeId: ingredient.mealOptionRecipeId,
        recipeIngredientId: ingredient.recipeIngredientId,
        foodId: ingredient.foodId,
        foodFactVersionId: ingredient.foodFactVersionId,
        baseUnitId: ingredient.baseUnitId,
        baseQuantity: ingredient.baseQuantity,
        grossGrams: ingredient.grossGrams,
        componentSortOrder: ingredient.componentSortOrder,
        ingredientOrder: ingredient.ingredientOrder
      }))
    }
  }
}

type LegacyMealValue = Extract<ScaleMealOptionResult, { ok: true }>["value"]
export type ExplicitMealIngredient = LegacyMealValue["ingredients"][number] & {
  readonly unitId: string
  readonly sourceQuantity: string
  readonly conversion: FoodFactUnitConversion
}
export type ExplicitMealScaleResult =
  | {
      readonly ok: true
      readonly value: Omit<LegacyMealValue, "ingredients"> & {
        readonly ingredients: readonly ExplicitMealIngredient[]
      }
    }
  | Extract<ScaleMealOptionResult, { ok: false }>

export function scaleMealOptionForAdultEquivalent(
  input: MealOptionVersionInput,
  adultEquivalent: string
): ExplicitMealScaleResult {
  const validation = validateMealOptionVersion(input)
  if (!validation.ok) return { ok: false, error: { code: "INVALID_MEAL_OPTION" } }
  const demand = parseCanonicalDecimal(adultEquivalent, { allowNegative: false, allowZero: false })
  if (!demand.ok) return { ok: false, error: { code: "INVALID_DECIMAL" } }
  return scaleMealWithDemand(
    validation.value,
    adultEquivalent,
    (recipe) => scaleRecipeForAdultEquivalent(recipe, adultEquivalent),
    true
  )
}

function scaleMealWithDemand(
  value: NormalizedMealOptionVersion,
  demand: string,
  scale: (recipe: RecipeVersionInput) => ScaleRecipeResult,
  canonical: boolean
): ExplicitMealScaleResult {
  const mealScaleFactor = new ExactDecimal(demand).div(value.yieldAdultEquivalent)
  const components: {
    mealOptionRecipeId: string
    mealRole: string
    sortOrder: number
    recipeId: string
    recipeVersionId: string
    recipeScaleFactor: string
  }[] = []
  const ingredients: ExplicitMealIngredient[] = []

  for (const component of value.components) {
    const scaledRecipe = scale(component.recipe)
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
      const conversion = component.recipe.ingredients.find(
        (source) => source.recipeIngredientId === ingredient.recipeIngredientId
      )?.conversion
      if (conversion === undefined || conversion === null)
        return { ok: false, error: { code: "MISSING_UNIT_CONVERSION" } }
      ingredients.push({
        sourceId: `${component.mealOptionRecipeId}:${ingredient.recipeIngredientId}`,
        unitId: ingredient.unitId,
        sourceQuantity: ingredient.sourceQuantity,
        conversion,
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
      mealOptionId: value.mealOptionId,
      mealOptionVersionId: value.mealOptionVersionId,
      adultEquivalent: demand,
      mealScaleFactor: canonical
        ? roundDecimal(mealScaleFactor, 18, ROUND_HALF_UP)
        : decimalToCanonical(mealScaleFactor),
      elapsedMinutes: value.elapsedMinutes,
      primaryProteinGroup: value.primaryProteinGroup,
      cookingStyleCodes: value.cookingStyleCodes,
      mainRecipeVersionIds: value.mainRecipeVersionIds,
      components,
      ingredients
    }
  }
}
