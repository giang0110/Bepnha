import { describe, expect, test } from "vitest"

import { calculatePurchaseBasket } from "@/domain/pricing/calculate-purchase-basket"

import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"
import { scoreWeeklyPlan } from "./score-week"

function option(id: string, protein: string) {
  const candidate = plannerCandidate(id)
  const changed = {
    ...candidate,
    mealOption: {
      ...candidate.mealOption,
      tags: candidate.mealOption.tags.map((tag) =>
        tag.kind === "protein_hint" ? { ...tag, code: protein } : tag
      )
    }
  }
  const input = normalizePlannerInput(plannerInput([changed]))
  if (!input.ok) throw new Error("invalid fixture")
  const result = evaluatePlannerEligibility(input.value)
  if (!result.ok) throw new Error("ineligible fixture")
  return result.value.eligible[0]!
}

function basket(options: ReturnType<typeof option>[]) {
  const prices = options.flatMap((item) => item.prices)
  const result = calculatePurchaseBasket(
    options.flatMap((item) => item.requirements),
    prices,
    "2026-08-26"
  )
  if (!result.ok) throw new Error("invalid basket")
  return result.value
}

describe("scoreWeeklyPlan", () => {
  test("makes primary-protein repetition a strictly monotonic soft penalty", () => {
    const diverse = ["poultry", "beef", "pork", "fish", "tofu", "egg", "seafood"].map(
      (protein, index) => option(`diverse-${index}-v1`, protein)
    )
    const repeated = diverse.map((item) => ({ ...item, primaryProteinGroup: "poultry" }))
    const diverseScore = scoreWeeklyPlan(diverse, basket(diverse), [])
    const repeatedScore = scoreWeeklyPlan(repeated, basket(repeated), [])
    expect(repeatedScore.metrics.repeatedPrimaryProteinOccurrences).toBe(6)
    expect(repeatedScore.components.primaryProteinRepetition).toBeGreaterThan(
      diverseScore.components.primaryProteinRepetition
    )
  })

  test("scores transparent role/diversity/reuse/preferences without budget or medical terms", () => {
    const options = Array.from({ length: 7 }, (_, index) => option(`score-${index}-v1`, "poultry"))
    const score = scoreWeeklyPlan(options, basket(options), ["prefer_soup"])
    expect(score.totalQualityPenalty).toBeGreaterThan(0)
    expect(score.explanations).toEqual([
      "DIVERSITY_PRIMARY_PROTEIN_REPETITION",
      "DIVERSITY_COOKING_STYLE_VARIETY",
      "DIVERSITY_ADJACENT_PRIMARY_PROTEIN",
      "COMPOSITION_MEAL_ROLES",
      "REUSE_DISTINCT_FOODS",
      "REUSE_PACKAGE_LEFTOVER",
      "PREFERENCES_MATCH"
    ])
    expect(JSON.stringify(score)).not.toMatch(/budget|healthy|medical|adequacy/i)
  })
})
