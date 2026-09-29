import { describe, expect, test } from "vitest"

import { ingredientLabels } from "./ingredient-labels"
import type { PlanIngredientView, PlanRecipeIngredientView } from "./planner-api"
import { stepIngredientDetails } from "./step-ingredient-details"

const FOOD_ID = "60000000-0000-0000-0000-000000000001"
const BASE_UNIT_ID = "70010000-0000-0000-0000-000000000001"
const COMPONENT_ID = "80000000-0000-0000-0000-000000000001"

const labels = ingredientLabels([
  {
    foodId: FOOD_ID,
    foodNameVi: "Gạo tẻ",
    foodFactVersionId: "fact-1",
    baseUnitId: BASE_UNIT_ID,
    units: [{ unitId: BASE_UNIT_ID, unitCode: "g", unitNameVi: "gam" }]
  }
])

const recipeIngredients: readonly PlanRecipeIngredientView[] = [
  { recipeIngredientId: "ri-gao", foodId: FOOD_ID }
]

const scaledIngredients: readonly PlanIngredientView[] = [
  {
    sourceId: `${COMPONENT_ID}:ri-gao`,
    foodId: FOOD_ID,
    foodFactVersionId: "fact-1",
    baseUnitId: BASE_UNIT_ID,
    baseQuantity: "400",
    grossGrams: "400"
  }
]

describe("stepIngredientDetails", () => {
  test("matches an exact component and recipe ingredient to its authoritative scaled quantity", () => {
    expect(
      stepIngredientDetails({
        ingredientIds: ["ri-gao"],
        mealOptionRecipeId: COMPONENT_ID,
        recipeIngredients,
        scaledIngredients,
        labels
      })
    ).toEqual([
      {
        recipeIngredientId: "ri-gao",
        status: "exact",
        label: "Gạo tẻ — 400 g"
      }
    ])
  })

  test("does not borrow a quantity from another component that uses the same recipe ingredient id", () => {
    expect(
      stepIngredientDetails({
        ingredientIds: ["ri-gao"],
        mealOptionRecipeId: "different-component",
        recipeIngredients,
        scaledIngredients,
        labels
      })
    ).toEqual([
      {
        recipeIngredientId: "ri-gao",
        status: "unavailable",
        label: "Gạo tẻ — chưa có lượng đã tính"
      }
    ])
  })

  test("fails presentation closed when exact component identity is absent", () => {
    expect(
      stepIngredientDetails({
        ingredientIds: ["ri-gao"],
        recipeIngredients,
        scaledIngredients,
        labels
      })
    ).toEqual([
      {
        recipeIngredientId: "ri-gao",
        status: "unavailable",
        label: "Gạo tẻ — chưa có lượng đã tính"
      }
    ])
  })
})
