import { expect, test } from "vitest"

import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"
import { searchWeek } from "@/domain/planner/search-week"

interface PerformanceScenario {
  readonly name: "small" | "median" | "max"
  readonly candidateCount: number
  readonly adultCount: number
}

const scenarios: readonly PerformanceScenario[] = [
  { name: "small", candidateCount: 8, adultCount: 1 },
  { name: "median", candidateCount: 24, adultCount: 4 },
  { name: "max", candidateCount: 40, adultCount: 8 }
]

function runScenario(scenario: PerformanceScenario) {
  const input = {
    ...plannerInput(
      Array.from({ length: scenario.candidateCount }, (_, index) =>
        plannerCandidate(`performance-${scenario.name}-${String(index).padStart(3, "0")}-v1`)
      )
    ),
    memberGroups: [
      { memberKind: "adult" as const, ageBand: "adult" as const, memberCount: scenario.adultCount }
    ]
  }
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) throw new Error(`${scenario.name} performance input invalid`)
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) throw new Error(`${scenario.name} performance candidates ineligible`)

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
  if (!("plan" in result)) throw new Error(`${scenario.name} planner did not complete`)

  return {
    result,
    durationMs,
    candidateCount: eligibility.value.eligible.length,
    maxFrontierSize: Math.max(...result.plan.frontierMetrics.map((metric) => metric.unionSize)),
    exploredStates: result.plan.frontierMetrics.reduce((sum, metric) => sum + metric.expandedSize, 0)
  }
}

test.each(scenarios)(
  "records deterministic planner performance baseline for $name launch fixture",
  (scenario) => {
    const first = runScenario(scenario)
    const second = runScenario(scenario)

    expect(second.result.plan.stableIdSequence).toBe(first.result.plan.stableIdSequence)
    expect(second.result.plan.totalEstimatedCostVnd).toBe(first.result.plan.totalEstimatedCostVnd)
    expect(first.result.plan.items).toHaveLength(7)
    expect(first.maxFrontierSize).toBeLessThanOrEqual(250)

    console.info(
      JSON.stringify({
        benchmark: "planner-phase6-regression-baseline-v1",
        scenario: scenario.name,
        adultCount: scenario.adultCount,
        candidateCount: first.candidateCount,
        maxFrontierSize: first.maxFrontierSize,
        exploredStates: first.exploredStates,
        firstDurationMs: Math.round(first.durationMs),
        secondDurationMs: Math.round(second.durationMs)
      })
    )
  }
)
