import type { ReadyPlan } from "../../domain/planner/search-week.js"

export interface PlanTrustView {
  readonly calculationDate: string
  readonly adultEquivalent: string | null
  readonly priceObservedFrom: string | null
  readonly priceObservedTo: string | null
  readonly stalePriceCount: number
  readonly coverage: {
    readonly serving: "complete"
    readonly nutrition: "complete"
    readonly cost: "complete"
    readonly hardConstraints: "complete"
  }
  readonly explanationCodes: readonly string[]
}

/**
 * Projects display evidence from a completed deterministic result.
 *
 * No label or current catalog pointer enters this DTO. A ready plan has already passed lineage,
 * nutrition, serving and price eligibility; this function reports that stored decision instead of
 * recalculating it.
 */
export function buildPlanTrustView(plan: ReadyPlan, calculationDate: string): PlanTrustView {
  const observedDates = plan.purchaseBasket.lines
    .map((line) => line.observedAt)
    .toSorted((left, right) => left.localeCompare(right))

  return {
    calculationDate,
    adultEquivalent: plan.items[0]?.adultEquivalent ?? null,
    priceObservedFrom: observedDates[0] ?? null,
    priceObservedTo: observedDates.at(-1) ?? null,
    stalePriceCount: plan.purchaseBasket.lines.filter((line) => line.freshness === "stale_usable")
      .length,
    coverage: {
      serving: "complete",
      nutrition: "complete",
      cost: "complete",
      hardConstraints: "complete"
    },
    explanationCodes: [...plan.score.explanations]
  }
}
