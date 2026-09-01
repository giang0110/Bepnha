import { describe, expect, test } from "vitest"

import type { PantrySnapshotV1 } from "@/domain/pantry/pantry"
import { canonicalJson } from "@/domain/shared/canonical-json"

import { PLANNER_ENGINE_VERSION } from "./planner-engine-version"
import { buildPlannerSnapshotPayloads, type PlannerSnapshotSource } from "./planner-snapshot"

const base = {
  engineVersion: "planner-engine-v2" as const,
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

const pantryItems: PantrySnapshotV1["items"] = [
  {
    pantryItemId: "pantry-b",
    foodId: "food-b",
    foodFactVersionId: "fact-b-v1",
    quantity: "2",
    unitId: "unit-g",
    baseQuantity: "2",
    baseUnitId: "unit-g",
    baseDimension: "mass",
    version: 1
  },
  {
    pantryItemId: "pantry-a",
    foodId: "food-a",
    foodFactVersionId: "fact-a-v1",
    quantity: "1",
    unitId: "unit-g",
    baseQuantity: "1",
    baseUnitId: "unit-g",
    baseDimension: "mass",
    version: 1
  }
]

function withPantry(items: PantrySnapshotV1["items"]): PlannerSnapshotSource {
  return {
    ...base,
    pantrySnapshot: { version: "pantry-snapshot-v1", items }
  } as unknown as PlannerSnapshotSource
}

describe("buildPlannerSnapshotPayloads", () => {
  test("canonicalizes shuffled manifest rows without current pointers", () => {
    const left = buildPlannerSnapshotPayloads(base)
    const right = buildPlannerSnapshotPayloads({
      ...base,
      candidateManifest: [...base.candidateManifest].reverse()
    })
    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(left.inputPayload.engineVersion).toBe("planner-engine-v2")
    expect(canonicalJson(left)).not.toMatch(/currentVersion|retiredAt|currentPriceBook/i)
    expect(canonicalJson(left)).not.toContain('"pantrySnapshot"')
    const changedPointers = {
      ...base,
      currentMealOptionVersionId: "new-pointer",
      retiredHistoricalPriceBookId: "book-v1"
    }
    expect(canonicalJson(buildPlannerSnapshotPayloads(changedPointers))).toBe(canonicalJson(left))
  })

  test("engine version is calculation-bearing canonical input while legacy v1 remains representable", () => {
    const v2 = buildPlannerSnapshotPayloads(base)
    const v1 = buildPlannerSnapshotPayloads({ ...base, engineVersion: "planner-engine-v1" })
    expect(canonicalJson(v1.inputPayload)).not.toBe(canonicalJson(v2.inputPayload))
    expect(v1.inputPayload.engineVersion).toBe("planner-engine-v1")
    expect(v2.inputPayload.engineVersion).toBe("planner-engine-v2")
    expect(String(PLANNER_ENGINE_VERSION)).toBe("planner-engine-v3")
  })

  test("includes canonical pantry evidence without changing bytes for pantry item permutations", () => {
    const left = buildPlannerSnapshotPayloads(withPantry(pantryItems))
    const right = buildPlannerSnapshotPayloads(withPantry([...pantryItems].reverse()))
    const leftJson = canonicalJson(left.inputPayload)
    expect(leftJson).toContain('"pantrySnapshot"')
    expect(leftJson).toContain('"foodId":"food-a"')
    expect(leftJson).toBe(canonicalJson(right.inputPayload))

    const changed = buildPlannerSnapshotPayloads(
      withPantry([{ ...pantryItems[0]!, baseQuantity: "3", quantity: "3" }, pantryItems[1]!])
    )
    expect(canonicalJson(changed.inputPayload)).not.toBe(leftJson)
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
