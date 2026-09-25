import {
  HOUSEHOLD_RULE_OPTION_BY_CODE,
  type HouseholdRuleCode
} from "../household/household-rules.js"
import type { CanonicalFoodDeduction, PurchaseBasketResult } from "../pricing/pricing.js"
import { ExactDecimal, ROUND_HALF_UP } from "../shared/decimal.js"

import type { EligibleMealOption } from "./evaluate-eligibility.js"
import { PLANNER_CONFIG_V1, type PlannerConfigV1 } from "./planner-config.js"
import { scorePantryReuse } from "./score-pantry-reuse.js"

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
    readonly recentWeekRepetition: number
    readonly mealRating: number
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
    readonly recentlyCookedOccurrences: number
    readonly likedOccurrences: number
    readonly dislikedOccurrences: number
  }
  readonly explanations: readonly string[]
}

/**
 * What a household has said about individual meals. Absence is not neutrality recorded, it is
 * nothing said: a household that has never rated anything pays no rating penalty at all.
 */
export interface MealOptionRatings {
  readonly liked: readonly string[]
  readonly disliked: readonly string[]
}

export const EMPTY_MEAL_OPTION_RATINGS: MealOptionRatings = Object.freeze({
  liked: Object.freeze([]),
  disliked: Object.freeze([])
})

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
  pantryDeductions: readonly CanonicalFoodDeduction[] = [],
  recentMealOptionIds: readonly string[] = [],
  ratings: MealOptionRatings = EMPTY_MEAL_OPTION_RATINGS
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

  // Counted over the week being scored, not over the history: the history may name the same dish
  // once per week it was cooked, and what is being charged for is this week repeating it.
  const recentlyCooked = new Set(recentMealOptionIds)
  const recentlyCookedOccurrences = selected.filter((option) =>
    recentlyCooked.has(option.mealOptionId)
  ).length

  // Two demerits for a meal the household rejected, one for a meal it has no opinion on, none for
  // one it asked for. A week of liked meals therefore scores best and a week of rejected ones worst,
  // with silence in between — and a household that has rated nothing pays nothing, because the
  // whole term switches off rather than charging everyone a standing fee for having no opinions.
  const liked = new Set(ratings.liked)
  const disliked = new Set(ratings.disliked)
  const likedOccurrences = selected.filter((option) => liked.has(option.mealOptionId)).length
  const dislikedOccurrences = selected.filter((option) => disliked.has(option.mealOptionId)).length
  const hasRatings = liked.size > 0 || disliked.size > 0
  const ratingDemerits =
    dislikedOccurrences * 2 + (selected.length - likedOccurrences - dislikedOccurrences)

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
          ),
    recentWeekRepetition: scaledPenalty(
      config.scoringWeights.recentWeekRepetition,
      recentlyCookedOccurrences,
      config.dayCount
    ),
    mealRating: hasRatings
      ? scaledPenalty(config.scoringWeights.mealRating, ratingDemerits, config.dayCount * 2)
      : 0
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
      preferenceAssignmentCount,
      recentlyCookedOccurrences,
      likedOccurrences,
      dislikedOccurrences
    },
    explanations: [
      "DIVERSITY_PRIMARY_PROTEIN_REPETITION",
      "DIVERSITY_COOKING_STYLE_VARIETY",
      "DIVERSITY_ADJACENT_PRIMARY_PROTEIN",
      "COMPOSITION_MEAL_ROLES",
      "REUSE_DISTINCT_FOODS",
      "REUSE_PACKAGE_LEFTOVER",
      "REUSE_PANTRY_COVERAGE",
      "PREFERENCES_MATCH",
      "DIVERSITY_RECENT_WEEK_REPETITION",
      "PREFERENCES_MEAL_RATING"
    ]
  }
}
