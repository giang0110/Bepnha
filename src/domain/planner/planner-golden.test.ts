import { describe, expect, test } from "vitest"

import { evaluatePlannerEligibility } from "./evaluate-eligibility"
import { normalizePlannerInput } from "./normalize-planner-input"
import { plannerCandidate, plannerInput } from "./planner-test-fixture"
import type { PlannerInputV1 } from "./planner-input"
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
