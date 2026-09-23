import { describe, expect, test } from "vitest"

import { EMPTY_INGREDIENT_LABELS, ingredientLabels } from "./ingredient-labels"
import type { PlanRecipeIngredientView, PlanStepView } from "./planner-api"
import { stepConditions, stepIngredientNames } from "./step-details"

const GAM = "70010000-0000-0000-0000-000000000001"
const GAO = "60000000-0000-0000-0000-000000000001"
const DAU_AN = "60000000-0000-0000-0000-000000000002"

const labels = ingredientLabels([
  {
    foodId: GAO,
    foodNameVi: "Gạo tẻ",
    foodFactVersionId: "fact-1",
    baseUnitId: GAM,
    units: [{ unitId: GAM, unitCode: "g", unitNameVi: "gam" }]
  }
])

function step(overrides: Partial<PlanStepView> = {}): PlanStepView {
  return {
    order: 1,
    instructionVi: "Chiên vàng đều hai mặt.",
    timerMinutes: null,
    heatLevel: null,
    temperatureCelsius: null,
    ingredientIds: [],
    ...overrides
  }
}

describe("stepConditions", () => {
  test("reads the way a cook needs it: how long, how hot, at what temperature", () => {
    expect(
      stepConditions(step({ timerMinutes: 6, heatLevel: "high", temperatureCelsius: 170 }))
    ).toEqual(["6 phút", "Lửa lớn", "170°C"])
  })

  test("says nothing about what the recipe did not say", () => {
    expect(stepConditions(step())).toEqual([])
    expect(stepConditions(step({ timerMinutes: 2 }))).toEqual(["2 phút"])
    expect(stepConditions(step({ heatLevel: "low" }))).toEqual(["Lửa nhỏ"])
    expect(stepConditions(step({ heatLevel: "medium" }))).toEqual(["Lửa vừa"])
  })

  test("keeps a zero timer, which is not the same as no timer", () => {
    expect(stepConditions(step({ timerMinutes: 0 }))).toEqual(["0 phút"])
  })
})

describe("a response that predates these fields", () => {
  // The planner API is a wire contract, not a compiler guarantee. A deployment still answering the
  // previous step shape used to throw on `undefined.map` and take the whole week's plan down with
  // it; absent now reads exactly like null — the recipe did not say.
  const legacyStep = {
    order: 1,
    instructionVi: "Nấu bữa 1."
  } as unknown as PlanStepView

  test("says nothing rather than throwing", () => {
    expect(stepConditions(legacyStep)).toEqual([])
    expect(
      stepIngredientNames(legacyStep, undefined as unknown as PlanRecipeIngredientView[], labels)
    ).toEqual([])
  })

  test("still reads the fields a partial response does carry", () => {
    const partial = { order: 1, instructionVi: "Nấu.", timerMinutes: 10 } as unknown as PlanStepView

    expect(stepConditions(partial)).toEqual(["10 phút"])
  })
})

describe("stepIngredientNames", () => {
  test("names each ingredient the step links to", () => {
    expect(
      stepIngredientNames(
        step({ ingredientIds: ["ri-gao"] }),
        [{ recipeIngredientId: "ri-gao", foodId: GAO }],
        labels
      )
    ).toEqual(["Gạo tẻ"])
  })

  test("shows the food id when the lookup does not know the name", () => {
    expect(
      stepIngredientNames(
        step({ ingredientIds: ["ri-dau"] }),
        [{ recipeIngredientId: "ri-dau", foodId: DAU_AN }],
        labels
      )
    ).toEqual([DAU_AN])
  })

  test("shows the link's own id rather than dropping an ingredient it cannot resolve", () => {
    // A step that needs two ingredients must not read as needing one. The id is unhelpful; a
    // silently shorter list would be wrong.
    expect(
      stepIngredientNames(
        step({ ingredientIds: ["ri-gao", "ri-missing"] }),
        [{ recipeIngredientId: "ri-gao", foodId: GAO }],
        labels
      )
    ).toEqual(["Gạo tẻ", "ri-missing"])
  })

  test("keeps every link when no labels have loaded at all", () => {
    expect(
      stepIngredientNames(
        step({ ingredientIds: ["ri-gao"] }),
        [{ recipeIngredientId: "ri-gao", foodId: GAO }],
        EMPTY_INGREDIENT_LABELS
      )
    ).toEqual([GAO])
  })
})
