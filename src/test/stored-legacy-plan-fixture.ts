import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"
import type { PlannerInputV1 } from "@/domain/planner/planner-input"
import { searchWeek } from "@/domain/planner/search-week"

export function storedLegacyRevision(
  input: PlannerInputV1 = plannerInput(
    Array.from({ length: 7 }, (_, i) => plannerCandidate(`stored-${i}-v1`))
  )
) {
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) throw new Error("Invalid fixture input")
  const eligible = evaluatePlannerEligibility(normalized.value)
  if (!eligible.ok) throw new Error("Invalid fixture catalog")
  const result = searchWeek(
    eligible.value.eligible,
    input.weeklyPlanBudgetVnd,
    [],
    input.calculationDate
  )
  if (!("plan" in result)) throw new Error("Invalid fixture week")
  return {
    plan: {
      id: "plan-1",
      household_id: input.householdId,
      week_start: input.weekStart,
      version: 4,
      current_revision_id: "current-revision"
    },
    revision: {
      id: "historical-revision",
      engine_version: "planner-engine-v5",
      revision_number: 2,
      household_setup_version: input.householdSetupVersion,
      budget_vnd: input.weeklyPlanBudgetVnd,
      budget_status: "within",
      calculation_date: input.calculationDate,
      total_estimated_cost_vnd: result.plan.totalEstimatedCostVnd,
      warnings: [],
      input_fingerprint: "a".repeat(64),
      input_snapshot: {
        household: {
          householdId: input.householdId,
          setupVersion: input.householdSetupVersion,
          memberGroups: input.memberGroups,
          hardRuleCodes: input.hardRuleCodes,
          softPreferenceCodes: input.softPreferenceCodes,
          weeklyPlanBudgetVnd: input.weeklyPlanBudgetVnd,
          maxElapsedMinutes: input.maxElapsedMinutes
        },
        candidateManifest: input.candidates.map((candidate) => ({ prices: candidate.prices }))
      },
      calculation_snapshot: {
        items: result.plan.items,
        selectedMealOptions: result.plan.selected,
        purchaseBasket: result.plan.purchaseBasket,
        score: result.plan.score
      }
    }
  }
}
