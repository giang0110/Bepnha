import { describe, expect, test } from "vitest"

import type { EligibleMealOption } from "./evaluate-eligibility"
import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"
import { searchWeek, selectFinalPlan, type CompletedPlanCandidate } from "./search-week"

function eligible(count: number, protein = "poultry"): EligibleMealOption[] {
  const candidates = Array.from({ length: count }, (_, index) => {
    const candidate = plannerCandidate(`option-${String(index).padStart(3, "0")}-v1`)
    return {
      ...candidate,
      mealOption: {
        ...candidate.mealOption,
        tags: candidate.mealOption.tags.map((tag) =>
          tag.kind === "protein_hint" ? { ...tag, code: protein } : tag
        )
      }
    }
  })
  const normalized = normalizePlannerInput(plannerInput(candidates))
  if (!normalized.ok) throw new Error("invalid fixture")
  const result = evaluatePlannerEligibility(normalized.value)
  if (!result.ok) throw new Error("ineligible fixture")
  return [...result.value.eligible]
}

function completed(cost: number, quality: number, id: string): CompletedPlanCandidate {
  return {
    selected: Array.from({ length: 7 }, (_, dayIndex) => ({
      ...eligible(7)[dayIndex]!,
      mealOptionVersionId: `${id}-${dayIndex}`
    })),
    basket: { lines: [], warnings: [], totalEstimatedCostVnd: cost },
    score: {
      totalQualityPenalty: quality,
      components: {
        primaryProteinRepetition: 0,
        cookingStyleVariety: 0,
        adjacentPrimaryProtein: 0,
        composition: 0,
        ingredientReuse: 0,
        packageLeftover: 0,
        preferences: 0
      },
      metrics: {
        repeatedPrimaryProteinOccurrences: 0,
        distinctPrimaryCookingStyleCount: 7,
        adjacentSamePrimaryProteinCount: 0,
        missingRoleAssignments: 0,
        eligibleDistinctFoodCount: 7,
        reusedDistinctFoodCount: 0,
        unmatchedPreferenceAssignments: 0,
        preferenceAssignmentCount: 0
      },
      explanations: []
    },
    stableIdSequence: `${id}-sequence`
  }
}

describe("searchWeek", () => {
  test("produces a seven-day plan when all distinct valid meals share one protein", () => {
    const result = searchWeek(eligible(7), 700_000, [], "2026-08-26")
    expect(result).toMatchObject({
      status: "ready_within_budget",
      plan: {
        items: [
          { dayIndex: 0 },
          { dayIndex: 1 },
          { dayIndex: 2 },
          { dayIndex: 3 },
          { dayIndex: 4 },
          { dayIndex: 5 },
          { dayIndex: 6 }
        ]
      }
    })
  })

  test("is byte-equivalent under shuffled candidate order and stays inside 125/125/250 frontiers", () => {
    const candidates = eligible(20)
    const left = searchWeek(candidates, 700_000, [], "2026-08-26")
    const right = searchWeek([...candidates].reverse(), 700_000, [], "2026-08-26")
    expect(JSON.stringify(left)).toBe(JSON.stringify(right))
    if (!("plan" in left)) throw new Error("expected plan")
    expect(
      left.plan.frontierMetrics.every(
        (metric) => metric.qualitySize <= 125 && metric.costSize <= 125 && metric.unionSize <= 250
      )
    ).toBe(true)
  })

  test("hard-disallows stable identity reuse and adjacent shared main recipe only", () => {
    const candidates = eligible(7)
    const duplicateIdentity = candidates.map((candidate, index) =>
      index === 6 ? { ...candidate, mealOptionId: candidates[0]!.mealOptionId } : candidate
    )
    expect(searchWeek(duplicateIdentity, 700_000, [], "2026-08-26")).toMatchObject({
      ok: false,
      error: { code: "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" }
    })
    const adjacentMain = candidates.map((candidate) => ({
      ...candidate,
      mainRecipeVersionIds: ["shared-main"]
    }))
    expect(searchWeek(adjacentMain, 700_000, [], "2026-08-26")).toMatchObject({
      ok: false,
      error: { code: "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" }
    })
  })

  test("uses bounded-search wording without claiming global infeasibility", () => {
    const result = searchWeek(eligible(6), 700_000, [], "2026-08-26")
    expect(result).toEqual({
      ok: false,
      error: {
        code: "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH",
        messageKey: "planner.no_complete_plan_found_in_deterministic_search"
      }
    })
    expect(JSON.stringify(result)).not.toMatch(/no valid plan exists|global|infeasible/i)
  })

  test("partitions within-budget finalists before quality ranking", () => {
    const selected = selectFinalPlan(
      [completed(701_000, 0, "quality"), completed(700_000, 9999, "within")],
      700_000
    )
    expect(selected.status).toBe("ready_within_budget")
    expect(selected.plan.stableIdSequence).toBe("within-sequence")
  })

  test("chooses minimum exact over-budget cost before quality and adds exact warnings", () => {
    const selected = selectFinalPlan(
      [completed(710_000, 0, "quality"), completed(705_000, 9999, "cheap")],
      700_000
    )
    expect(selected.status).toBe("ready_over_budget")
    expect(selected.plan.stableIdSequence).toBe("cheap-sequence")
    expect(selected.warnings).toContainEqual({
      code: "PLAN_OVER_BUDGET",
      budgetVnd: 700_000,
      estimatedPlanCostVnd: 705_000,
      overageVnd: 5_000
    })
    expect(selected.warnings).toContainEqual({
      code: "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH"
    })
  })

  test("prefers protein diversity only at equal feasibility/cost", () => {
    const repeated = completed(350_000, 1500, "repeated")
    const diverse = completed(350_000, 0, "diverse")
    expect(selectFinalPlan([repeated, diverse], 350_000).plan.stableIdSequence).toBe(
      "diverse-sequence"
    )
  })

  test("never lets protein diversity make a costlier over-budget fallback win", () => {
    const cheaperRepeated = completed(351_000, 1500, "repeated")
    const costlierDiverse = completed(352_000, 0, "diverse")
    expect(selectFinalPlan([costlierDiverse, cheaperRepeated], 300_000).plan.stableIdSequence).toBe(
      "repeated-sequence"
    )
  })
})
