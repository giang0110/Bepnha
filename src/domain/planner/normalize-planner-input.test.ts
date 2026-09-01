import { describe, expect, test } from "vitest"

import type { PantrySnapshotV1 } from "@/domain/pantry/pantry"

import { normalizePlannerInput } from "./normalize-planner-input"
import type { PlannerInputV1 } from "./planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"

const pantryItems: PantrySnapshotV1["items"] = [
  {
    pantryItemId: "pantry-b",
    foodId: "food-b",
    foodFactVersionId: "fact-b-v1",
    quantity: "2",
    unitId: "unit-g",
    baseQuantity: "2",
    baseUnitId: "unit-g",
    baseDimension: "mass",
    version: 1
  },
  {
    pantryItemId: "pantry-a",
    foodId: "food-a",
    foodFactVersionId: "fact-a-v1",
    quantity: "1",
    unitId: "unit-g",
    baseQuantity: "1",
    baseUnitId: "unit-g",
    baseDimension: "mass",
    version: 1
  }
]

function withPantry(
  input: PlannerInputV1,
  items: PantrySnapshotV1["items"] = pantryItems
): PlannerInputV1 {
  return {
    ...input,
    pantrySnapshot: { version: "pantry-snapshot-v1", items }
  } as unknown as PlannerInputV1
}

describe("normalizePlannerInput", () => {
  test("requires a Monday, explicit supported timezone, exact config, and seven primary slots", () => {
    expect(normalizePlannerInput(plannerInput())).toMatchObject({
      ok: true,
      value: { dayIndexes: [0, 1, 2, 3, 4, 5, 6], mealSlot: "primary" }
    })
    expect(normalizePlannerInput({ ...plannerInput(), weekStart: "2026-09-01" })).toEqual({
      ok: false,
      error: { code: "INVALID_PLANNER_INPUT" }
    })
    expect(normalizePlannerInput({ ...plannerInput(), timezone: "UTC" })).toEqual({
      ok: false,
      error: { code: "INVALID_PLANNER_INPUT" }
    })
  })

  test("canonicalizes permutations and rejects duplicate or excessive exact candidates", () => {
    const one = plannerCandidate("option-a-v1")
    const two = plannerCandidate("option-b-v1")
    const left = normalizePlannerInput({
      ...plannerInput([two, one]),
      hardRuleCodes: ["exclude_beef", "allergen_peanut"],
      softPreferenceCodes: ["prefer_soup", "prefer_pork"]
    })
    const right = normalizePlannerInput({
      ...plannerInput([one, two]),
      hardRuleCodes: ["allergen_peanut", "exclude_beef"],
      softPreferenceCodes: ["prefer_pork", "prefer_soup"]
    })
    expect(left).toEqual(right)
    expect(normalizePlannerInput(plannerInput([one, one]))).toEqual({
      ok: false,
      error: { code: "INVALID_PLANNER_INPUT" }
    })
    expect(
      normalizePlannerInput(
        plannerInput(
          Array.from({ length: 501 }, (_, index) => plannerCandidate(`option-${index}-v1`))
        )
      )
    ).toEqual({ ok: false, error: { code: "CATALOG_CANDIDATE_LIMIT_EXCEEDED" } })
  })

  test("canonicalizes pantry ordering and rejects duplicate pantry foods", () => {
    const normalized = normalizePlannerInput(withPantry(plannerInput()))
    expect(normalized.ok).toBe(true)
    if (!normalized.ok) throw new Error("pantry fixture rejected")
    const pantrySnapshot = (normalized.value as unknown as { pantrySnapshot: PantrySnapshotV1 })
      .pantrySnapshot
    expect(pantrySnapshot.items.map((item) => item.foodId)).toEqual(["food-a", "food-b"])

    expect(
      normalizePlannerInput(
        withPantry(plannerInput(), [
          pantryItems[0]!,
          { ...pantryItems[1]!, foodId: pantryItems[0]!.foodId }
        ])
      )
    ).toEqual({ ok: false, error: { code: "INVALID_PLANNER_INPUT" } })
  })
})
