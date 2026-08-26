import { describe, expect, test } from "vitest"

import {
  mealOptionFixture as baseMealOption,
  mealOptionRecipeFixture as recipe
} from "@/domain/meal-option/meal-option.test-fixture"
import { validateMealOptionVersion } from "@/domain/meal-option/validate-meal-option"

describe("validateMealOptionVersion", () => {
  test("normalizes pinned components and controlled tags deterministically", () => {
    const first = validateMealOptionVersion(baseMealOption)
    const second = validateMealOptionVersion({
      ...baseMealOption,
      tags: [...baseMealOption.tags].reverse(),
      components: [...baseMealOption.components].reverse()
    })

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      ok: true,
      value: {
        mealOptionId: "meal-option-1",
        mealOptionVersionId: "meal-option-1-v1",
        elapsedMinutes: 30,
        primaryProteinGroup: "chicken",
        cookingStyleCodes: ["braised"],
        mainRecipeVersionIds: ["recipe-main-v1"]
      }
    })
  })

  test("uses editorial meal-option elapsed time instead of summing recipe time", () => {
    const result = validateMealOptionVersion({
      ...baseMealOption,
      elapsedMinutes: 30,
      components: [
        baseMealOption.components[0]!,
        {
          ...baseMealOption.components[0]!,
          mealOptionRecipeId: "component-soup",
          recipeId: "recipe-soup",
          recipeVersionId: "recipe-soup-v1",
          recipeContentHash: "c".repeat(64),
          mealRole: "soup",
          sortOrder: 2,
          recipe: {
            ...recipe,
            recipeId: "recipe-soup",
            recipeVersionId: "recipe-soup-v1",
            elapsedMinutes: 50,
            ingredients: [
              {
                ...recipe.ingredients[0],
                recipeIngredientId: "ingredient-soup",
                foodId: "food-soup",
                foodFactVersionId: "fact-soup-v1"
              }
            ],
            steps: [
              {
                ...recipe.steps[0],
                ingredientIds: ["ingredient-soup"]
              }
            ]
          }
        }
      ]
    })

    expect(result).toMatchObject({ ok: true, value: { elapsedMinutes: 30 } })
  })

  test.each([
    [{ mealOptionId: "" }, "INVALID_MEAL_OPTION_IDENTITY"],
    [{ versionNumber: 0 }, "INVALID_MEAL_OPTION_VERSION"],
    [{ contentHash: "client-hash" }, "INVALID_MEAL_OPTION_VERSION"],
    [{ yieldAdultEquivalent: "0" }, "INVALID_MEAL_OPTION_YIELD"],
    [{ activeMinutes: 31 }, "INVALID_MEAL_OPTION_TIME"],
    [{ elapsedMinutes: 181 }, "INVALID_MEAL_OPTION_TIME"],
    [{ components: [] }, "INVALID_MEAL_OPTION_COMPONENTS"],
    [
      {
        components: [{ ...baseMealOption.components[0]!, recipeVersionId: "recipe-other-v1" }]
      },
      "INVALID_RECIPE_VERSION_PIN"
    ],
    [
      {
        components: [{ ...baseMealOption.components[0]!, quantityMultiplier: "0.5" }]
      },
      "MEAL_OPTION_YIELD_MISMATCH"
    ],
    [
      {
        components: [{ ...baseMealOption.components[0]!, mealRole: "side" as const }]
      },
      "MISSING_MAIN_COMPONENT"
    ],
    [{ tags: [baseMealOption.tags[1]!] }, "INVALID_PROTEIN_HINT"],
    [
      {
        tags: [
          baseMealOption.tags[0]!,
          { ...baseMealOption.tags[0]!, tagId: "tag-protein-2", code: "fish" },
          baseMealOption.tags[1]!
        ]
      },
      "INVALID_PROTEIN_HINT"
    ],
    [{ tags: [baseMealOption.tags[0]!] }, "MISSING_COOKING_STYLE"]
  ] as const)("rejects invalid curated structure %#", (patch, code) => {
    expect(validateMealOptionVersion({ ...baseMealOption, ...patch })).toEqual({
      ok: false,
      error: { code }
    })
  })
})
