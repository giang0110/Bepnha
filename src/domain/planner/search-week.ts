import { calculatePurchaseBasket } from "../pricing/calculate-purchase-basket.js"
import {
  PRICE_FRESHNESS_CONFIG_V1,
  type CanonicalFoodDeduction,
  type FoodPriceInput,
  type PriceFreshnessConfigV1,
  type PurchaseBasketResult
} from "../pricing/pricing.js"
import { canonicalJson } from "../shared/canonical-json.js"

import type { EligibleMealOption } from "./evaluate-eligibility.js"
import { PLANNER_CONFIG_V1, type PlannerConfigV1 } from "./planner-config.js"
import type { PlannerWarning } from "./planner-outcome.js"
import {
  EMPTY_MEAL_OPTION_RATINGS,
  preferenceMatches,
  scaledPenalty,
  scoreWeeklyPlan,
  type MealOptionRatings,
  type WeeklyPlanScore
} from "./score-week.js"

type PurchaseBasket = Extract<PurchaseBasketResult, { readonly ok: true }>["value"]

export type SearchMealIdentity = Pick<
  EligibleMealOption,
  "mealOptionId" | "mealOptionVersionId" | "mainRecipeVersionIds"
>
export interface SearchBasket {
  readonly totalEstimatedCostVnd: number
  readonly warnings: readonly PlannerWarning[]
}
interface SearchState<
  M extends SearchMealIdentity = EligibleMealOption,
  B extends SearchBasket = PurchaseBasket
> {
  readonly selected: readonly M[]
  readonly basket: B
  readonly qualityLowerBound: number
  readonly stableIdSequence: string
}

export interface FrontierMetric {
  readonly depth: number
  readonly expandedSize: number
  readonly qualitySize: number
  readonly costSize: number
  readonly unionSize: number
}

export interface CompletedPlanCandidate {
  readonly selected: readonly EligibleMealOption[]
  readonly basket: PurchaseBasket
  readonly score: WeeklyPlanScore
  readonly stableIdSequence: string
}

export interface ReadyPlan {
  readonly items: readonly {
    readonly dayIndex: number
    readonly mealSlot: "primary"
    readonly mealOptionId: string
    readonly mealOptionVersionId: string
    readonly adultEquivalent: string
    readonly scaleFactor: string
    readonly snapshot: EligibleMealOption
  }[]
  readonly selected: readonly EligibleMealOption[]
  readonly purchaseBasket: PurchaseBasket
  readonly totalEstimatedCostVnd: number
  readonly score: WeeklyPlanScore
  readonly stableIdSequence: string
  readonly frontierMetrics: readonly FrontierMetric[]
}

export type PlannerSearchResult =
  | {
      readonly status: "ready_within_budget"
      readonly plan: ReadyPlan
      readonly warnings: readonly PlannerWarning[]
    }
  | {
      readonly status: "ready_over_budget"
      readonly plan: ReadyPlan
      readonly warnings: readonly PlannerWarning[]
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH"
        readonly messageKey: "planner.no_complete_plan_found_in_deterministic_search"
      }
    }

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

function compatiblePrices(
  selected: readonly EligibleMealOption[]
): readonly FoodPriceInput[] | null {
  const prices = new Map<string, FoodPriceInput>()
  for (const price of selected.flatMap((option) => option.prices)) {
    const existing = prices.get(price.foodId)
    if (existing !== undefined && canonicalJson(existing) !== canonicalJson(price)) return null
    prices.set(price.foodId, price)
  }
  return [...prices.values()].sort(
    (left, right) =>
      compareText(left.foodId, right.foodId) || compareText(left.foodPriceId, right.foodPriceId)
  )
}

function basketFor(
  selected: readonly EligibleMealOption[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1,
  deductionsInput: readonly CanonicalFoodDeduction[]
): PurchaseBasket | null {
  const prices = compatiblePrices(selected)
  if (prices === null) return null
  const requirements = selected.flatMap((option) => option.requirements)
  const requiredFoods = new Set(requirements.map((requirement) => requirement.foodId))
  const deductions = deductionsInput.filter((deduction) => requiredFoods.has(deduction.foodId))
  const result = calculatePurchaseBasket(
    requirements,
    prices,
    calculationDate,
    freshnessConfig,
    deductions
  )
  return result.ok ? result.value : null
}

export function violatesWeeklyHardRules(selected: readonly SearchMealIdentity[]): boolean {
  if (new Set(selected.map((option) => option.mealOptionId)).size !== selected.length) return true
  return selected.slice(1).some((option, index) => {
    const previous = selected[index]
    return previous?.mainRecipeVersionIds.some((id) => option.mainRecipeVersionIds.includes(id))
  })
}

export function calculateCompletedPlanCandidate(
  selected: readonly EligibleMealOption[],
  softPreferenceCodes: readonly string[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1 = PRICE_FRESHNESS_CONFIG_V1,
  config: PlannerConfigV1 = PLANNER_CONFIG_V1,
  deductionsInput: readonly CanonicalFoodDeduction[] = [],
  recentMealOptionIds: readonly string[] = [],
  ratings: MealOptionRatings = EMPTY_MEAL_OPTION_RATINGS
): CompletedPlanCandidate | null {
  if (selected.length !== config.dayCount || violatesWeeklyHardRules(selected)) return null
  const basket = basketFor(selected, calculationDate, freshnessConfig, deductionsInput)
  if (basket === null) return null
  return {
    selected,
    basket,
    score: scoreWeeklyPlan(
      selected,
      basket,
      softPreferenceCodes,
      config,
      deductionsInput,
      recentMealOptionIds,
      ratings
    ),
    stableIdSequence: stableSequence(selected)
  }
}

export function qualityLowerBound(
  selected: readonly Pick<
    EligibleMealOption,
    "mealOptionId" | "primaryProteinGroup" | "roles" | "foodCategoryCodes"
  >[],
  softPreferenceCodes: readonly string[],
  config: Omit<PlannerConfigV1, "version">,
  recentMealOptionIds: readonly string[] = [],
  ratings: MealOptionRatings = EMPTY_MEAL_OPTION_RATINGS
): number {
  const proteins = selected.map((option) => option.primaryProteinGroup)
  const repetitions = selected.length - new Set(proteins).size
  const adjacent = proteins.slice(1).filter((protein, index) => protein === proteins[index]).length
  const missingRoles = selected.reduce((sum, option) => {
    const roles = new Set(option.roles)
    return (
      sum +
      (roles.has("staple") ? 0 : 1) +
      (roles.has("main") ? 0 : 1) +
      (roles.has("vegetable") || roles.has("soup") ? 0 : 1)
    )
  }, 0)
  // Preference misses already incurred cannot disappear as the week fills. Count every rule
  // with the final scorer's matcher so preferred protein branches survive frontier pruning.
  const unmatched = softPreferenceCodes.reduce(
    (sum, code) => sum + selected.filter((item) => !preferenceMatches(item, code)).length,
    0
  )
  // A partial week can only gain recently-cooked meals as it fills, never lose them, so counting
  // them here stays a lower bound while steering the frontier off repeats before depth 7.
  const recentlyCooked = new Set(recentMealOptionIds)
  const repeatedRecently = selected.filter((option) =>
    recentlyCooked.has(option.mealOptionId)
  ).length
  // Same argument as the recently-cooked term above, and the same necessity. Demerits already
  // incurred can only grow as the week fills, so counting them here keeps the bound admissible —
  // and leaving them out does not merely loosen it, it makes the whole term useless: the frontier
  // is pruned by this bound, so branches that avoid a rejected meal are discarded before anything
  // gets far enough to be scored on taste.
  const liked = new Set(ratings.liked)
  const disliked = new Set(ratings.disliked)
  const ratingDemerits = selected.reduce(
    (sum, option) =>
      sum + (disliked.has(option.mealOptionId) ? 2 : liked.has(option.mealOptionId) ? 0 : 1),
    0
  )
  return (
    (liked.size === 0 && disliked.size === 0
      ? 0
      : scaledPenalty(config.scoringWeights.mealRating, ratingDemerits, config.dayCount * 2)) +
    scaledPenalty(config.scoringWeights.recentWeekRepetition, repeatedRecently, config.dayCount) +
    scaledPenalty(config.diversityWeights.primaryProteinRepetition, repetitions, 6) +
    scaledPenalty(config.diversityWeights.adjacentPrimaryProteinReuse, adjacent, 6) +
    scaledPenalty(config.scoringWeights.nutritionComposition, missingRoles, 21) +
    (softPreferenceCodes.length === 0
      ? 0
      : scaledPenalty(
          config.scoringWeights.preferences,
          unmatched,
          softPreferenceCodes.length * config.dayCount
        ))
  )
}

function stableSequence(selected: readonly SearchMealIdentity[]): string {
  return selected.map((option) => option.mealOptionVersionId).join("|")
}

export function mealSetKey(selected: readonly SearchMealIdentity[]): string {
  return JSON.stringify(selected.map((meal) => meal.mealOptionVersionId).sort(compareText))
}

function qualityOrder<M extends SearchMealIdentity, B extends SearchBasket>(
  left: SearchState<M, B>,
  right: SearchState<M, B>,
  budgetVnd?: number
): number {
  return (
    (budgetVnd === undefined
      ? 0
      : Number(left.basket.totalEstimatedCostVnd > budgetVnd) -
        Number(right.basket.totalEstimatedCostVnd > budgetVnd)) ||
    left.qualityLowerBound - right.qualityLowerBound ||
    left.basket.totalEstimatedCostVnd - right.basket.totalEstimatedCostVnd ||
    compareText(left.stableIdSequence, right.stableIdSequence)
  )
}

function costOrder<M extends SearchMealIdentity, B extends SearchBasket>(
  left: SearchState<M, B>,
  right: SearchState<M, B>
): number {
  return (
    left.basket.totalEstimatedCostVnd - right.basket.totalEstimatedCostVnd ||
    left.qualityLowerBound - right.qualityLowerBound ||
    compareText(left.stableIdSequence, right.stableIdSequence)
  )
}

export function selectFinalPlan<
  C extends {
    readonly basket: SearchBasket
    readonly score: { readonly totalQualityPenalty: number }
    readonly stableIdSequence: string
  }
>(
  complete: readonly C[],
  budgetVnd: number
):
  | {
      readonly status: "ready_within_budget"
      readonly plan: C
      readonly warnings: readonly PlannerWarning[]
    }
  | {
      readonly status: "ready_over_budget"
      readonly plan: C
      readonly warnings: readonly PlannerWarning[]
    } {
  const within = complete.filter((plan) => plan.basket.totalEstimatedCostVnd <= budgetVnd)
  const pool = within.length > 0 ? within : complete
  const ordered = [...pool].sort((left, right) =>
    within.length > 0
      ? left.score.totalQualityPenalty - right.score.totalQualityPenalty ||
        left.basket.totalEstimatedCostVnd - right.basket.totalEstimatedCostVnd ||
        compareText(left.stableIdSequence, right.stableIdSequence)
      : left.basket.totalEstimatedCostVnd - right.basket.totalEstimatedCostVnd ||
        left.score.totalQualityPenalty - right.score.totalQualityPenalty ||
        compareText(left.stableIdSequence, right.stableIdSequence)
  )
  const plan = ordered[0]!
  const staleWarnings: PlannerWarning[] = [...plan.basket.warnings]
  if (within.length > 0) return { status: "ready_within_budget", plan, warnings: staleWarnings }
  const estimatedPlanCostVnd = plan.basket.totalEstimatedCostVnd
  return {
    status: "ready_over_budget",
    plan,
    warnings: [
      ...staleWarnings,
      {
        code: "PLAN_OVER_BUDGET",
        budgetVnd,
        estimatedPlanCostVnd,
        overageVnd: estimatedPlanCostVnd - budgetVnd
      },
      { code: "NO_UNDER_BUDGET_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" }
    ]
  }
}

export function searchBoundedWeek<
  M extends SearchMealIdentity,
  B extends SearchBasket,
  C
>(options: {
  readonly eligible: readonly M[]
  readonly config: Pick<PlannerConfigV1, "dayCount" | "frontier">
  readonly budgetVnd?: number
  readonly emptyBasket: B
  readonly basketFor: (selected: readonly M[]) => B | null
  /** Opt in only when the basket depends on the meal set, independently of day order. */
  readonly basketCacheKey?: (selected: readonly M[]) => string
  readonly qualityLowerBound: (selected: readonly M[]) => number
  readonly complete: (selected: readonly M[]) => C | null
}): { readonly complete: readonly C[]; readonly frontierMetrics: readonly FrontierMetric[] } {
  const eligible = [...options.eligible].sort((left, right) =>
    compareText(left.mealOptionVersionId, right.mealOptionVersionId)
  )
  // Avoid bookkeeping when one prefix can cycle through more baskets than the cache retains.
  const basketCacheKey =
    eligible.length > options.config.frontier.maxSize ? undefined : options.basketCacheKey
  let frontier: SearchState<M, B>[] = [
    {
      selected: [],
      basket: options.emptyBasket,
      qualityLowerBound: 0,
      stableIdSequence: ""
    }
  ]
  const frontierMetrics: FrontierMetric[] = []
  for (let depth = 1; depth <= options.config.dayCount; depth += 1) {
    // Prices, scaled quantities and pantry belong to this search invocation. Limit retained
    // baskets to the frontier's memory budget and discard them before the next search depth.
    const baskets = new Map<string, B | null>()
    const expanded: SearchState<M, B>[] = []
    for (const state of [...frontier].sort((left, right) =>
      compareText(left.stableIdSequence, right.stableIdSequence)
    )) {
      for (const candidate of eligible) {
        const selected = [...state.selected, candidate]
        if (violatesWeeklyHardRules(selected)) continue
        const basketKey = basketCacheKey?.(selected)
        let basket = basketKey === undefined ? undefined : baskets.get(basketKey)
        if (basket === undefined) {
          basket = options.basketFor(selected)
          if (basketKey !== undefined) {
            if (baskets.size >= options.config.frontier.maxSize) {
              const oldestKey = baskets.keys().next().value
              if (oldestKey !== undefined) baskets.delete(oldestKey)
            }
            baskets.set(basketKey, basket)
          }
        }
        if (basket === null) continue
        expanded.push({
          selected,
          basket,
          qualityLowerBound: options.qualityLowerBound(selected),
          stableIdSequence: stableSequence(selected)
        })
      }
    }
    // A costly prefix cannot become affordable by adding positive food requirements. Keep
    // affordable quality branches before expensive ones; the cost frontier retains fallback
    // branches when no complete week fits. Final ranking still uses the unchanged scorer.
    const quality = [...expanded]
      .sort((left, right) => qualityOrder(left, right, options.budgetVnd))
      .slice(0, options.config.frontier.qualitySize)
    const cost = [...expanded].sort(costOrder).slice(0, options.config.frontier.costSize)
    const union = new Map<string, SearchState<M, B>>()
    for (const state of [...quality, ...cost]) union.set(state.stableIdSequence, state)
    frontier = [...union.values()].sort((left, right) =>
      compareText(left.stableIdSequence, right.stableIdSequence)
    )
    frontierMetrics.push({
      depth,
      expandedSize: expanded.length,
      qualitySize: quality.length,
      costSize: cost.length,
      unionSize: frontier.length
    })
  }

  const complete = frontier
    .filter((state) => state.selected.length === options.config.dayCount)
    .map((state) => options.complete(state.selected))
    .filter((candidate): candidate is C => candidate !== null)
  return { complete, frontierMetrics }
}

export function searchWeek(
  eligibleInput: readonly EligibleMealOption[],
  budgetVnd: number,
  softPreferenceCodes: readonly string[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1 = PRICE_FRESHNESS_CONFIG_V1,
  config: PlannerConfigV1 = PLANNER_CONFIG_V1,
  deductionsInput: readonly CanonicalFoodDeduction[] = [],
  recentMealOptionIds: readonly string[] = [],
  ratings: MealOptionRatings = EMPTY_MEAL_OPTION_RATINGS
): PlannerSearchResult {
  const { complete, frontierMetrics } = searchBoundedWeek({
    eligible: eligibleInput,
    config,
    budgetVnd,
    emptyBasket: { lines: [], warnings: [], totalEstimatedCostVnd: 0 },
    basketFor: (selected) => basketFor(selected, calculationDate, freshnessConfig, deductionsInput),
    basketCacheKey: mealSetKey,
    qualityLowerBound: (selected) =>
      qualityLowerBound(selected, softPreferenceCodes, config, recentMealOptionIds, ratings),
    complete: (selected) =>
      calculateCompletedPlanCandidate(
        selected,
        softPreferenceCodes,
        calculationDate,
        freshnessConfig,
        config,
        deductionsInput,
        recentMealOptionIds,
        ratings
      )
  })
  if (complete.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH",
        messageKey: "planner.no_complete_plan_found_in_deterministic_search"
      }
    }
  }
  const selected = selectFinalPlan(complete, budgetVnd)
  return {
    status: selected.status,
    warnings: selected.warnings,
    plan: {
      items: selected.plan.selected.map((option, dayIndex) => ({
        dayIndex,
        mealSlot: "primary",
        mealOptionId: option.mealOptionId,
        mealOptionVersionId: option.mealOptionVersionId,
        adultEquivalent: option.adultEquivalent,
        scaleFactor: option.mealScaleFactor,
        snapshot: option
      })),
      selected: selected.plan.selected,
      purchaseBasket: selected.plan.basket,
      totalEstimatedCostVnd: selected.plan.basket.totalEstimatedCostVnd,
      score: selected.plan.score,
      stableIdSequence: selected.plan.stableIdSequence,
      frontierMetrics
    }
  }
}
