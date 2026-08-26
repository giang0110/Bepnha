import { calculatePurchaseBasket } from "@/domain/pricing/calculate-purchase-basket"
import {
  PRICE_FRESHNESS_CONFIG_V1,
  type FoodPriceInput,
  type PriceFreshnessConfigV1,
  type PurchaseBasketResult
} from "@/domain/pricing/pricing"
import { canonicalJson } from "@/domain/shared/canonical-json"

import type { EligibleMealOption } from "./evaluate-eligibility"
import { PLANNER_CONFIG_V1, type PlannerConfigV1 } from "./planner-config"
import type { PlannerWarning } from "./planner-outcome"
import { scaledPenalty, scoreWeeklyPlan, type WeeklyPlanScore } from "./score-week"

type PurchaseBasket = Extract<PurchaseBasketResult, { readonly ok: true }>["value"]

interface SearchState {
  readonly selected: readonly EligibleMealOption[]
  readonly basket: PurchaseBasket
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
  freshnessConfig: PriceFreshnessConfigV1
): PurchaseBasket | null {
  const prices = compatiblePrices(selected)
  if (prices === null) return null
  const result = calculatePurchaseBasket(
    selected.flatMap((option) => option.requirements),
    prices,
    calculationDate,
    freshnessConfig
  )
  return result.ok ? result.value : null
}

export function violatesWeeklyHardRules(selected: readonly EligibleMealOption[]): boolean {
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
  config: PlannerConfigV1 = PLANNER_CONFIG_V1
): CompletedPlanCandidate | null {
  if (selected.length !== config.dayCount || violatesWeeklyHardRules(selected)) return null
  const basket = basketFor(selected, calculationDate, freshnessConfig)
  if (basket === null) return null
  return {
    selected,
    basket,
    score: scoreWeeklyPlan(selected, basket, softPreferenceCodes, config),
    stableIdSequence: stableSequence(selected)
  }
}

function lowerBound(
  selected: readonly EligibleMealOption[],
  softPreferenceCodes: readonly string[],
  config: PlannerConfigV1
): number {
  const proteins = selected.map((option) => option.primaryProteinGroup)
  const repetitions = selected.length - new Set(proteins).size
  const adjacent = proteins.slice(1).filter((protein, index) => protein === proteins[index]).length
  const assignedStyles = new Set(selected.flatMap((option) => option.cookingStyleCodes)).size
  const remainingDays = config.dayCount - selected.length
  const unavoidableMissingStyles = Math.max(0, 7 - (assignedStyles + remainingDays))
  const missingRoles = selected.reduce((sum, option) => {
    const roles = new Set(option.roles)
    return (
      sum +
      (roles.has("staple") ? 0 : 1) +
      (roles.has("main") ? 0 : 1) +
      (roles.has("vegetable") || roles.has("soup") ? 0 : 1)
    )
  }, 0)
  const unmatched = softPreferenceCodes.reduce((sum, code) => {
    if (code === "prefer_soup")
      return sum + selected.filter((item) => !item.roles.includes("soup")).length
    if (code === "prefer_vegetable_forward")
      return sum + selected.filter((item) => !item.roles.includes("vegetable")).length
    return sum
  }, 0)
  return (
    scaledPenalty(config.diversityWeights.primaryProteinRepetition, repetitions, 6) +
    scaledPenalty(config.diversityWeights.primaryCookingStyleVariety, unavoidableMissingStyles, 6) +
    scaledPenalty(config.diversityWeights.adjacentPrimaryProteinReuse, adjacent, 6) +
    scaledPenalty(config.scoringWeights.nutritionComposition, missingRoles, 21) +
    (softPreferenceCodes.length === 0
      ? 0
      : scaledPenalty(1500, unmatched, softPreferenceCodes.length * 7))
  )
}

function stableSequence(selected: readonly EligibleMealOption[]): string {
  return selected.map((option) => option.mealOptionVersionId).join("|")
}

function qualityOrder(left: SearchState, right: SearchState): number {
  return (
    left.qualityLowerBound - right.qualityLowerBound ||
    left.basket.totalEstimatedCostVnd - right.basket.totalEstimatedCostVnd ||
    compareText(left.stableIdSequence, right.stableIdSequence)
  )
}

function costOrder(left: SearchState, right: SearchState): number {
  return (
    left.basket.totalEstimatedCostVnd - right.basket.totalEstimatedCostVnd ||
    left.qualityLowerBound - right.qualityLowerBound ||
    compareText(left.stableIdSequence, right.stableIdSequence)
  )
}

export function selectFinalPlan(
  complete: readonly CompletedPlanCandidate[],
  budgetVnd: number
):
  | {
      readonly status: "ready_within_budget"
      readonly plan: CompletedPlanCandidate
      readonly warnings: readonly PlannerWarning[]
    }
  | {
      readonly status: "ready_over_budget"
      readonly plan: CompletedPlanCandidate
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

export function searchWeek(
  eligibleInput: readonly EligibleMealOption[],
  budgetVnd: number,
  softPreferenceCodes: readonly string[],
  calculationDate: string,
  freshnessConfig: PriceFreshnessConfigV1 = PRICE_FRESHNESS_CONFIG_V1,
  config: PlannerConfigV1 = PLANNER_CONFIG_V1
): PlannerSearchResult {
  const eligible = [...eligibleInput].sort((left, right) =>
    compareText(left.mealOptionVersionId, right.mealOptionVersionId)
  )
  let frontier: SearchState[] = [
    {
      selected: [],
      basket: { lines: [], warnings: [], totalEstimatedCostVnd: 0 },
      qualityLowerBound: 0,
      stableIdSequence: ""
    }
  ]
  const frontierMetrics: FrontierMetric[] = []
  for (let depth = 1; depth <= config.dayCount; depth += 1) {
    const expanded: SearchState[] = []
    for (const state of [...frontier].sort((left, right) =>
      compareText(left.stableIdSequence, right.stableIdSequence)
    )) {
      for (const candidate of eligible) {
        const selected = [...state.selected, candidate]
        if (violatesWeeklyHardRules(selected)) continue
        const basket = basketFor(selected, calculationDate, freshnessConfig)
        if (basket === null) continue
        expanded.push({
          selected,
          basket,
          qualityLowerBound: lowerBound(selected, softPreferenceCodes, config),
          stableIdSequence: stableSequence(selected)
        })
      }
    }
    const quality = [...expanded].sort(qualityOrder).slice(0, config.frontier.qualitySize)
    const cost = [...expanded].sort(costOrder).slice(0, config.frontier.costSize)
    const union = new Map<string, SearchState>()
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

  const complete: CompletedPlanCandidate[] = frontier
    .filter((state) => state.selected.length === config.dayCount)
    .map((state) =>
      calculateCompletedPlanCandidate(
        state.selected,
        softPreferenceCodes,
        calculationDate,
        freshnessConfig,
        config
      )
    )
    .filter((candidate): candidate is CompletedPlanCandidate => candidate !== null)
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
        mealOptionVersionId: option.mealOptionVersionId
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
