import { plannerCandidateV2, plannerInputV2 } from "@/domain/planner/planner-v2-test-fixture"
import {
  normalizePlannerInputV2,
  evaluatePlannerEligibilityV2,
  searchWeekV2
} from "@/domain/planner/planner-v2"
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

const TEST_WRAPPER_TIMEOUT_MS = 15_000

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
  },
  TEST_WRAPPER_TIMEOUT_MS
)

function runScenarioV2(scenario: PerformanceScenario) {
  const input = {
    ...plannerInputV2(
      Array.from({ length: scenario.candidateCount }, (_, i) =>
        plannerCandidateV2(`performance-v2-${scenario.name}-${String(i).padStart(3, "0")}-v1`)
      )
    ),
    memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: scenario.adultCount }],
    nutritionSetup: {
      version: "household-nutrition-v1" as const,
      plannedMealSharePercent: 33,
      memberProfiles: Array.from({ length: scenario.adultCount }, (_, i) => ({
        id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        memberKind: "adult" as const,
        sortOrder: i + 1,
        label: null,
        heightCm: "170",
        weightKg: "65",
        ageYears: 30,
        sexForEquation: "male" as const,
        activityLevel: "light" as const,
        goal: "maintain" as const
      }))
    }
  }
  const normalized = normalizePlannerInputV2(input)
  if (!normalized.ok) throw new Error(normalized.error.code)
  const eligibility = evaluatePlannerEligibilityV2(normalized.value)
  if (!eligibility.ok) throw new Error(eligibility.error.code)
  const startedAt = performance.now()
  const result = searchWeekV2(normalized.value, eligibility.value.eligible)
  const durationMs = performance.now() - startedAt
  if (!("plan" in result)) throw new Error(result.error.code)
  return {
    result,
    durationMs,
    maxFrontierSize: Math.max(...result.plan.frontierMetrics.map((m) => m.unionSize)),
    exploredStates: result.plan.frontierMetrics.reduce((n, m) => n + m.expandedSize, 0)
  }
}
test.each(scenarios)(
  "guards personalized v2 planner performance for $name fixture",
  (scenario) => {
    const first = runScenarioV2(scenario)
    const second = runScenarioV2(scenario)
    expect(second.result.plan.stableIdSequence).toBe(first.result.plan.stableIdSequence)
    expect(second.result.plan.totalEstimatedCostVnd).toBe(first.result.plan.totalEstimatedCostVnd)
    expect(first.result.plan.items).toHaveLength(7)
    expect(first.maxFrontierSize).toBeLessThanOrEqual(250)
    expect(first.exploredStates).toBeLessThanOrEqual(scenario.exploredStatesCeiling)
    expect(second.exploredStates).toBe(first.exploredStates)
    expect(first.durationMs).toBeLessThanOrEqual(scenario.durationCeilingMs)
    expect(second.durationMs).toBeLessThanOrEqual(scenario.durationCeilingMs)
    console.info(
      JSON.stringify({
        benchmark: "planner-v2-regression-gate",
        measurementKind: "ci_regression_guard_not_production_p95",
        scenario: scenario.name,
        firstDurationMs: Math.round(first.durationMs),
        secondDurationMs: Math.round(second.durationMs),
        maxFrontierSize: first.maxFrontierSize,
        exploredStates: first.exploredStates
      })
    )
  },
  TEST_WRAPPER_TIMEOUT_MS
)
