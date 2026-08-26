import { describe, expect, test } from "vitest"

import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"

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
})
