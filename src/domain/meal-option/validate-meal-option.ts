import {
  MEAL_OPTION_ROLES,
  type MealOptionValidationErrorCode,
  type MealOptionValidationResult,
  type MealOptionVersionInput
} from "@/domain/meal-option/meal-option"
import { ExactDecimal, parseCanonicalDecimal } from "@/domain/shared/decimal"

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u

function failure(code: MealOptionValidationErrorCode): MealOptionValidationResult {
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

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

export function validateMealOptionVersion(
  input: MealOptionVersionInput
): MealOptionValidationResult {
  if (input.mealOptionId.length === 0 || input.mealOptionVersionId.length === 0) {
    return failure("INVALID_MEAL_OPTION_IDENTITY")
  }
  if (
    !Number.isSafeInteger(input.versionNumber) ||
    input.versionNumber < 1 ||
    !SHA_256_PATTERN.test(input.contentHash)
  ) {
    return failure("INVALID_MEAL_OPTION_VERSION")
  }

  const mealYield = parsePositive(input.yieldAdultEquivalent)
  if (!mealYield.ok) return failure("INVALID_MEAL_OPTION_YIELD")
  if (
    !Number.isSafeInteger(input.activeMinutes) ||
    input.activeMinutes < 1 ||
    !Number.isSafeInteger(input.elapsedMinutes) ||
    input.elapsedMinutes < input.activeMinutes ||
    input.elapsedMinutes > 180
  ) {
    return failure("INVALID_MEAL_OPTION_TIME")
  }
  if (input.components.length === 0) return failure("INVALID_MEAL_OPTION_COMPONENTS")

  const componentIds = new Set<string>()
  const recipeIds = new Set<string>()
  const recipeVersionIds = new Set<string>()
  const sortOrders = new Set<number>()
  let hasMain = false

  for (const component of input.components) {
    if (
      component.mealOptionRecipeId.length === 0 ||
      componentIds.has(component.mealOptionRecipeId) ||
      recipeIds.has(component.recipeId) ||
      recipeVersionIds.has(component.recipeVersionId) ||
      !Number.isSafeInteger(component.sortOrder) ||
      component.sortOrder < 1 ||
      sortOrders.has(component.sortOrder) ||
      !MEAL_OPTION_ROLES.includes(component.mealRole)
    ) {
      return failure("INVALID_MEAL_OPTION_COMPONENTS")
    }
    if (
      component.recipeId !== component.recipe.recipeId ||
      component.recipeVersionId !== component.recipe.recipeVersionId ||
      !Number.isSafeInteger(component.recipeVersionNumber) ||
      component.recipeVersionNumber < 1 ||
      component.recipeStatus !== "published" ||
      !SHA_256_PATTERN.test(component.recipeContentHash)
    ) {
      return failure("INVALID_RECIPE_VERSION_PIN")
    }

    const multiplier = parsePositive(component.quantityMultiplier)
    const recipeYield = parsePositive(component.recipe.yieldAdultEquivalent)
    if (!multiplier.ok || !recipeYield.ok) {
      return failure("INVALID_MEAL_OPTION_COMPONENTS")
    }
    if (!new ExactDecimal(recipeYield.value).times(multiplier.value).equals(mealYield.value)) {
      return failure("MEAL_OPTION_YIELD_MISMATCH")
    }

    componentIds.add(component.mealOptionRecipeId)
    recipeIds.add(component.recipeId)
    recipeVersionIds.add(component.recipeVersionId)
    sortOrders.add(component.sortOrder)
    hasMain ||= component.mealRole === "main"
  }

  if ([...sortOrders].some((order) => order > input.components.length)) {
    return failure("INVALID_MEAL_OPTION_COMPONENTS")
  }
  if (!hasMain) return failure("MISSING_MAIN_COMPONENT")

  const tagIds = new Set<string>()
  const tagKeys = new Set<string>()
  for (const tag of input.tags) {
    const key = `${tag.kind}:${tag.code}`
    if (
      tag.tagId.length === 0 ||
      tag.code.length === 0 ||
      tagIds.has(tag.tagId) ||
      tagKeys.has(key)
    ) {
      return failure("INVALID_MEAL_OPTION_TAGS")
    }
    tagIds.add(tag.tagId)
    tagKeys.add(key)
  }

  const proteinTags = input.tags.filter((tag) => tag.kind === "protein_hint")
  if (proteinTags.length !== 1) return failure("INVALID_PROTEIN_HINT")
  const cookingStyleCodes = input.tags
    .filter((tag) => tag.kind === "cooking_style")
    .map((tag) => tag.code)
    .sort(compareText)
  if (cookingStyleCodes.length === 0) return failure("MISSING_COOKING_STYLE")

  const components = [...input.components].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || compareText(left.recipeVersionId, right.recipeVersionId)
  )
  const tags = [...input.tags].sort(
    (left, right) =>
      compareText(left.kind, right.kind) ||
      compareText(left.code, right.code) ||
      compareText(left.tagId, right.tagId)
  )

  return {
    ok: true,
    value: {
      ...input,
      components,
      tags,
      primaryProteinGroup: proteinTags[0]!.code,
      cookingStyleCodes,
      mainRecipeVersionIds: components
        .filter((component) => component.mealRole === "main")
        .map((component) => component.recipeVersionId)
        .sort(compareText)
    }
  }
}
