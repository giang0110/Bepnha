import { describe, expect, test } from "vitest"

import type { EligibleMealOption } from "./evaluate-eligibility"
import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"
import { previewMealReplacement } from "./replace-meal"
import { searchWeek } from "./search-week"

function fixture(count = 9): {
  options: EligibleMealOption[]
  plan: Extract<ReturnType<typeof searchWeek>, { plan: unknown }>
} {
  const normalized = normalizePlannerInput(
    plannerInput(
      Array.from({ length: count }, (_, index) => plannerCandidate(`replace-${index}-v1`))
    )
  )
  if (!normalized.ok) throw new Error("invalid fixture")
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) throw new Error("ineligible fixture")
  const result = searchWeek(eligibility.value.eligible.slice(0, 7), 700_000, [], "2026-08-26")
  if (!("plan" in result)) throw new Error("plan unavailable")
  return { options: [...eligibility.value.eligible], plan: result }
}

describe("previewMealReplacement", () => {
  test("changes exactly one target and preserves six exact version IDs/indexes", () => {
    const { options, plan } = fixture()
    const result = previewMealReplacement({
      current: plan.plan,
      targetDayIndex: 3,
      candidates: options,
      budgetVnd: 700_000,
      softPreferenceCodes: [],
      calculationDate: "2026-08-26"
    })
    if (!result.ok) throw new Error("replacement unavailable")
    expect(result.value.items[3]!.mealOptionVersionId).not.toBe(
      plan.plan.items[3]!.mealOptionVersionId
    )
    for (const dayIndex of [0, 1, 2, 4, 5, 6]) {
      expect(result.value.items[dayIndex]).toEqual(plan.plan.items[dayIndex])
    }
    expect(result.value.weeklyCostDeltaVnd).toBe(
      result.value.weeklyEstimatedCostVnd - plan.plan.totalEstimatedCostVnd
    )
  })

  test("rescoring same-protein candidates never rejects an otherwise valid replacement", () => {
    const { options, plan } = fixture()
    expect(new Set(options.map((option) => option.primaryProteinGroup))).toEqual(
      new Set(["poultry"])
    )
    expect(
      previewMealReplacement({
        current: plan.plan,
        targetDayIndex: 0,
        candidates: options,
        budgetVnd: 700_000,
        softPreferenceCodes: [],
        calculationDate: "2026-08-26"
      })
    ).toMatchObject({ ok: true })
  })

  test("uses within-budget partition, then minimum-cost over-budget fallback", () => {
    const { options, plan } = fixture()
    const expensive = options.map((option, index) =>
      index < 7
        ? option
        : {
            ...option,
            prices: option.prices.map((price) => ({
              ...price,
              packagePriceVnd: index === 7 ? 200_000 : 100_000
            }))
          }
    )
    const result = previewMealReplacement({
      current: plan.plan,
      targetDayIndex: 6,
      candidates: expensive,
      budgetVnd: 300_000,
      softPreferenceCodes: [],
      calculationDate: "2026-08-26"
    })
    if (!result.ok) throw new Error("replacement unavailable")
    expect(result.value.status).toBe("ready_over_budget")
    expect(result.value.items[6]!.mealOptionVersionId).toBe("replace-8-v1")
  })

  test("returns bounded replacement wording when no candidate survives", () => {
    const { options, plan } = fixture(7)
    expect(
      previewMealReplacement({
        current: plan.plan,
        targetDayIndex: 2,
        candidates: options,
        budgetVnd: 700_000,
        softPreferenceCodes: [],
        calculationDate: "2026-08-26"
      })
    ).toEqual({
      ok: false,
      error: {
        code: "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH",
        messageKey: "planner.replacement_unavailable_within_deterministic_search"
      }
    })
  })
})
