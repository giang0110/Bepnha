import { describe, expect, test } from "vitest"

import { canonicalJson } from "@/domain/shared/canonical-json"

import { buildPlannerSnapshotPayloads } from "./planner-snapshot"

const base = {
  household: { householdId: "household-1", setupVersion: 4, hardRuleCodes: ["allergen_peanut"] },
  weekStart: "2026-08-31",
  timezone: "Asia/Ho_Chi_Minh" as const,
  calculationDate: "2026-08-26",
  portionConfig: { version: "portion-v1", coefficients: { adult: "1" } },
  priceFreshnessConfig: {
    version: "price-freshness-v1",
    currentMaxAgeDays: 30,
    usableMaxAgeDays: 90
  },
  plannerConfig: {
    version: "planner-v1",
    frontier: { maxSize: 250, qualitySize: 125, costSize: 125 }
  },
  candidateManifest: [
    {
      mealOptionId: "option-1",
      mealOptionVersionId: "option-v1",
      mealOptionContentHash: "a".repeat(64),
      recipeVersions: [{ recipeVersionId: "recipe-v1", contentHash: "b".repeat(64) }],
      foodFacts: [{ foodFactVersionId: "fact-v1", contentHash: "c".repeat(64) }],
      prices: [{ priceBookId: "book-v1", foodPriceId: "price-v1", fingerprint: "d".repeat(64) }]
    }
  ],
  calculation: {
    items: [{ dayIndex: 0, mealOptionVersionId: "option-v1" }],
    purchaseBasket: {
      lines: [{ foodPriceId: "price-v1", lineCostVnd: 10_000 }],
      totalEstimatedCostVnd: 10_000
    },
    score: { totalQualityPenalty: 100 },
    warnings: []
  }
}

describe("buildPlannerSnapshotPayloads", () => {
  test("canonicalizes shuffled manifest rows without current pointers", () => {
    const left = buildPlannerSnapshotPayloads(base)
    const right = buildPlannerSnapshotPayloads({
      ...base,
      candidateManifest: [...base.candidateManifest].reverse()
    })
    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(canonicalJson(left)).not.toMatch(/currentVersion|retiredAt|currentPriceBook/i)
    const changedPointers = {
      ...base,
      currentMealOptionVersionId: "new-pointer",
      retiredHistoricalPriceBookId: "book-v1"
    }
    expect(canonicalJson(buildPlannerSnapshotPayloads(changedPointers))).toBe(canonicalJson(left))
  })

  test.each([
    [
      "meal option",
      { candidateManifest: [{ ...base.candidateManifest[0]!, mealOptionVersionId: "option-v2" }] }
    ],
    [
      "recipe",
      {
        candidateManifest: [
          {
            ...base.candidateManifest[0]!,
            recipeVersions: [{ recipeVersionId: "recipe-v2", contentHash: "b".repeat(64) }]
          }
        ]
      }
    ],
    [
      "fact",
      {
        candidateManifest: [
          {
            ...base.candidateManifest[0]!,
            foodFacts: [{ foodFactVersionId: "fact-v2", contentHash: "c".repeat(64) }]
          }
        ]
      }
    ],
    [
      "price",
      {
        candidateManifest: [
          {
            ...base.candidateManifest[0]!,
            prices: [
              { priceBookId: "book-v2", foodPriceId: "price-v2", fingerprint: "d".repeat(64) }
            ]
          }
        ]
      }
    ],
    ["config", { plannerConfig: { version: "planner-v2" } }],
    ["date", { calculationDate: "2026-08-27" }]
  ] as const)("changes canonical fingerprint input when %s lineage changes", (_name, change) => {
    expect(canonicalJson(buildPlannerSnapshotPayloads({ ...base, ...change }))).not.toBe(
      canonicalJson(buildPlannerSnapshotPayloads(base))
    )
  })
})
