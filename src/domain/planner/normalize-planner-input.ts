import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"
import { normalizePantrySnapshotV1 } from "@/domain/pantry/normalize-pantry-snapshot"
import { calculateAdultEquivalent } from "@/domain/portion/calculate-adult-equivalent"
import { PORTION_CONFIG_V1 } from "@/domain/portion/portion-config"
import { PRICE_FRESHNESS_CONFIG_V1 } from "@/domain/pricing/pricing"

import { PLANNER_CONFIG_V1 } from "./planner-config"
import type {
  NormalizedPlannerInputV1,
  PlannerCandidateInput,
  PlannerInputV1
} from "./planner-input"
import type { PlannerFatalCode } from "./planner-outcome"

type NormalizeResult =
  | { readonly ok: true; readonly value: NormalizedPlannerInputV1 }
  | { readonly ok: false; readonly error: { readonly code: PlannerFatalCode } }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function canonicalCandidate(candidate: PlannerCandidateInput): PlannerCandidateInput {
  return {
    ...candidate,
    ingredientLineage: [...candidate.ingredientLineage].sort((left, right) => {
      const leftKey = `${left.mealOptionRecipeId}:${left.recipeIngredientId}`
      const rightKey = `${right.mealOptionRecipeId}:${right.recipeIngredientId}`
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    }),
    prices: [...candidate.prices].sort((left, right) =>
      left.foodId === right.foodId
        ? left.foodPriceId.localeCompare(right.foodPriceId)
        : left.foodId.localeCompare(right.foodId)
    )
  }
}

function knownRules(codes: readonly string[], expectedKind: "hard" | "soft"): boolean {
  return codes.every((code) => {
    const option = HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)
    return (
      option !== undefined && (expectedKind === "soft") === (option.ruleKind === "soft_preference")
    )
  })
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

export function normalizePlannerInput(input: PlannerInputV1): NormalizeResult {
  if (input.candidates.length > PLANNER_CONFIG_V1.candidateLimit) {
    return { ok: false, error: { code: "CATALOG_CANDIDATE_LIMIT_EXCEEDED" } }
  }
  const weekTimestamp = Date.parse(`${input.weekStart}T00:00:00.000Z`)
  const memberResult = calculateAdultEquivalent(input.memberGroups, PORTION_CONFIG_V1)
  const candidateIds = input.candidates.map((item) => item.mealOption.mealOptionVersionId)
  const pantryResult = normalizePantrySnapshotV1(
    input.pantrySnapshot.items.map((item) => ({
      ...item,
      foodFactFoodId: item.foodId,
      foodBaseUnitId: item.baseUnitId
    }))
  )
  if (
    input.householdId.trim() === "" ||
    !Number.isSafeInteger(input.householdSetupVersion) ||
    input.householdSetupVersion < 1 ||
    !validDate(input.weekStart) ||
    new Date(weekTimestamp).getUTCDay() !== 1 ||
    input.timezone !== "Asia/Ho_Chi_Minh" ||
    !validDate(input.calculationDate) ||
    !Number.isSafeInteger(input.weeklyPlanBudgetVnd) ||
    input.weeklyPlanBudgetVnd < 1 ||
    !Number.isSafeInteger(input.maxElapsedMinutes) ||
    input.maxElapsedMinutes < 1 ||
    input.maxElapsedMinutes > 180 ||
    !memberResult.ok ||
    !pantryResult.ok ||
    hasDuplicates(input.hardRuleCodes) ||
    hasDuplicates(input.softPreferenceCodes) ||
    !knownRules(input.hardRuleCodes, "hard") ||
    !knownRules(input.softPreferenceCodes, "soft") ||
    hasDuplicates(candidateIds) ||
    input.candidates.some(
      (candidate) =>
        hasDuplicates(candidate.prices.map((price) => price.foodPriceId)) ||
        hasDuplicates(
          candidate.ingredientLineage.map(
            (lineage) => `${lineage.mealOptionRecipeId}:${lineage.recipeIngredientId}`
          )
        )
    )
  ) {
    return { ok: false, error: { code: "INVALID_PLANNER_INPUT" } }
  }

  return {
    ok: true,
    value: {
      ...input,
      timezone: "Asia/Ho_Chi_Minh",
      memberGroups: memberResult.value.memberGroups,
      hardRuleCodes: [...input.hardRuleCodes].sort(),
      softPreferenceCodes: [...input.softPreferenceCodes].sort(),
      pantrySnapshot: pantryResult.value,
      candidates: input.candidates
        .map(canonicalCandidate)
        .sort((left, right) =>
          left.mealOption.mealOptionVersionId.localeCompare(right.mealOption.mealOptionVersionId)
        ),
      dayIndexes: [0, 1, 2, 3, 4, 5, 6],
      mealSlot: "primary",
      portionConfig: PORTION_CONFIG_V1,
      priceFreshnessConfig: PRICE_FRESHNESS_CONFIG_V1,
      plannerConfig: PLANNER_CONFIG_V1
    }
  }
}
