import { describe, expect, test } from "vitest"

import { calculateRecipeNutrition } from "@/domain/nutrition/calculate-recipe-nutrition"

const nutrients = [
  { nutrientCode: "energy_kcal", amountPer100g: "100" },
  { nutrientCode: "protein_g", amountPer100g: "10" },
  { nutrientCode: "carbohydrate_g", amountPer100g: "20" },
  { nutrientCode: "fat_g", amountPer100g: "5" },
  { nutrientCode: "fibre_g", amountPer100g: "2" },
  { nutrientCode: "sodium_mg", amountPer100g: "50" }
] as const

const ingredient = {
  recipeIngredientId: "ingredient-tofu",
  order: 1,
  grossGrams: "200",
  edibleFraction: "0.8",
  nutrients
} as const

function expectNutrition(input: Parameters<typeof calculateRecipeNutrition>[0]) {
  const result = calculateRecipeNutrition(input)

  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}

describe("calculateRecipeNutrition", () => {
  test("calculates gross-to-edible nutrition and rounds presentation only", () => {
    const result = expectNutrition([ingredient])

    expect(result.totalEdibleGrams).toBe("160")
    expect(result.nutrients).toEqual([
      {
        nutrientCode: "carbohydrate_g",
        rawAmount: "32",
        displayAmount: "32",
        unitCode: "g",
        coveragePercent: "100"
      },
      {
        nutrientCode: "energy_kcal",
        rawAmount: "160",
        displayAmount: "160",
        unitCode: "kcal",
        coveragePercent: "100"
      },
      {
        nutrientCode: "fat_g",
        rawAmount: "8",
        displayAmount: "8",
        unitCode: "g",
        coveragePercent: "100"
      },
      {
        nutrientCode: "fibre_g",
        rawAmount: "3.2",
        displayAmount: "3.2",
        unitCode: "g",
        coveragePercent: "100"
      },
      {
        nutrientCode: "protein_g",
        rawAmount: "16",
        displayAmount: "16",
        unitCode: "g",
        coveragePercent: "100"
      },
      {
        nutrientCode: "sodium_mg",
        rawAmount: "80",
        displayAmount: "80",
        unitCode: "mg",
        coveragePercent: "100"
      }
    ])
  })

  test("distinguishes an explicit assessed zero from a missing row", () => {
    const explicitZero = expectNutrition([
      {
        ...ingredient,
        nutrients: ingredient.nutrients.map((item) =>
          item.nutrientCode === "energy_kcal" ? { ...item, amountPer100g: "0" } : item
        )
      }
    ])
    expect(
      explicitZero.nutrients.find((item) => item.nutrientCode === "energy_kcal")
    ).toMatchObject({
      rawAmount: "0",
      coveragePercent: "100"
    })

    const missing = calculateRecipeNutrition([
      {
        ...ingredient,
        nutrients: ingredient.nutrients.filter((item) => item.nutrientCode !== "energy_kcal")
      }
    ])
    expect(missing).toEqual({
      ok: false,
      error: {
        code: "INCOMPLETE_NUTRITION",
        nutrientCode: "energy_kcal",
        coveragePercent: "0"
      }
    })
  })

  test("calculates weight-aware partial coverage without substituting zero", () => {
    const result = calculateRecipeNutrition([
      ingredient,
      {
        ...ingredient,
        recipeIngredientId: "ingredient-water",
        order: 2,
        grossGrams: "40",
        edibleFraction: "1",
        nutrients: ingredient.nutrients.filter((item) => item.nutrientCode !== "protein_g")
      }
    ])

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INCOMPLETE_NUTRITION",
        nutrientCode: "protein_g",
        coveragePercent: "80"
      }
    })
  })

  test("sums volume/count-derived gross grams in stable ingredient order", () => {
    const first = expectNutrition([
      { ...ingredient, recipeIngredientId: "volume", order: 1, grossGrams: "250" },
      { ...ingredient, recipeIngredientId: "count", order: 2, grossGrams: "110" }
    ])
    const second = expectNutrition([
      { ...ingredient, recipeIngredientId: "count", order: 2, grossGrams: "110" },
      { ...ingredient, recipeIngredientId: "volume", order: 1, grossGrams: "250" }
    ])

    expect(first.totalEdibleGrams).toBe("288")
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  test("does not let instruction or traceability changes alter nutrition", () => {
    const firstRecipe = {
      steps: [{ instructionVi: "Rắc mè.", ingredientIds: [] }],
      ingredients: [ingredient]
    }
    const secondRecipe = {
      steps: [{ instructionVi: "Dọn món.", ingredientIds: ["ingredient-tofu"] }],
      ingredients: [ingredient]
    }

    expect(calculateRecipeNutrition(firstRecipe.ingredients)).toEqual(
      calculateRecipeNutrition(secondRecipe.ingredients)
    )
  })
})
