import {
  evaluatePlannerEligibility,
  type EligibilityRejection
} from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import type { PlannerInputV1 } from "@/domain/planner/planner-input"
import {
  evaluatePlannerEligibilityV2,
  normalizePlannerInputV2,
  type PlannerInputV2
} from "@/domain/planner/planner-v2"
import { validateFoodQuantityPolicyDefinition } from "@/domain/recipe/food-quantity-policy"
import { normalizeFoodPriceV2 } from "@/domain/pricing/purchasing-v2"

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
const VEGETARIAN_MINIMUM_PRIMARY_PROTEIN_GROUP_COUNT = 1

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
): CatalogReadinessScenarioResult
export function evaluateCatalogReadiness(
  input: PlannerInputV2,
  scenarioCode: string
): CatalogReadinessScenarioResult
export function evaluateCatalogReadiness(
  input: PlannerInputV1 | PlannerInputV2,
  scenarioCode: string
): CatalogReadinessScenarioResult {
  if ("inputVersion" in input) return evaluateNutritionReadiness(input, scenarioCode)
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
  const minimumPrimaryProteinGroupCount = normalized.value.hardRuleCodes.includes("diet_vegetarian")
    ? VEGETARIAN_MINIMUM_PRIMARY_PROTEIN_GROUP_COUNT
    : MINIMUM_PRIMARY_PROTEIN_GROUP_COUNT
  const coverageOk = !eligibility.value.rejected.some(isCoverageRejection)

  return result(
    scenarioCode,
    eligible.length,
    primaryProteinGroupCount >= minimumPrimaryProteinGroupCount,
    coverageOk
  )
}

function evaluateNutritionReadiness(
  input: PlannerInputV2,
  scenarioCode: string
): CatalogReadinessScenarioResult {
  const normalized = normalizePlannerInputV2(input)
  if (!normalized.ok) return result(scenarioCode, 0, false, false, normalized.error.code)
  const metadataBlockers = new Set<string>()
  for (const candidate of normalized.value.candidates) {
    for (const ingredient of candidate.mealOption.components.flatMap((c) => c.recipe.ingredients)) {
      const policy = candidate.quantityPolicies.find(
        (p) => p.foodFactVersionId === ingredient.foodFactVersionId
      )
      if (!policy) metadataBlockers.add("MISSING_QUANTITY_POLICY")
      else if (ingredient.conversion !== null) {
        const checked = validateFoodQuantityPolicyDefinition(policy, ingredient.conversion)
        if (!checked.ok) metadataBlockers.add(checked.error.code)
      }
    }
    for (const price of candidate.prices) {
      if (
        !price.purchaseProvenance.trim() ||
        !/^[a-f0-9]{64}$/u.test(price.purchaseTermsContentHash)
      )
        metadataBlockers.add("PURCHASE_TERMS_UNVERIFIED")
      const checked = normalizeFoodPriceV2(price)
      if (!checked.ok) metadataBlockers.add(checked.error.code)
    }
  }
  const eligibility = evaluatePlannerEligibilityV2(normalized.value)
  let base: CatalogReadinessScenarioResult
  if (!eligibility.ok) {
    base = result(
      scenarioCode,
      0,
      false,
      metadataBlockers.size === 0 && !isCoverageFatal(eligibility.error.code),
      eligibility.error.code
    )
  } else {
    const groups = new Set(eligibility.value.eligible.map((e) => e.primaryProteinGroup)).size
    const minimum = normalized.value.hardRuleCodes.includes("diet_vegetarian")
      ? VEGETARIAN_MINIMUM_PRIMARY_PROTEIN_GROUP_COUNT
      : MINIMUM_PRIMARY_PROTEIN_GROUP_COUNT
    for (const rejected of eligibility.value.rejected.filter(isCoverageRejection))
      metadataBlockers.add(rejected.code)
    base = result(
      scenarioCode,
      eligibility.value.eligible.length,
      groups >= minimum,
      metadataBlockers.size === 0
    )
  }
  return {
    ...base,
    blockers: [...new Set([...base.blockers, ...[...metadataBlockers].sort()])],
    ready: base.ready && metadataBlockers.size === 0
  }
}
