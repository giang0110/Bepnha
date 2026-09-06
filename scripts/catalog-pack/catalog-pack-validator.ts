import { parseCanonicalDecimal } from "../../src/domain/shared/decimal.ts"
import { validateCatalogPackValue as validateCatalogPackValueCore } from "./catalog-pack-validator-core.ts"
import type { CatalogPackValidationCoreResult } from "./catalog-pack-validator-core.ts"
import type { CatalogPackDiagnostic } from "./catalog-pack-types.ts"

export type { CatalogPackValidationCoreResult } from "./catalog-pack-validator-core.ts"

const LAUNCH_DIETARY_TAG_CODES = new Set(["vegetarian"])
const ADDITIONAL_PLACEHOLDER_SOURCE = /^(?:pending|placeholder)$/iu

const LAUNCH_CATEGORY_ANCESTRY: Readonly<Record<string, readonly string[]>> = {
  food: ["food"],
  pork: ["pork", "food"],
  beef: ["beef", "food"],
  poultry: ["poultry", "food"],
  seafood: ["seafood", "food"],
  fish: ["fish", "seafood", "food"],
  crustacean: ["crustacean", "seafood", "food"],
  mollusc: ["mollusc", "seafood", "food"],
  egg: ["egg", "food"],
  dairy: ["dairy", "food"],
  tofu: ["tofu", "food"],
  vegetable: ["vegetable", "food"],
  staple: ["staple", "food"],
  seasoning: ["seasoning", "food"]
}

function nutrientAmountMatchesAuthority(value: string): boolean {
  return parseCanonicalDecimal(value, {
    maxScale: 6,
    maxIntegerDigits: 12,
    allowNegative: false
  }).ok
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function addErrorIfMissing(
  diagnostics: CatalogPackDiagnostic[],
  code: string,
  path: string,
  message: string
): void {
  if (diagnostics.some((diagnostic) => diagnostic.code === code && diagnostic.path === path)) {
    return
  }

  diagnostics.push({ severity: "error", code, path, message })
}

export function validateCatalogPackValue(value: unknown): CatalogPackValidationCoreResult {
  const result = validateCatalogPackValueCore(value)
  if (result.pack === null) return result

  const diagnostics = [...result.diagnostics]
  const blockers = new Set(result.blockers)

  result.pack.foods.forEach((food, foodIndex) => {
    const foodPath = `$.foods[${foodIndex}].fact`
    const expectedAncestry = LAUNCH_CATEGORY_ANCESTRY[food.fact.categoryCode]
    if (
      expectedAncestry !== undefined &&
      !sameStrings(food.fact.categoryAncestry, expectedAncestry)
    ) {
      addErrorIfMissing(
        diagnostics,
        "INVALID_CATEGORY_ANCESTRY",
        `${foodPath}.categoryAncestry`,
        "Category ancestry must exactly match the reviewed launch category tree"
      )
    }

    food.fact.dietaryTagCodes.forEach((code, tagIndex) => {
      if (LAUNCH_DIETARY_TAG_CODES.has(code)) return

      addErrorIfMissing(
        diagnostics,
        "REFERENCE_CODE_UNSUPPORTED",
        `${foodPath}.dietaryTagCodes[${tagIndex}]`,
        `Unsupported launch dietary tag: ${code}`
      )
      blockers.add("REFERENCE_CODE_UNSUPPORTED")
    })

    if (food.fact.conversions.length === 0) {
      addErrorIfMissing(
        diagnostics,
        "FOOD_CONVERSION_REQUIRED",
        `${foodPath}.conversions`,
        "Published food facts must contain at least one reviewed unit conversion"
      )
    }

    food.fact.nutrients.forEach((nutrient, nutrientIndex) => {
      if (nutrientAmountMatchesAuthority(nutrient.amountPer100g)) return

      addErrorIfMissing(
        diagnostics,
        "INVALID_DECIMAL",
        `${foodPath}.nutrients[${nutrientIndex}].amountPer100g`,
        "Nutrient amount must match the authoritative decimal limits"
      )
    })
  })

  result.pack.recipes.forEach((recipe, recipeIndex) => {
    const versionPath = `$.recipes[${recipeIndex}].version`

    if (recipe.version.ingredients.length === 0) {
      addErrorIfMissing(
        diagnostics,
        "RECIPE_INGREDIENT_REQUIRED",
        `${versionPath}.ingredients`,
        "Published recipes must contain at least one ingredient"
      )
    }
    if (recipe.version.steps.length === 0) {
      addErrorIfMissing(
        diagnostics,
        "RECIPE_STEP_REQUIRED",
        `${versionPath}.steps`,
        "Published recipes must contain at least one instruction step"
      )
    }

    const foodCodes = recipe.version.ingredients.map((ingredient) => ingredient.foodCode)
    if (new Set(foodCodes).size !== foodCodes.length) {
      addErrorIfMissing(
        diagnostics,
        "DUPLICATE_RECIPE_FOOD",
        `${versionPath}.ingredients`,
        "A published recipe must not use the same food more than once"
      )
    }

    recipe.version.steps.forEach((step, stepIndex) => {
      if (step.timerMinutes === null || step.timerMinutes <= recipe.version.elapsedMinutes) return

      addErrorIfMissing(
        diagnostics,
        "INVALID_DURATION",
        `${versionPath}.steps[${stepIndex}].timerMinutes`,
        "Step timer minutes must not exceed recipe elapsed minutes"
      )
    })
  })

  if (result.pack.priceBook.prices.length === 0) {
    addErrorIfMissing(
      diagnostics,
      "PRICE_ROW_REQUIRED",
      "$.priceBook.prices",
      "A production price book must contain at least one reviewed price row"
    )
  }

  result.pack.priceBook.prices.forEach((price, priceIndex) => {
    if (!ADDITIONAL_PLACEHOLDER_SOURCE.test(price.sourceReference)) return

    addErrorIfMissing(
      diagnostics,
      "INVALID_SOURCE_REFERENCE",
      `$.priceBook.prices[${priceIndex}].sourceReference`,
      "Price source reference must be concrete rather than a placeholder"
    )
  })

  return { ...result, diagnostics, blockers: [...blockers] }
}
