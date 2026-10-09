import { describe, expect, test } from "vitest"
import { extractPlanItemPrepTasks } from "./daily-prep-adapter"
import type { PlanItemView } from "./planner-api"
import type { IngredientLabels } from "./ingredient-labels"

describe("daily-prep-adapter", () => {
  const dummyLabels: IngredientLabels = {
    foodNames: new Map([
      ["food-fish", "Cá diêu hồng"],
      ["food-rice", "Gạo tẻ"],
      ["food-tomato", "Cà chua"]
    ]),
    unitCodes: new Map([
      ["unit-g", "g"],
      ["unit-item", "quả"]
    ])
  }

  const dummyItem: PlanItemView = {
    dayIndex: 0,
    mealSlot: "primary",
    mealOptionId: "opt-1",
    mealOptionVersionId: "ver-1",
    adultEquivalent: "2.0",
    scaleFactor: "1.0",
    mealOptionCode: "MEAL_FISH",
    mealOptionNameVi: "Cá diêu hồng rán giòn",
    elapsedMinutes: 35,
    components: [
      {
        mealRole: "main",
        sortOrder: 1,
        recipe: {
          recipeId: "rec-1",
          recipeVersionId: "ver-1",
          ingredients: [],
          steps: []
        }
      },
      {
        mealRole: "staple",
        sortOrder: 2,
        recipe: {
          recipeId: "rec-2",
          recipeVersionId: "ver-2",
          ingredients: [],
          steps: []
        }
      }
    ],
    scaledIngredients: [
      {
        sourceId: "s-1",
        foodId: "food-fish",
        foodFactVersionId: "ff-1",
        baseUnitId: "unit-g",
        baseQuantity: "600",
        grossGrams: "600"
      },
      {
        sourceId: "s-2",
        foodId: "food-rice",
        foodFactVersionId: "ff-2",
        baseUnitId: "unit-g",
        baseQuantity: "400",
        grossGrams: "400"
      }
    ],
    nutrition: { nutrients: [] }
  }

  test("converts PlanItemView and IngredientLabels to PrepTask list", () => {
    const tasks = extractPlanItemPrepTasks(dummyItem, dummyLabels)

    expect(tasks.length).toBeGreaterThanOrEqual(2)
    const defrost = tasks.find((t) => t.type === "defrost")
    expect(defrost?.foodNameVi).toBe("Cá diêu hồng")
    expect(defrost?.quantityLabel).toBe("600 g")

    const rice = tasks.find((t) => t.type === "rice")
    expect(rice?.titleVi).toBe("Cắm nồi cơm điện")
  })
})
