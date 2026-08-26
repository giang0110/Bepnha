import type { FoodFactUnitConversion } from "@/domain/catalog/catalog"
import {
  calculateAdultEquivalent,
  type PortionMemberGroupInput
} from "@/domain/portion/calculate-adult-equivalent"
import type { PortionConfigV1 } from "@/domain/portion/portion-config"
import { PORTION_CONFIG_V1 } from "@/domain/portion/portion-config"
import { normalizeRecipeSteps, type RecipeVersionInput } from "@/domain/recipe/recipe"
import {
  ExactDecimal,
  ROUND_HALF_UP,
  decimalToCanonical,
  parseCanonicalDecimal,
  type ExactDecimalValue
} from "@/domain/shared/decimal"

export type RecipeScaleErrorCode =
  | "INVALID_PORTION_CONFIG"
  | "UNSUPPORTED_MEMBER_BAND"
  | "INVALID_MEMBER_GROUPS"
  | "INVALID_MEMBER_TOTAL"
  | "INVALID_RECIPE_YIELD"
  | "INVALID_RECIPE_INGREDIENTS"
  | "INVALID_RECIPE_STEPS"
  | "MISSING_UNIT_CONVERSION"
  | "DIMENSION_MISMATCH"
  | "INVALID_DECIMAL"

export interface ScaledRecipeIngredient {
  readonly recipeIngredientId: string
  readonly foodId: string
  readonly foodFactVersionId: string
  readonly order: number
  readonly unitId: string
  readonly sourceQuantity: string
  readonly baseUnitId: string
  readonly baseQuantity: string
  readonly grossGrams: string
}

export type ScaleRecipeResult =
  | {
      readonly ok: true
      readonly value: {
        readonly recipeId: string
        readonly recipeVersionId: string
        readonly adultEquivalent: string
        readonly scaleFactor: string
        readonly ingredients: readonly ScaledRecipeIngredient[]
      }
    }
  | { readonly ok: false; readonly error: { readonly code: RecipeScaleErrorCode } }

function failure(code: RecipeScaleErrorCode): ScaleRecipeResult {
  return { ok: false, error: { code } }
}

function parsePositive(value: string) {
  return parseCanonicalDecimal(value, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false,
    allowZero: false
  })
}

function conversionIsConsistent(conversion: FoodFactUnitConversion): boolean {
  const sourceFactor = parsePositive(conversion.sourceToDimensionBase)
  const baseFactor = parsePositive(conversion.foodBaseUnitToDimensionBase)
  const baseQuantity = parsePositive(conversion.baseQuantityPerUnit)
  const grossGrams = parsePositive(conversion.grossGramsPerUnit)
  const displayStep = parsePositive(conversion.displayStep)
  if (!sourceFactor.ok || !baseFactor.ok || !baseQuantity.ok || !grossGrams.ok || !displayStep.ok) {
    return false
  }

  if (
    conversion.sourceDimension === conversion.foodBaseDimension &&
    !baseQuantity.value.equals(sourceFactor.value.div(baseFactor.value))
  ) {
    return false
  }

  return conversion.sourceDimension !== "mass" || grossGrams.value.equals(sourceFactor.value)
}

function validateIngredients(recipe: RecipeVersionInput): RecipeScaleErrorCode | null {
  if (recipe.ingredients.length === 0) {
    return "INVALID_RECIPE_INGREDIENTS"
  }

  const ingredientIds = new Set<string>()
  const foodIds = new Set<string>()
  const orders = new Set<number>()

  for (const ingredient of recipe.ingredients) {
    if (
      ingredient.recipeIngredientId.length === 0 ||
      ingredient.foodId.length === 0 ||
      ingredient.foodFactVersionId.length === 0 ||
      !Number.isSafeInteger(ingredient.order) ||
      ingredient.order < 1 ||
      ingredientIds.has(ingredient.recipeIngredientId) ||
      foodIds.has(ingredient.foodId) ||
      orders.has(ingredient.order) ||
      !parsePositive(ingredient.quantity).ok
    ) {
      return "INVALID_RECIPE_INGREDIENTS"
    }

    if (ingredient.conversion === null) {
      return "MISSING_UNIT_CONVERSION"
    }

    if (!conversionIsConsistent(ingredient.conversion)) {
      return "DIMENSION_MISMATCH"
    }

    ingredientIds.add(ingredient.recipeIngredientId)
    foodIds.add(ingredient.foodId)
    orders.add(ingredient.order)
  }

  if ([...orders].some((order) => order > recipe.ingredients.length)) {
    return "INVALID_RECIPE_INGREDIENTS"
  }

  return null
}

export function scaleRecipe(
  recipe: RecipeVersionInput,
  memberGroups: readonly PortionMemberGroupInput[],
  portionConfig: PortionConfigV1 = PORTION_CONFIG_V1
): ScaleRecipeResult {
  const adultEquivalent = calculateAdultEquivalent(memberGroups, portionConfig)
  if (!adultEquivalent.ok) {
    return failure(adultEquivalent.error.code)
  }

  const recipeYield = parsePositive(recipe.yieldAdultEquivalent)
  if (!recipeYield.ok) {
    return failure("INVALID_RECIPE_YIELD")
  }

  if (
    !Number.isSafeInteger(recipe.activeMinutes) ||
    recipe.activeMinutes < 1 ||
    !Number.isSafeInteger(recipe.elapsedMinutes) ||
    recipe.elapsedMinutes < recipe.activeMinutes ||
    recipe.elapsedMinutes > 180
  ) {
    return failure("INVALID_RECIPE_STEPS")
  }

  const ingredientError = validateIngredients(recipe)
  if (ingredientError !== null) {
    return failure(ingredientError)
  }

  const normalizedSteps = normalizeRecipeSteps(
    recipe.steps,
    recipe.ingredients.map((ingredient) => ingredient.recipeIngredientId),
    recipe.elapsedMinutes
  )
  if (!normalizedSteps.ok) {
    return failure(normalizedSteps.error.code)
  }

  const adultEquivalentDecimal = new ExactDecimal(adultEquivalent.value.adultEquivalent)
  const scaleFactor = adultEquivalentDecimal.div(recipeYield.value)
  const ingredients: ScaledRecipeIngredient[] = []

  for (const ingredient of [...recipe.ingredients].sort(
    (left, right) => left.order - right.order
  )) {
    const quantity = parsePositive(ingredient.quantity)
    if (!quantity.ok || ingredient.conversion === null) {
      return failure("INVALID_DECIMAL")
    }

    const baseFactor = parsePositive(ingredient.conversion.baseQuantityPerUnit)
    const gramsFactor = parsePositive(ingredient.conversion.grossGramsPerUnit)
    if (!baseFactor.ok || !gramsFactor.ok) {
      return failure("INVALID_DECIMAL")
    }

    const sourceQuantity = quantity.value.times(scaleFactor)
    ingredients.push({
      recipeIngredientId: ingredient.recipeIngredientId,
      foodId: ingredient.foodId,
      foodFactVersionId: ingredient.foodFactVersionId,
      order: ingredient.order,
      unitId: ingredient.conversion.unitId,
      sourceQuantity: decimalToCanonical(sourceQuantity),
      baseUnitId: ingredient.conversion.foodBaseUnitId,
      baseQuantity: decimalToCanonical(sourceQuantity.times(baseFactor.value)),
      grossGrams: decimalToCanonical(sourceQuantity.times(gramsFactor.value))
    })
  }

  return {
    ok: true,
    value: {
      recipeId: recipe.recipeId,
      recipeVersionId: recipe.recipeVersionId,
      adultEquivalent: adultEquivalent.value.adultEquivalent,
      scaleFactor: decimalToCanonical(scaleFactor),
      ingredients
    }
  }
}

function roundToQuantum(value: ExactDecimalValue, quantum: ExactDecimalValue) {
  const rounded = value.div(quantum).toDecimalPlaces(0, ROUND_HALF_UP).times(quantum)
  return rounded.isZero() && value.isPositive() ? quantum : rounded
}

export function projectIngredientDisplayQuantity(
  ingredient: ScaledRecipeIngredient,
  conversion: FoodFactUnitConversion
): string {
  const raw = new ExactDecimal(ingredient.baseQuantity)
  let quantum: ExactDecimalValue

  if (conversion.foodBaseDimension === "mass") {
    quantum = new ExactDecimal(raw.greaterThanOrEqualTo(1000) ? 10 : 5)
  } else if (conversion.foodBaseDimension === "volume") {
    quantum = new ExactDecimal(5)
  } else {
    const parsedStep = parsePositive(conversion.displayStep)
    if (!parsedStep.ok) {
      throw new Error("INVALID_DISPLAY_STEP")
    }
    quantum = parsedStep.value
  }

  return decimalToCanonical(roundToQuantum(raw, quantum))
}
