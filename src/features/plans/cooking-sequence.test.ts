import { describe, expect, test } from "vitest"

import { cookingSequence, mealRoleLabel } from "./cooking-sequence"
import { ingredientLabels } from "./ingredient-labels"
import type { PlanItemView } from "./planner-api"

const GAM = "70010000-0000-0000-0000-000000000001"
const GAO = "60000000-0000-0000-0000-000000000001"

const labels = ingredientLabels([
  {
    foodId: GAO,
    foodNameVi: "Gạo tẻ",
    foodFactVersionId: "fact-1",
    baseUnitId: GAM,
    units: [{ unitId: GAM, unitCode: "g", unitNameVi: "gam" }]
  }
])

function step(order: number, instructionVi: string, extra: Record<string, unknown> = {}) {
  return {
    order,
    instructionVi,
    timerMinutes: null,
    heatLevel: null,
    temperatureCelsius: null,
    ingredientIds: [],
    ...extra
  }
}

/** Deliberately out of order, so the function has to do the sorting rather than the fixture. */
const meal = {
  components: [
    {
      mealRole: "main",
      sortOrder: 2,
      recipe: {
        recipeId: "ga",
        recipeVersionId: "ga-v3",
        ingredients: [{ recipeIngredientId: "ri-gao", foodId: GAO }],
        steps: [
          step(2, "Chiên vàng đều hai mặt.", {
            timerMinutes: 6,
            heatLevel: "high",
            temperatureCelsius: 170
          }),
          step(1, "Ướp gà với gia vị.", { timerMinutes: 15, ingredientIds: ["ri-gao"] })
        ]
      }
    },
    {
      mealRole: "staple",
      sortOrder: 1,
      recipe: {
        recipeId: "com",
        recipeVersionId: "com-v3",
        ingredients: [],
        steps: [step(1, "Vo gạo."), step(2, "Nấu chín rồi ủ.")]
      }
    }
  ]
} as unknown as PlanItemView

describe("cookingSequence", () => {
  test("cooks each dish through before starting the next", () => {
    expect(cookingSequence(meal, labels).map((s) => s.instructionVi)).toEqual([
      "Vo gạo.",
      "Nấu chín rồi ủ.",
      "Ướp gà với gia vị.",
      "Chiên vàng đều hai mặt."
    ])
  })

  test("says which dish a step belongs to and where it sits", () => {
    const sequence = cookingSequence(meal, labels)

    expect(sequence[0]).toMatchObject({
      dishLabel: "Cơm",
      dishNumber: 1,
      dishCount: 2,
      stepNumber: 1,
      stepCount: 2
    })
    expect(sequence[3]).toMatchObject({
      dishLabel: "Món mặn",
      dishNumber: 2,
      dishCount: 2,
      stepNumber: 2,
      stepCount: 2
    })
  })

  test("carries the conditions and the named ingredients of each step", () => {
    const sequence = cookingSequence(meal, labels)

    expect(sequence[3]).toMatchObject({
      conditions: ["6 phút", "Lửa lớn", "170°C"],
      timerMinutes: 6
    })
    expect(sequence[2]?.ingredientNames).toEqual(["Gạo tẻ"])
  })

  test("gives every step a key that is unique across dishes", () => {
    const keys = cookingSequence(meal, labels).map((s) => s.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  test("names an unknown dish role by its code rather than inventing a label", () => {
    expect(mealRoleLabel("dessert")).toBe("dessert")
    expect(mealRoleLabel("soup")).toBe("Canh")
  })

  test("returns nothing for a meal with no dishes rather than throwing", () => {
    expect(cookingSequence({ components: [] } as unknown as PlanItemView, labels)).toEqual([])
  })
})
