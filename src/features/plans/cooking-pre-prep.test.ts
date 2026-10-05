import { describe, expect, test } from "vitest"

import { extractMealPrePrepGroups } from "./cooking-pre-prep"
import type { PlanItemView } from "./planner-api"
import type { IngredientLabels } from "./ingredient-labels"

const mockLabels: IngredientLabels = {
  foodNames: new Map([
    ["food-ga", "Thịt gà"],
    ["food-nam", "Nấm hương"],
    ["food-gao", "Gạo tẻ"]
  ]),
  unitCodes: new Map([["unit-g", "g"]])
}

const mockItem: PlanItemView = {
  dayIndex: 0,
  mealSlot: "primary",
  mealOptionId: "meal-1",
  mealOptionVersionId: "meal-v1",
  adultEquivalent: "2",
  scaleFactor: "1",
  mealOptionCode: "com_ga_nam",
  mealOptionNameVi: "Cơm gà xào nấm",
  elapsedMinutes: 30,
  components: [
    {
      mealOptionRecipeId: "mor-com",
      mealRole: "staple",
      sortOrder: 1,
      recipe: {
        recipeId: "recipe-com",
        recipeVersionId: "rc-com-v1",
        ingredients: [{ recipeIngredientId: "ri-gao", foodId: "food-gao" }],
        steps: [
          {
            order: 1,
            instructionVi: "Vo gạo",
            timerMinutes: null,
            heatLevel: null,
            temperatureCelsius: null,
            ingredientIds: ["ri-gao"]
          }
        ]
      }
    },
    {
      mealOptionRecipeId: "mor-ga",
      mealRole: "main",
      sortOrder: 2,
      recipe: {
        recipeId: "recipe-ga",
        recipeVersionId: "rc-ga-v1",
        ingredients: [
          { recipeIngredientId: "ri-ga", foodId: "food-ga" },
          { recipeIngredientId: "ri-nam", foodId: "food-nam" }
        ],
        steps: [
          {
            order: 1,
            instructionVi: "Thái thịt gà",
            timerMinutes: null,
            heatLevel: null,
            temperatureCelsius: null,
            ingredientIds: ["ri-ga"]
          },
          {
            order: 2,
            instructionVi: "Ngâm nấm",
            timerMinutes: 10,
            heatLevel: null,
            temperatureCelsius: null,
            ingredientIds: ["ri-nam"]
          }
        ]
      }
    }
  ],
  scaledIngredients: [
    {
      sourceId: "mor-com:ri-gao",
      foodId: "food-gao",
      foodFactVersionId: "fact-gao",
      baseUnitId: "unit-g",
      baseQuantity: "400",
      grossGrams: "400"
    },
    {
      sourceId: "mor-ga:ri-ga",
      foodId: "food-ga",
      foodFactVersionId: "fact-ga",
      baseUnitId: "unit-g",
      baseQuantity: "350",
      grossGrams: "350"
    },
    {
      sourceId: "mor-ga:ri-nam",
      foodId: "food-nam",
      foodFactVersionId: "fact-nam",
      baseUnitId: "unit-g",
      baseQuantity: "100",
      grossGrams: "100"
    }
  ],
  nutrition: { nutrients: [] }
}

describe("extractMealPrePrepGroups", () => {
  test("groups ingredients by dish in sortOrder", () => {
    const groups = extractMealPrePrepGroups(mockItem, mockLabels)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.dishLabel).toBe("Cơm")
    expect(groups[0]?.ingredients).toHaveLength(1)
    expect(groups[0]?.ingredients[0]?.label).toBe("Gạo tẻ — 400 g")

    expect(groups[1]?.dishLabel).toBe("Món mặn")
    expect(groups[1]?.ingredients).toHaveLength(2)
    expect(groups[1]?.ingredients[0]?.label).toBe("Thịt gà — 350 g")
    expect(groups[1]?.ingredients[1]?.label).toBe("Nấm hương — 100 g")
  })

  test("skips staple dish when skipStaple is true", () => {
    const groups = extractMealPrePrepGroups(mockItem, mockLabels, { skipStaple: true })
    expect(groups).toHaveLength(1)
    expect(groups[0]?.dishLabel).toBe("Món mặn")
  })
})
