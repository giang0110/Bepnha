import { describe, expect, test } from "vitest"

import { normalizeRecipeSteps } from "@/domain/recipe/recipe"
import { projectIngredientDisplayQuantity, scaleRecipe } from "@/domain/recipe/scale-recipe"

const household = [
  { memberKind: "adult", ageBand: "adult", memberCount: 2 },
  { memberKind: "child", ageBand: "4_6", memberCount: 1 },
  { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
] as const

const gramConversion = {
  unitId: "unit-g",
  unitCode: "g",
  sourceDimension: "mass",
  sourceToDimensionBase: "1",
  foodBaseUnitId: "unit-g",
  foodBaseDimension: "mass",
  foodBaseUnitToDimensionBase: "1",
  baseQuantityPerUnit: "1",
  grossGramsPerUnit: "1",
  displayStep: "5"
} as const

const baseRecipe = {
  recipeId: "recipe-rice",
  recipeVersionId: "recipe-rice-v1",
  yieldAdultEquivalent: "4",
  activeMinutes: 10,
  elapsedMinutes: 20,
  ingredients: [
    {
      recipeIngredientId: "ingredient-rice",
      foodId: "food-rice",
      foodFactVersionId: "food-rice-v1",
      quantity: "500",
      order: 1,
      conversion: gramConversion
    }
  ],
  steps: [
    {
      order: 1,
      instructionVi: "Vo gạo.",
      timerMinutes: null,
      ingredientIds: ["ingredient-rice"]
    }
  ]
} as const

function expectScaled(recipe: Parameters<typeof scaleRecipe>[0] = baseRecipe) {
  const result = scaleRecipe(recipe, household)

  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Expected recipe to scale, received ${result.error.code}`)
  }

  return result.value
}

describe("scaleRecipe", () => {
  test("scales the golden recipe using exact decimal arithmetic", () => {
    const result = expectScaled()

    expect(result.adultEquivalent).toBe("3.4")
    expect(result.scaleFactor).toBe("0.85")
    expect(result.ingredients).toEqual([
      {
        recipeIngredientId: "ingredient-rice",
        foodId: "food-rice",
        foodFactVersionId: "food-rice-v1",
        order: 1,
        unitId: "unit-g",
        sourceQuantity: "425",
        baseUnitId: "unit-g",
        baseQuantity: "425",
        grossGrams: "425"
      }
    ])
  })

  test("handles volume, count, and explicit cross-dimension conversions", () => {
    const result = expectScaled({
      ...baseRecipe,
      yieldAdultEquivalent: "3.4",
      steps: [{ ...baseRecipe.steps[0], ingredientIds: [] }],
      ingredients: [
        {
          ...baseRecipe.ingredients[0],
          recipeIngredientId: "water",
          foodId: "food-water",
          foodFactVersionId: "water-v1",
          quantity: "250",
          order: 1,
          conversion: {
            unitId: "unit-ml",
            unitCode: "ml",
            sourceDimension: "volume",
            sourceToDimensionBase: "1",
            foodBaseUnitId: "unit-ml",
            foodBaseDimension: "volume",
            foodBaseUnitToDimensionBase: "1",
            baseQuantityPerUnit: "1",
            grossGramsPerUnit: "1",
            displayStep: "5"
          }
        },
        {
          ...baseRecipe.ingredients[0],
          recipeIngredientId: "egg",
          foodId: "food-egg",
          foodFactVersionId: "egg-v1",
          quantity: "2",
          order: 2,
          conversion: {
            unitId: "unit-item",
            unitCode: "item",
            sourceDimension: "count",
            sourceToDimensionBase: "1",
            foodBaseUnitId: "unit-item",
            foodBaseDimension: "count",
            foodBaseUnitToDimensionBase: "1",
            baseQuantityPerUnit: "1",
            grossGramsPerUnit: "55",
            displayStep: "1"
          }
        },
        {
          ...baseRecipe.ingredients[0],
          recipeIngredientId: "oil",
          foodId: "food-oil",
          foodFactVersionId: "oil-v1",
          quantity: "2",
          order: 3,
          conversion: {
            unitId: "unit-tbsp",
            unitCode: "tbsp",
            sourceDimension: "volume",
            sourceToDimensionBase: "15",
            foodBaseUnitId: "unit-g",
            foodBaseDimension: "mass",
            foodBaseUnitToDimensionBase: "1",
            baseQuantityPerUnit: "13.5",
            grossGramsPerUnit: "13.5",
            displayStep: "1"
          }
        }
      ]
    })

    expect(
      result.ingredients.map(({ baseQuantity, grossGrams }) => ({ baseQuantity, grossGrams }))
    ).toEqual([
      { baseQuantity: "250", grossGrams: "250" },
      { baseQuantity: "2", grossGrams: "110" },
      { baseQuantity: "27", grossGrams: "27" }
    ])
  })

  test.each([
    ["0", "INVALID_RECIPE_YIELD"],
    ["-1", "INVALID_RECIPE_YIELD"],
    ["not-a-decimal", "INVALID_RECIPE_YIELD"]
  ] as const)("rejects invalid yield %s", (yieldAdultEquivalent, code) => {
    expect(scaleRecipe({ ...baseRecipe, yieldAdultEquivalent }, household)).toEqual({
      ok: false,
      error: { code }
    })
  })

  test("rejects missing or inconsistent conversions", () => {
    expect(
      scaleRecipe(
        {
          ...baseRecipe,
          ingredients: [{ ...baseRecipe.ingredients[0], conversion: null }]
        },
        household
      )
    ).toEqual({ ok: false, error: { code: "MISSING_UNIT_CONVERSION" } })

    expect(
      scaleRecipe(
        {
          ...baseRecipe,
          ingredients: [
            {
              ...baseRecipe.ingredients[0],
              conversion: { ...gramConversion, baseQuantityPerUnit: "2" }
            }
          ]
        },
        household
      )
    ).toEqual({ ok: false, error: { code: "DIMENSION_MISMATCH" } })
  })

  test("keeps raw quantities exact when display projection uses a minimum quantum", () => {
    const result = expectScaled({
      ...baseRecipe,
      yieldAdultEquivalent: "3.4",
      ingredients: [{ ...baseRecipe.ingredients[0], quantity: "0.1" }]
    })
    const ingredient = result.ingredients[0]

    expect(ingredient?.baseQuantity).toBe("0.1")
    expect(projectIngredientDisplayQuantity(ingredient!, gramConversion)).toBe("5")
    expect(ingredient?.baseQuantity).toBe("0.1")
  })

  test("does not let editorial instruction changes alter calculated quantities", () => {
    const first = expectScaled(baseRecipe)
    const second = expectScaled({
      ...baseRecipe,
      steps: [
        {
          order: 1,
          instructionVi: "Nấu gạo đến khi chín mềm.",
          timerMinutes: 15,
          ingredientIds: []
        }
      ]
    })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})

describe("normalizeRecipeSteps", () => {
  test("trims normal Vietnamese instructions and keeps optional traceability", () => {
    expect(
      normalizeRecipeSteps(
        [
          {
            order: 1,
            instructionVi: "  Phi thơm hành rồi đảo đều.  ",
            timerMinutes: 2,
            ingredientIds: ["oil"]
          }
        ],
        ["oil"],
        20
      )
    ).toEqual({
      ok: true,
      value: [
        {
          order: 1,
          instructionVi: "Phi thơm hành rồi đảo đều.",
          timerMinutes: 2,
          ingredientIds: ["oil"]
        }
      ]
    })
  })

  test.each(
    [
      [{ order: 1, instructionVi: " ", timerMinutes: null, ingredientIds: [] }],
      [{ order: 1, instructionVi: "a".repeat(501), timerMinutes: null, ingredientIds: [] }],
      [{ order: 2, instructionVi: "Nấu chín.", timerMinutes: null, ingredientIds: [] }],
      [{ order: 1, instructionVi: "Nấu chín.", timerMinutes: 21, ingredientIds: [] }],
      [{ order: 1, instructionVi: "Nấu chín.", timerMinutes: null, ingredientIds: ["missing"] }]
    ].map((steps) => [steps] as const)
  )("rejects invalid ordered editorial steps", (steps) => {
    expect(normalizeRecipeSteps(steps, ["oil"], 20)).toEqual({
      ok: false,
      error: { code: "INVALID_RECIPE_STEPS" }
    })
  })
})
