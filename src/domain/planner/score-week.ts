import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "@/domain/household/household-rules"
import type { CanonicalFoodDeduction, PurchaseBasketResult } from "@/domain/pricing/pricing"
import { ExactDecimal, ROUND_HALF_UP } from "@/domain/shared/decimal"

import type { EligibleMealOption } from "./evaluate-eligibility"
import { PLANNER_CONFIG_V1, type PlannerConfigV1 } from "./planner-config"
import { scorePantryReuse } from "./score-pantry-reuse"

type PurchaseBasket = Extract<PurchaseBasketResult, { readonly ok: true }>["value"]

export interface WeeklyPlanScore {
  readonly totalQualityPenalty: number
  readonly components: {
    readonly primaryProteinRepetition: number
    readonly cookingStyleVariety: number
    readonly adjacentPrimaryProtein: number
    readonly composition: number
    readonly ingredientReuse: number
    readonly packageLeftover: number
    readonly pantryReuse: number
    readonly preferences: number
  }
  readonly metrics: {
    readonly repeatedPrimaryProteinOccurrences: number
    readonly distinctPrimaryCookingStyleCount: number
    readonly adjacentSamePrimaryProteinCount: number
    readonly missingRoleAssignments: number
    readonly eligibleDistinctFoodCount: number
    readonly reusedDistinctFoodCount: number
    readonly pantryEligibleFoodCount: number
    readonly pantryCoveredFoodCount: number
    readonly unmatchedPreferenceAssignments: number
    readonly preferenceAssignmentCount: number
  }
  readonly explanations: readonly string[]
}

export function scaledPenalty(weight: number, numerator: number, denominator: number): number {
  if (denominator <= 0) return weight
  const value = new ExactDecimal(weight)
    .times(Math.max(0, numerator))
    .div(denominator)
    .toDecimalPlaces(0, ROUND_HALF_UP)
    .toNumber()
  return Math.min(weight, Math.max(0, value))
}

function preferenceMatches(option: EligibleMealOption, code: string): boolean {
  const rule = HOUSEHOLD_RULE_OPTION_BY_CODE.get(code as HouseholdRuleCode)
  if (rule === undefined || rule.ruleKind !== "soft_preference") return false
  if (code === "prefer_vegetable_forward") return option.roles.includes("vegetable")
  if (code === "prefer_soup") return option.roles.includes("soup")
  return option.foodCategoryCodes.includes(rule.targetKey)
}

export function scoreWeeklyPlan(
  selected: readonly EligibleMealOption[],
  basket: PurchaseBasket,
  softPreferenceCodes: readonly string[],
  config: PlannerConfigV1 = PLANNER_CONFIG_V1,
  pantryDeductions: readonly CanonicalFoodDeduction[] = []
): WeeklyPlanScore {
  const proteinGroups = selected.map((item) => item.primaryProteinGroup)
  const repeatedPrimaryProteinOccurrences = Math.max(
    0,
    selected.length - new Set(proteinGroups).size
  )
  const distinctStyles = new Set(selected.flatMap((item) => item.cookingStyleCodes)).size
  const adjacentSamePrimaryProteinCount = proteinGroups
    .slice(1)
    .filter((protein, index) => protein === proteinGroups[index]).length
  const missingRoleAssignments = selected.reduce((total, option) => {
    const roles = new Set(option.roles)
    return (
      total +
      (roles.has("staple") ? 0 : 1) +
      (roles.has("main") ? 0 : 1) +
      (roles.has("vegetable") || roles.has("soup") ? 0 : 1)
    )
  }, 0)

  const daysByFood = new Map<string, Set<number>>()
  for (const [dayIndex, option] of selected.entries()) {
    for (const foodId of new Set(option.requirements.map((item) => item.foodId))) {
      const ignored = option.foodCategoryCodesByFood[foodId]?.some((code) =>
        config.ignoredReuseCategoryCodes.includes(
          code as (typeof config.ignoredReuseCategoryCodes)[number]
        )
      )
      if (ignored === true) continue
      const days = daysByFood.get(foodId) ?? new Set<number>()
      days.add(dayIndex)
      daysByFood.set(foodId, days)
    }
  }
  const eligibleDistinctFoodCount = daysByFood.size
  const reusedDistinctFoodCount = [...daysByFood.values()].filter((days) => days.size >= 2).length

  const leftoverMean =
    basket.lines.length === 0
      ? new ExactDecimal(1)
      : basket.lines
          .reduce(
            (sum, line) =>
              sum.plus(
                line.purchaseBaseQuantity === "0"
                  ? 0
                  : new ExactDecimal(line.leftoverBaseQuantity).div(line.purchaseBaseQuantity)
              ),
            new ExactDecimal(0)
          )
          .div(basket.lines.length)
  const pantryReuse = scorePantryReuse(
    selected.flatMap((option) => option.requirements),
    pantryDeductions,
    config.reuseWeights.pantryReuse
  )
  const unmatchedPreferenceAssignments = softPreferenceCodes.reduce(
    (total, preference) =>
      total + selected.filter((option) => !preferenceMatches(option, preference)).length,
    0
  )
  const preferenceAssignmentCount = softPreferenceCodes.length * selected.length

  const components = {
    primaryProteinRepetition: scaledPenalty(
      config.diversityWeights.primaryProteinRepetition,
      repeatedPrimaryProteinOccurrences,
      6
    ),
    cookingStyleVariety: scaledPenalty(
      config.diversityWeights.primaryCookingStyleVariety,
      Math.max(0, 7 - distinctStyles),
      6
    ),
    adjacentPrimaryProtein: scaledPenalty(
      config.diversityWeights.adjacentPrimaryProteinReuse,
      adjacentSamePrimaryProteinCount,
      6
    ),
    composition: scaledPenalty(
      config.scoringWeights.nutritionComposition,
      missingRoleAssignments,
      21
    ),
    ingredientReuse:
      eligibleDistinctFoodCount === 0
        ? config.reuseWeights.distinctFoodReuse
        : scaledPenalty(
            config.reuseWeights.distinctFoodReuse,
            eligibleDistinctFoodCount - reusedDistinctFoodCount,
            eligibleDistinctFoodCount
          ),
    packageLeftover: new ExactDecimal(config.reuseWeights.packageLeftover)
      .times(leftoverMean)
      .toDecimalPlaces(0, ROUND_HALF_UP)
      .toNumber(),
    pantryReuse: pantryReuse.penalty,
    preferences:
      preferenceAssignmentCount === 0
        ? 0
        : scaledPenalty(
            config.scoringWeights.preferences,
            unmatchedPreferenceAssignments,
            preferenceAssignmentCount
          )
  }
  return {
    totalQualityPenalty: Object.values(components).reduce((sum, value) => sum + value, 0),
    components,
    metrics: {
      repeatedPrimaryProteinOccurrences,
      distinctPrimaryCookingStyleCount: distinctStyles,
      adjacentSamePrimaryProteinCount,
      missingRoleAssignments,
      eligibleDistinctFoodCount,
      reusedDistinctFoodCount,
      pantryEligibleFoodCount: pantryReuse.eligibleFoodCount,
      pantryCoveredFoodCount: pantryReuse.coveredFoodCount,
      unmatchedPreferenceAssignments,
      preferenceAssignmentCount
    },
    explanations: [
      "DIVERSITY_PRIMARY_PROTEIN_REPETITION",
      "DIVERSITY_COOKING_STYLE_VARIETY",
      "DIVERSITY_ADJACENT_PRIMARY_PROTEIN",
      "COMPOSITION_MEAL_ROLES",
      "REUSE_DISTINCT_FOODS",
      "REUSE_PACKAGE_LEFTOVER",
      "REUSE_PANTRY_COVERAGE",
      "PREFERENCES_MATCH"
    ]
  }
}
