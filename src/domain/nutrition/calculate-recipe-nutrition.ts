import type { RequiredNutrientCode } from "@/domain/catalog/catalog"
import { REQUIRED_NUTRIENT_CODES } from "@/domain/catalog/catalog"
import {
  ExactDecimal,
  ROUND_HALF_UP,
  decimalToCanonical,
  parseCanonicalDecimal,
  roundDecimal
} from "@/domain/shared/decimal"

export interface RecipeNutritionIngredient {
  readonly recipeIngredientId: string
  readonly order: number
  readonly grossGrams: string
  readonly edibleFraction: string
  readonly nutrients: readonly {
    readonly nutrientCode: string
    readonly amountPer100g: string
  }[]
}

interface NutrientPresentation {
  readonly unitCode: "kcal" | "g" | "mg"
  readonly displayPrecision: number
}

const NUTRIENT_PRESENTATION: Readonly<Record<RequiredNutrientCode, NutrientPresentation>> = {
  energy_kcal: { unitCode: "kcal", displayPrecision: 0 },
  protein_g: { unitCode: "g", displayPrecision: 1 },
  carbohydrate_g: { unitCode: "g", displayPrecision: 1 },
  fat_g: { unitCode: "g", displayPrecision: 1 },
  fibre_g: { unitCode: "g", displayPrecision: 1 },
  sodium_mg: { unitCode: "mg", displayPrecision: 0 }
}

export type RecipeNutritionResult =
  | {
      readonly ok: true
      readonly value: {
        readonly totalEdibleGrams: string
        readonly nutrients: readonly {
          readonly nutrientCode: RequiredNutrientCode
          readonly rawAmount: string
          readonly displayAmount: string
          readonly unitCode: "kcal" | "g" | "mg"
          readonly coveragePercent: "100"
        }[]
      }
    }
  | {
      readonly ok: false
      readonly error:
        | { readonly code: "INVALID_NUTRITION_INPUT" | "INVALID_DECIMAL" }
        | {
            readonly code: "INCOMPLETE_NUTRITION"
            readonly nutrientCode: RequiredNutrientCode
            readonly coveragePercent: string
          }
    }

function simpleFailure(code: "INVALID_NUTRITION_INPUT" | "INVALID_DECIMAL"): RecipeNutritionResult {
  return { ok: false, error: { code } }
}

function parseNonNegative(value: string) {
  return parseCanonicalDecimal(value, {
    maxScale: 18,
    maxIntegerDigits: 34,
    allowNegative: false
  })
}

function parsePositiveFraction(value: string) {
  return parseCanonicalDecimal(value, {
    maxScale: 6,
    maxIntegerDigits: 1,
    allowNegative: false,
    allowZero: false
  })
}

export function calculateRecipeNutrition(
  input: readonly RecipeNutritionIngredient[]
): RecipeNutritionResult {
  if (input.length === 0) {
    return simpleFailure("INVALID_NUTRITION_INPUT")
  }

  const ingredients = [...input].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.recipeIngredientId < right.recipeIngredientId ? -1 : 1
  })
  const ingredientIds = new Set<string>()
  const orders = new Set<number>()
  const totals = new Map<RequiredNutrientCode, InstanceType<typeof ExactDecimal>>()
  const coveredGrams = new Map<RequiredNutrientCode, InstanceType<typeof ExactDecimal>>()
  let totalEdibleGrams = new ExactDecimal(0)

  for (const ingredient of ingredients) {
    if (
      ingredient.recipeIngredientId.length === 0 ||
      !Number.isSafeInteger(ingredient.order) ||
      ingredient.order < 1 ||
      ingredientIds.has(ingredient.recipeIngredientId) ||
      orders.has(ingredient.order)
    ) {
      return simpleFailure("INVALID_NUTRITION_INPUT")
    }

    const grossGrams = parseNonNegative(ingredient.grossGrams)
    const edibleFraction = parsePositiveFraction(ingredient.edibleFraction)
    if (!grossGrams.ok || !edibleFraction.ok || edibleFraction.value.greaterThan(1)) {
      return simpleFailure("INVALID_DECIMAL")
    }

    const nutrientCodes = ingredient.nutrients.map((nutrient) => nutrient.nutrientCode)
    if (new Set(nutrientCodes).size !== nutrientCodes.length) {
      return simpleFailure("INVALID_NUTRITION_INPUT")
    }

    ingredientIds.add(ingredient.recipeIngredientId)
    orders.add(ingredient.order)
    const edibleGrams = grossGrams.value.times(edibleFraction.value)
    totalEdibleGrams = totalEdibleGrams.plus(edibleGrams)

    for (const nutrientCode of REQUIRED_NUTRIENT_CODES) {
      const nutrient = ingredient.nutrients.find((item) => item.nutrientCode === nutrientCode)
      if (nutrient === undefined) continue

      const amountPer100g = parseNonNegative(nutrient.amountPer100g)
      if (!amountPer100g.ok) {
        return simpleFailure("INVALID_DECIMAL")
      }

      totals.set(
        nutrientCode,
        (totals.get(nutrientCode) ?? new ExactDecimal(0)).plus(
          edibleGrams.div(100).times(amountPer100g.value)
        )
      )
      coveredGrams.set(
        nutrientCode,
        (coveredGrams.get(nutrientCode) ?? new ExactDecimal(0)).plus(edibleGrams)
      )
    }
  }

  if (totalEdibleGrams.isZero()) {
    return simpleFailure("INVALID_NUTRITION_INPUT")
  }

  for (const nutrientCode of [...REQUIRED_NUTRIENT_CODES].sort()) {
    const covered = coveredGrams.get(nutrientCode) ?? new ExactDecimal(0)
    if (!covered.equals(totalEdibleGrams)) {
      return {
        ok: false,
        error: {
          code: "INCOMPLETE_NUTRITION",
          nutrientCode,
          coveragePercent: decimalToCanonical(covered.div(totalEdibleGrams).times(100))
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      totalEdibleGrams: decimalToCanonical(totalEdibleGrams),
      nutrients: [...REQUIRED_NUTRIENT_CODES].sort().map((nutrientCode) => {
        const amount = totals.get(nutrientCode) ?? new ExactDecimal(0)
        const presentation = NUTRIENT_PRESENTATION[nutrientCode]
        return {
          nutrientCode,
          rawAmount: decimalToCanonical(amount),
          displayAmount: roundDecimal(amount, presentation.displayPrecision, ROUND_HALF_UP),
          unitCode: presentation.unitCode,
          coveragePercent: "100" as const
        }
      })
    }
  }
}
