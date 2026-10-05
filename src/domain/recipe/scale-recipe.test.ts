import { describe, expect, test } from "vitest"

import { REQUIRED_NUTRIENT_CODES } from "@/domain/catalog/catalog"
import { calculateRecipeNutrition } from "@/domain/nutrition/calculate-recipe-nutrition"
import { normalizeRecipeSteps } from "@/domain/recipe/recipe"
import {
  projectIngredientDisplayQuantity,
  scaleRecipe,
  scaleRecipeForAdultEquivalent
} from "@/domain/recipe/scale-recipe"

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
      heatLevel: null,
      temperatureCelsius: null,
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

  test.each([
    ["count", "unit-g", "1", "55"],
    ["volume", "unit-g", "1", "55"],
    ["count", "unit-kg", "1000", "0.055"],
    ["volume", "unit-kg", "1000", "0.055"]
  ] as const)(
    "rejects %s to %s when base mass and nutrition mass disagree",
    (sourceDimension, foodBaseUnitId, foodBaseUnitToDimensionBase, baseQuantityPerUnit) => {
      const recipe = {
        ...baseRecipe,
        ingredients: [
          {
            ...baseRecipe.ingredients[0],
            conversion: {
              ...gramConversion,
              unitId: `unit-${sourceDimension}`,
              unitCode: sourceDimension === "count" ? "item" : "ml",
              sourceDimension,
              foodBaseUnitId,
              foodBaseUnitToDimensionBase,
              baseQuantityPerUnit,
              grossGramsPerUnit: "110"
            }
          }
        ]
      }
      const rejected = { ok: false, error: { code: "DIMENSION_MISMATCH" } }

      expect(scaleRecipe(recipe, household)).toEqual(rejected)
      expect(scaleRecipeForAdultEquivalent(recipe, "1.25")).toEqual(rejected)
    }
  )

  test.each([
    ["count", "unit-g", "1", "55", "55", "110", "110"],
    ["count", "unit-kg", "1000", "0.055", "55", "0.11", "110"],
    ["volume", "unit-g", "1", "0.92", "0.92", "1.84", "1.84"],
    ["volume", "unit-kg", "1000", "0.00092", "0.92", "0.00184", "1.84"]
  ] as const)(
    "preserves physical mass and nutrition for a valid %s to %s conversion",
    (
      sourceDimension,
      foodBaseUnitId,
      foodBaseUnitToDimensionBase,
      baseQuantityPerUnit,
      grossGramsPerUnit,
      baseQuantity,
      grossGrams
    ) => {
      const scaled = expectScaled({
        ...baseRecipe,
        yieldAdultEquivalent: "3.4",
        ingredients: [
          {
            ...baseRecipe.ingredients[0],
            quantity: "2",
            conversion: {
              ...gramConversion,
              unitId: `unit-${sourceDimension}`,
              unitCode: sourceDimension === "count" ? "item" : "ml",
              sourceDimension,
              foodBaseUnitId,
              foodBaseUnitToDimensionBase,
              baseQuantityPerUnit,
              grossGramsPerUnit
            }
          }
        ]
      })

      expect(scaled.ingredients[0]).toMatchObject({ sourceQuantity: "2", baseQuantity, grossGrams })
      const nutrition = calculateRecipeNutrition(
        scaled.ingredients.map((ingredient) => ({
          ...ingredient,
          edibleFraction: "1",
          nutrients: REQUIRED_NUTRIENT_CODES.map((nutrientCode) => ({
            nutrientCode,
            amountPer100g: nutrientCode === "energy_kcal" ? "100" : "0"
          }))
        }))
      )
      expect(nutrition.ok).toBe(true)
      if (!nutrition.ok) throw new Error(nutrition.error.code)
      expect(nutrition.value.totalEdibleGrams).toBe(grossGrams)
      expect(
        nutrition.value.nutrients.find((n) => n.nutrientCode === "energy_kcal")?.rawAmount
      ).toBe(grossGrams)
    }
  )

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
          heatLevel: "low",
          temperatureCelsius: null,
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
            heatLevel: "high",
            temperatureCelsius: 180,
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
          heatLevel: "high",
          temperatureCelsius: 180,
          ingredientIds: ["oil"]
        }
      ]
    })
  })

  test.each(
    [
      [
        {
          order: 1,
          instructionVi: " ",
          timerMinutes: null,
          heatLevel: null,
          temperatureCelsius: null,
          ingredientIds: []
        }
      ],
      [
        {
          order: 1,
          instructionVi: "a".repeat(501),
          timerMinutes: null,
          heatLevel: null,
          temperatureCelsius: null,
          ingredientIds: []
        }
      ],
      [
        {
          order: 2,
          instructionVi: "Nấu chín.",
          timerMinutes: null,
          heatLevel: null,
          temperatureCelsius: null,
          ingredientIds: []
        }
      ],
      [
        {
          order: 1,
          instructionVi: "Nấu chín.",
          timerMinutes: 21,
          heatLevel: null,
          temperatureCelsius: null,
          ingredientIds: []
        }
      ],
      [
        {
          order: 1,
          instructionVi: "Nấu chín.",
          timerMinutes: null,
          heatLevel: null,
          temperatureCelsius: null,
          ingredientIds: ["missing"]
        }
      ],
      [
        {
          order: 1,
          instructionVi: "Nấu chín.",
          timerMinutes: null,
          heatLevel: null,
          temperatureCelsius: 39,
          ingredientIds: []
        }
      ],
      [
        {
          order: 1,
          instructionVi: "Nấu chín.",
          timerMinutes: null,
          heatLevel: null,
          temperatureCelsius: 301,
          ingredientIds: []
        }
      ],
      [
        {
          order: 1,
          instructionVi: "Nấu chín.",
          timerMinutes: null,
          heatLevel: null,
          temperatureCelsius: 180.5,
          ingredientIds: []
        }
      ]
    ].map((steps) => [steps] as const)
  )("rejects invalid ordered editorial steps", (steps) => {
    expect(normalizeRecipeSteps(steps, ["oil"], 20)).toEqual({
      ok: false,
      error: { code: "INVALID_RECIPE_STEPS" }
    })
  })

  test("rejects a heat level outside the enum", () => {
    const steps = [
      {
        order: 1,
        instructionVi: "Nấu chín.",
        timerMinutes: null,
        heatLevel: "warm",
        temperatureCelsius: null,
        ingredientIds: []
      }
    ] as unknown as Parameters<typeof normalizeRecipeSteps>[0]

    expect(normalizeRecipeSteps(steps, ["oil"], 20)).toEqual({
      ok: false,
      error: { code: "INVALID_RECIPE_STEPS" }
    })
  })
})

describe("explicit adult equivalent", () => {
  test("scales fractional demand directly while preserving the v1 golden result", () => {
    expect(scaleRecipeForAdultEquivalent(baseRecipe, "1.25")).toMatchObject({
      ok: true,
      value: {
        adultEquivalent: "1.25",
        scaleFactor: "0.3125",
        ingredients: [{ sourceQuantity: "156.25", baseQuantity: "156.25", grossGrams: "156.25" }]
      }
    })
    expect(scaleRecipeForAdultEquivalent(baseRecipe, "3.4")).toEqual(
      scaleRecipe(baseRecipe, household)
    )
  })
  test.each(["0", "-1", "NaN", "Infinity", "1e2"])(
    "rejects invalid explicit demand %s",
    (demand) => {
      expect(scaleRecipeForAdultEquivalent(baseRecipe, demand)).toMatchObject({ ok: false })
    }
  )
})
