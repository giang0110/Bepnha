import { expect, test } from "vitest"

import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"
import { searchWeek } from "@/domain/planner/search-week"

test("reports launch-size bounded planner evidence outside the domain", () => {
  const normalized = normalizePlannerInput(
    plannerInput(
      Array.from({ length: 20 }, (_, index) =>
        plannerCandidate(`benchmark-${String(index).padStart(3, "0")}-v1`)
      )
    )
  )
  if (!normalized.ok) throw new Error("benchmark input invalid")
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) throw new Error("benchmark candidates ineligible")

  const startedAt = performance.now()
  const result = searchWeek(
    eligibility.value.eligible,
    normalized.value.weeklyPlanBudgetVnd,
    normalized.value.softPreferenceCodes,
    normalized.value.calculationDate,
    normalized.value.priceFreshnessConfig,
    normalized.value.plannerConfig
  )
  const durationMs = performance.now() - startedAt
  if (!("plan" in result)) throw new Error("benchmark planner did not complete")

  expect(result.plan.frontierMetrics).toHaveLength(7)
  expect(result.plan.frontierMetrics.every((metric) => metric.unionSize <= 250)).toBe(true)
  expect(result.plan.items).toHaveLength(7)
  console.info(
    JSON.stringify({
      benchmark: "planner-launch-size-v1",
      candidateCount: eligibility.value.eligible.length,
      maxFrontierSize: Math.max(...result.plan.frontierMetrics.map((item) => item.unionSize)),
      exploredStates: result.plan.frontierMetrics.reduce((sum, item) => sum + item.expandedSize, 0),
      durationMs: Math.round(durationMs)
    })
  )
})
