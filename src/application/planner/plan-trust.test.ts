import { describe, expect, it } from "vitest"

import type { ReadyPlan } from "@/domain/planner/search-week"

import { buildPlanTrustView } from "./plan-trust"

function plan(): ReadyPlan {
  return {
    items: [{ adultEquivalent: "2.55" }] as unknown as ReadyPlan["items"],
    selected: [],
    purchaseBasket: {
      lines: [
        { observedAt: "2026-08-20", freshness: "current" },
        { observedAt: "2026-06-15", freshness: "stale_usable" },
        { observedAt: "2026-07-30", freshness: "current" }
      ] as unknown as ReadyPlan["purchaseBasket"]["lines"],
      warnings: [],
      totalEstimatedCostVnd: 650_000
    },
    totalEstimatedCostVnd: 650_000,
    score: {
      explanations: ["REUSE_DISTINCT_FOODS", "DIVERSITY_PRIMARY_PROTEIN_REPETITION"]
    } as unknown as ReadyPlan["score"],
    stableIdSequence: "stable",
    frontierMetrics: []
  }
}

describe("buildPlanTrustView", () => {
  it("projects reproducible trust facts without mutable display labels", () => {
    expect(buildPlanTrustView(plan(), "2026-08-26")).toEqual({
      calculationDate: "2026-08-26",
      adultEquivalent: "2.55",
      priceObservedFrom: "2026-06-15",
      priceObservedTo: "2026-08-20",
      stalePriceCount: 1,
      coverage: {
        serving: "complete",
        nutrition: "complete",
        cost: "complete",
        hardConstraints: "complete"
      },
      explanationCodes: ["REUSE_DISTINCT_FOODS", "DIVERSITY_PRIMARY_PROTEIN_REPETITION"]
    })
    expect(JSON.stringify(buildPlanTrustView(plan(), "2026-08-26"))).not.toContain("name")
  })
})
