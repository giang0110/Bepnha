import { describe, expect, test } from "vitest"

import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"
import type { PlannerInputV1 } from "./planner-input"
import { EMPTY_MEAL_OPTION_RATINGS, type MealOptionRatings } from "./score-week"
import { searchWeek } from "./search-week"

function planFromInput(input: PlannerInputV1) {
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) return normalized
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) return eligibility
  return searchWeek(
    eligibility.value.eligible,
    normalized.value.weeklyPlanBudgetVnd,
    normalized.value.softPreferenceCodes,
    normalized.value.calculationDate,
    normalized.value.priceFreshnessConfig,
    normalized.value.plannerConfig
  )
}

function plan(count = 7, budgetVnd = 700_000) {
  return planFromInput({
    ...plannerInput(
      Array.from({ length: count }, (_, index) =>
        plannerCandidate(`golden-${String(index).padStart(2, "0")}-v1`)
      )
    ),
    weeklyPlanBudgetVnd: budgetVnd
  })
}

describe("reviewed planner goldens", () => {
  test("keeps the canonical two-adult single-protein result stable", () => {
    const result = plan()
    if (!("plan" in result)) throw new Error("expected golden ready plan")
    expect({
      status: result.status,
      ids: result.plan.items.map((item) => item.mealOptionVersionId),
      total: result.plan.totalEstimatedCostVnd,
      proteinPenalty: result.plan.score.components.primaryProteinRepetition,
      frontier: result.plan.frontierMetrics.map((item) => item.unionSize),
      warnings: result.warnings.map((warning) => warning.code)
    }).toMatchInlineSnapshot(`
      {
        "frontier": [
          7,
          42,
          125,
          125,
          125,
          125,
          125,
        ],
        "ids": [
          "golden-00-v1",
          "golden-01-v1",
          "golden-02-v1",
          "golden-03-v1",
          "golden-04-v1",
          "golden-05-v1",
          "golden-06-v1",
        ],
        "proteinPenalty": 1500,
        "status": "ready_within_budget",
        "total": 350000,
        "warnings": [
          "STALE_PRICE",
          "STALE_PRICE",
          "STALE_PRICE",
          "STALE_PRICE",
          "STALE_PRICE",
          "STALE_PRICE",
          "STALE_PRICE",
        ],
      }
    `)
  })

  test("keeps tight-budget fallback a successful exact minimum-cost result", () => {
    const result = plan(8, 300_000)
    expect(result).toMatchObject({
      status: "ready_over_budget",
      plan: { totalEstimatedCostVnd: 350_000 },
      warnings: [
        { code: "STALE_PRICE" },
        { code: "STALE_PRICE" },
        { code: "STALE_PRICE" },
        { code: "STALE_PRICE" },
        { code: "STALE_PRICE" },
        { code: "STALE_PRICE" },
        { code: "STALE_PRICE" },
        {
          code: "PLAN_OVER_BUDGET",
          budgetVnd: 300_000,
          estimatedPlanCostVnd: 350_000,
          overageVnd: 50_000
        },
        { code: "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" }
      ]
    })
  })

  test("matches exhaustive stable enumeration for a small known-fit fixture", () => {
    const result = plan()
    if (!("plan" in result)) throw new Error("expected plan")
    const ids = result.plan.items.map((item) => item.mealOptionVersionId)
    function permutations(values: readonly string[]): string[] {
      if (values.length <= 1) return [values.join("|")]
      return values.flatMap((value, index) =>
        permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
          (suffix) => `${value}|${suffix}`
        )
      )
    }
    const exhaustiveStableMinimum = permutations(ids).sort()[0]
    expect(result.plan.stableIdSequence).toBe(exhaustiveStableMinimum)
  })

  test.each([
    [
      "child household",
      [
        { memberKind: "adult", ageBand: "adult", memberCount: 2 },
        { memberKind: "child", ageBand: "4_6", memberCount: 1 }
      ]
    ],
    [
      "multigenerational household",
      [
        { memberKind: "adult", ageBand: "adult", memberCount: 2 },
        { memberKind: "child", ageBand: "10_12", memberCount: 1 },
        { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
      ]
    ]
  ] as const)("keeps %s grouped-member planning deterministic", (_name, memberGroups) => {
    const result = planFromInput({
      ...plannerInput(
        Array.from({ length: 7 }, (_, index) => plannerCandidate(`member-${index}-v1`))
      ),
      memberGroups
    })
    expect(result).toMatchObject({ status: "ready_within_budget" })
    if (!("plan" in result)) throw new Error("expected grouped-member plan")
    expect(result.plan.items.map((item) => item.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test("keeps vegetarian and allergen-safe goldens in hard eligibility", () => {
    const candidates = Array.from({ length: 7 }, (_, index) => {
      const candidate = plannerCandidate(`vegetarian-${index}-v1`)
      return {
        ...candidate,
        mealOption: {
          ...candidate.mealOption,
          tags: candidate.mealOption.tags.map((tag) =>
            tag.kind === "protein_hint" ? { ...tag, code: "tofu" } : tag
          )
        },
        ingredientLineage: candidate.ingredientLineage.map((lineage) => ({
          ...lineage,
          categoryAncestry: ["tofu"],
          dietaryTagCodes: ["vegetarian"]
        }))
      }
    })
    const result = planFromInput({
      ...plannerInput(candidates),
      hardRuleCodes: ["allergen_peanut", "diet_vegetarian"]
    })
    expect(result).toMatchObject({ status: "ready_within_budget" })
  })
})

describe("recently cooked meals", () => {
  function planWithHistory(recentMealOptionIds: readonly string[], count = 9) {
    const input: PlannerInputV1 = {
      ...plannerInput(
        Array.from({ length: count }, (_, index) =>
          plannerCandidate(`golden-${String(index).padStart(2, "0")}-v1`)
        )
      ),
      weeklyPlanBudgetVnd: 700_000,
      recentMealOptionIds
    }
    const normalized = normalizePlannerInput(input)
    if (!normalized.ok) throw new Error("invalid fixture")
    const eligibility = evaluatePlannerEligibility(normalized.value)
    if (!eligibility.ok) throw new Error("ineligible fixture")
    return searchWeek(
      eligibility.value.eligible,
      normalized.value.weeklyPlanBudgetVnd,
      normalized.value.softPreferenceCodes,
      normalized.value.calculationDate,
      normalized.value.priceFreshnessConfig,
      normalized.value.plannerConfig,
      [],
      normalized.value.recentMealOptionIds ?? []
    )
  }

  function chosenIds(result: ReturnType<typeof planWithHistory>) {
    if (!("plan" in result)) throw new Error("expected a ready plan")
    return result.plan.items.map((item) => item.mealOptionId)
  }

  test("passes over a meal cooked last week when the catalogue can spare it", () => {
    // Nine candidates for seven days: dropping two is possible, so the planner should drop the two
    // it just cooked rather than any others.
    const baseline = chosenIds(planWithHistory([]))
    const avoided = baseline.slice(0, 2)
    const withHistory = chosenIds(planWithHistory(avoided))

    expect(withHistory).not.toContain(avoided[0])
    expect(withHistory).not.toContain(avoided[1])
    expect(new Set(withHistory).size).toBe(7)
  })

  test("still returns a week when every candidate was cooked recently", () => {
    // The reason this is a penalty and not a bar. A household with a small catalogue must get a
    // plan that repeats, never NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH.
    const everything = chosenIds(planWithHistory([]))
    const result = planWithHistory(everything, 7)

    expect("plan" in result).toBe(true)
    if (!("plan" in result)) return
    expect(result.plan.score.metrics.recentlyCookedOccurrences).toBe(7)
  })

  test("plans the same week as before when no history is stated", () => {
    // An input built before this field existed must be unaffected, whatever the engine version says.
    expect(chosenIds(planWithHistory([]))).toEqual(chosenIds(planWithHistory([])))
  })
})

describe("meals the household has an opinion about", () => {
  function planWithRatings(ratings: MealOptionRatings, count = 9) {
    const input: PlannerInputV1 = {
      ...plannerInput(
        Array.from({ length: count }, (_, index) =>
          plannerCandidate(`golden-${String(index).padStart(2, "0")}-v1`)
        )
      ),
      weeklyPlanBudgetVnd: 700_000,
      mealOptionRatings: ratings
    }
    const normalized = normalizePlannerInput(input)
    if (!normalized.ok) throw new Error("invalid fixture")
    const eligibility = evaluatePlannerEligibility(normalized.value)
    if (!eligibility.ok) throw new Error("ineligible fixture")
    return searchWeek(
      eligibility.value.eligible,
      normalized.value.weeklyPlanBudgetVnd,
      normalized.value.softPreferenceCodes,
      normalized.value.calculationDate,
      normalized.value.priceFreshnessConfig,
      normalized.value.plannerConfig,
      [],
      [],
      normalized.value.mealOptionRatings ?? EMPTY_MEAL_OPTION_RATINGS
    )
  }

  function chosenIds(result: ReturnType<typeof planWithRatings>) {
    if (!("plan" in result)) throw new Error("expected a ready plan")
    return result.plan.items.map((item) => item.mealOptionId)
  }

  test("passes over a disliked meal when the catalogue can spare it", () => {
    // Nine candidates for seven days, so two can be dropped. The two the household rejected are the
    // two that should go.
    const baseline = chosenIds(planWithRatings(EMPTY_MEAL_OPTION_RATINGS))
    const rejected = baseline.slice(0, 2)
    const withRatings = chosenIds(planWithRatings({ liked: [], disliked: rejected }))

    expect(withRatings).not.toContain(rejected[0])
    expect(withRatings).not.toContain(rejected[1])
    expect(new Set(withRatings).size).toBe(7)
  })

  test("still returns a week when the household dislikes everything it can eat", () => {
    // The reason this is a penalty and not an exclusion. Taste must never be able to produce
    // NO_COMPLETE_PLAN_FOUND: a household that has rejected most of a small catalogue still has to
    // eat, and allergies are the only thing allowed to empty the list.
    const everything = chosenIds(planWithRatings(EMPTY_MEAL_OPTION_RATINGS))
    const result = planWithRatings({ liked: [], disliked: everything }, 7)

    expect("plan" in result).toBe(true)
    expect(chosenIds(result)).toHaveLength(7)
  })
})
