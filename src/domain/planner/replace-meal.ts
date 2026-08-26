import { PRICE_FRESHNESS_CONFIG_V1, type PriceFreshnessConfigV1 } from "@/domain/pricing/pricing"

import type { EligibleMealOption } from "./evaluate-eligibility"
import { PLANNER_CONFIG_V1, type PlannerConfigV1 } from "./planner-config"
import type { PlannerWarning } from "./planner-outcome"
import { calculateCompletedPlanCandidate, selectFinalPlan, type ReadyPlan } from "./search-week"

export type ReplacementPreviewResult =
  | {
      readonly ok: true
      readonly value: {
        readonly status: "ready_within_budget" | "ready_over_budget"
        readonly items: ReadyPlan["items"]
        readonly selected: ReadyPlan["selected"]
        readonly purchaseBasket: ReadyPlan["purchaseBasket"]
        readonly score: ReadyPlan["score"]
        readonly weeklyEstimatedCostVnd: number
        readonly weeklyCostDeltaVnd: number
        readonly warnings: readonly PlannerWarning[]
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH"
        readonly messageKey: "planner.replacement_unavailable_within_deterministic_search"
      }
    }

export function previewMealReplacement(input: {
  readonly current: ReadyPlan
  readonly targetDayIndex: number
  readonly candidates: readonly EligibleMealOption[]
  readonly budgetVnd: number
  readonly softPreferenceCodes: readonly string[]
  readonly calculationDate: string
  readonly priceFreshnessConfig?: PriceFreshnessConfigV1
  readonly plannerConfig?: PlannerConfigV1
}): ReplacementPreviewResult {
  const config = input.plannerConfig ?? PLANNER_CONFIG_V1
  const freshness = input.priceFreshnessConfig ?? PRICE_FRESHNESS_CONFIG_V1
  const currentTarget = input.current.selected[input.targetDayIndex]
  if (
    currentTarget === undefined ||
    input.targetDayIndex < 0 ||
    input.targetDayIndex >= config.dayCount ||
    input.current.selected.length !== config.dayCount
  ) {
    return {
      ok: false,
      error: {
        code: "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH",
        messageKey: "planner.replacement_unavailable_within_deterministic_search"
      }
    }
  }

  const alternatives = [...input.candidates]
    .filter(
      (candidate) =>
        candidate.mealOptionId !== currentTarget.mealOptionId &&
        candidate.mealOptionVersionId !== currentTarget.mealOptionVersionId
    )
    .sort((left, right) => left.mealOptionVersionId.localeCompare(right.mealOptionVersionId))
    .flatMap((candidate) => {
      const selected = input.current.selected.map((existing, dayIndex) =>
        dayIndex === input.targetDayIndex ? candidate : existing
      )
      const completed = calculateCompletedPlanCandidate(
        selected,
        input.softPreferenceCodes,
        input.calculationDate,
        freshness,
        config
      )
      return completed === null ? [] : [completed]
    })
  if (alternatives.length === 0) {
    return {
      ok: false,
      error: {
        code: "REPLACEMENT_UNAVAILABLE_WITHIN_DETERMINISTIC_SEARCH",
        messageKey: "planner.replacement_unavailable_within_deterministic_search"
      }
    }
  }
  const chosen = selectFinalPlan(alternatives, input.budgetVnd)
  return {
    ok: true,
    value: {
      status: chosen.status,
      items: chosen.plan.selected.map((option, dayIndex) => ({
        dayIndex,
        mealSlot: "primary",
        mealOptionId: option.mealOptionId,
        mealOptionVersionId: option.mealOptionVersionId
      })),
      selected: chosen.plan.selected,
      purchaseBasket: chosen.plan.basket,
      score: chosen.plan.score,
      weeklyEstimatedCostVnd: chosen.plan.basket.totalEstimatedCostVnd,
      weeklyCostDeltaVnd:
        chosen.plan.basket.totalEstimatedCostVnd - input.current.totalEstimatedCostVnd,
      warnings: chosen.warnings
    }
  }
}
