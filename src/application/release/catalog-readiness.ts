import { evaluatePlannerEligibility, type EligibilityRejection } from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import type { PlannerInputV1 } from "@/domain/planner/planner-input"

export interface CatalogReadinessScenarioResult {
  readonly scenarioCode: string
  readonly eligibleMealOptionCount: number
  readonly minimumEligibleMealOptionCount: 21
  readonly proteinCapacityOk: boolean
  readonly coverageOk: boolean
  readonly blockers: readonly string[]
  readonly ready: boolean
}

const MINIMUM_ELIGIBLE_MEAL_OPTION_COUNT = 21 as const
const MINIMUM_PRIMARY_PROTEIN_GROUP_COUNT = 3

function isCoverageRejection(rejection: EligibilityRejection): boolean {
  return rejection.stage === 1 || rejection.stage === 2 || rejection.stage >= 5
}

function isCoverageFatal(code: string): boolean {
  return code === "INCOMPLETE_CATALOG_LINEAGE" || code === "NO_USABLE_PRICE"
}

function result(
  scenarioCode: string,
  eligibleMealOptionCount: number,
  proteinCapacityOk: boolean,
  coverageOk: boolean,
  domainBlocker?: string
): CatalogReadinessScenarioResult {
  const blockers: string[] = []
  if (eligibleMealOptionCount < MINIMUM_ELIGIBLE_MEAL_OPTION_COUNT) {
    blockers.push("MINIMUM_ELIGIBLE_MEAL_OPTIONS_NOT_MET")
  }
  if (!proteinCapacityOk) blockers.push("INSUFFICIENT_PRIMARY_PROTEIN_GROUP_CAPACITY")
  if (!coverageOk) blockers.push("CATALOG_COVERAGE_INCOMPLETE")
  if (domainBlocker !== undefined && !blockers.includes(domainBlocker)) blockers.push(domainBlocker)

  return {
    scenarioCode,
    eligibleMealOptionCount,
    minimumEligibleMealOptionCount: MINIMUM_ELIGIBLE_MEAL_OPTION_COUNT,
    proteinCapacityOk,
    coverageOk,
    blockers,
    ready:
      eligibleMealOptionCount >= MINIMUM_ELIGIBLE_MEAL_OPTION_COUNT &&
      proteinCapacityOk &&
      coverageOk
  }
}

export function evaluateCatalogReadiness(
  input: PlannerInputV1,
  scenarioCode: string
): CatalogReadinessScenarioResult {
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) return result(scenarioCode, 0, false, false, normalized.error.code)

  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) {
    return result(
      scenarioCode,
      0,
      false,
      !isCoverageFatal(eligibility.error.code),
      eligibility.error.code
    )
  }

  const eligible = eligibility.value.eligible
  const primaryProteinGroupCount = new Set(eligible.map((item) => item.primaryProteinGroup)).size
  const coverageOk = !eligibility.value.rejected.some(isCoverageRejection)

  return result(
    scenarioCode,
    eligible.length,
    primaryProteinGroupCount >= MINIMUM_PRIMARY_PROTEIN_GROUP_COUNT,
    coverageOk
  )
}
