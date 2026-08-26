import { describe, expect, test } from "vitest"

import { mealOptionFixture as baseMealOption } from "@/domain/meal-option/meal-option.test-fixture"
import { scaleMealOption } from "@/domain/meal-option/scale-meal-option"

const household = [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }] as const

describe("scaleMealOption", () => {
  test("applies the meal-level scale through pinned component multipliers", () => {
    const result = scaleMealOption(baseMealOption, household)

    expect(result).toMatchObject({
      ok: true,
      value: {
        mealOptionId: "meal-option-1",
        mealOptionVersionId: "meal-option-1-v1",
        adultEquivalent: "2",
        mealScaleFactor: "0.5",
        elapsedMinutes: 30,
        components: [
          {
            mealOptionRecipeId: "component-main",
            recipeId: "recipe-main",
            recipeVersionId: "recipe-main-v1",
            recipeScaleFactor: "0.5"
          }
        ],
        ingredients: [
          {
            foodId: "food-main",
            foodFactVersionId: "fact-main-v1",
            baseUnitId: "unit-g",
            baseQuantity: "200"
          }
        ]
      }
    })
  })

  test("never accepts an arbitrary recipe outside the fixed component input", () => {
    const result = scaleMealOption(baseMealOption, household)

    expect(result).toMatchObject({
      ok: true,
      value: { components: [{ recipeVersionId: "recipe-main-v1" }] }
    })
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.components).toHaveLength(baseMealOption.components.length)
  })

  test("propagates recipe-scaling failures without partial quantities", () => {
    expect(
      scaleMealOption(
        {
          ...baseMealOption,
          components: [
            {
              ...baseMealOption.components[0]!,
              recipe: {
                ...baseMealOption.components[0]!.recipe,
                ingredients: [
                  { ...baseMealOption.components[0]!.recipe.ingredients[0]!, conversion: null }
                ]
              }
            }
          ]
        },
        household
      )
    ).toEqual({ ok: false, error: { code: "MISSING_UNIT_CONVERSION" } })
  })
})
