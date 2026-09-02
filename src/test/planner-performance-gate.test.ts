import { expect, test } from "vitest"

import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"
import { searchWeek } from "@/domain/planner/search-week"

interface PerformanceScenario {
  readonly name: "small" | "median" | "max"
  readonly candidateCount: number
  readonly adultCount: number
  readonly exploredStatesCeiling: number
  readonly durationCeilingMs: number
}

// Hosted-runner ceilings intentionally have generous headroom. This suite is a deterministic
// gross-regression guard; it is not evidence that the production-like p95 < 2 s launch SLO holds.
const scenarios: readonly PerformanceScenario[] = [
  {
    name: "small",
    candidateCount: 8,
    adultCount: 1,
    exploredStatesCeiling: 5_000,
    durationCeilingMs: 5_000
  },
  {
    name: "median",
    candidateCount: 24,
    adultCount: 4,
    exploredStatesCeiling: 30_000,
    durationCeilingMs: 5_000
  },
  {
    name: "max",
    candidateCount: 40,
    adultCount: 8,
    exploredStatesCeiling: 60_000,
    durationCeilingMs: 5_000
  }
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
    exploredStates: result.plan.frontierMetrics.reduce(
      (sum, metric) => sum + metric.expandedSize,
      0
    )
  }
}

test.each(scenarios)(
  "guards deterministic planner performance for $name launch fixture",
  (scenario) => {
    const first = runScenario(scenario)
    const second = runScenario(scenario)

    expect(second.result.plan.stableIdSequence).toBe(first.result.plan.stableIdSequence)
    expect(second.result.plan.totalEstimatedCostVnd).toBe(first.result.plan.totalEstimatedCostVnd)
    expect(second.maxFrontierSize).toBe(first.maxFrontierSize)
    expect(second.exploredStates).toBe(first.exploredStates)
    expect(first.result.plan.items).toHaveLength(7)
    expect(first.maxFrontierSize).toBeLessThanOrEqual(250)
    expect(first.exploredStates).toBeLessThanOrEqual(scenario.exploredStatesCeiling)
    expect(second.exploredStates).toBeLessThanOrEqual(scenario.exploredStatesCeiling)
    expect(first.durationMs).toBeLessThanOrEqual(scenario.durationCeilingMs)
    expect(second.durationMs).toBeLessThanOrEqual(scenario.durationCeilingMs)

    console.info(
      JSON.stringify({
        benchmark: "planner-phase6-regression-gate-v1",
        measurementKind: "ci_regression_guard_not_production_p95",
        productionLikeTarget: "p95 < 2000ms",
        scenario: scenario.name,
        adultCount: scenario.adultCount,
        candidateCount: first.candidateCount,
        maxFrontierSize: first.maxFrontierSize,
        exploredStates: first.exploredStates,
        exploredStatesCeiling: scenario.exploredStatesCeiling,
        firstDurationMs: Math.round(first.durationMs),
        secondDurationMs: Math.round(second.durationMs),
        durationCeilingMs: scenario.durationCeilingMs
      })
    )
  }
)
