import { describe, expect, test } from "vitest"

import type { CanonicalFoodDeduction, CanonicalFoodRequirement } from "@/domain/pricing/pricing"

import { scorePantryReuse } from "./score-pantry-reuse"

function requirement(
  foodId: string,
  requiredBaseQuantity: string,
  baseUnitId = "unit-g"
): CanonicalFoodRequirement {
  return {
    sourceId: `source-${foodId}`,
    foodId,
    foodFactVersionId: `fact-${foodId}`,
    baseUnitId,
    requiredBaseQuantity
  }
}

function pantry(
  foodId: string,
  availableBaseQuantity: string,
  baseUnitId = "unit-g"
): CanonicalFoodDeduction {
  return { foodId, baseUnitId, availableBaseQuantity }
}

describe("scorePantryReuse", () => {
  test("gives lower penalty when pantry covers more of otherwise identical requirements", () => {
    const requirements = [requirement("rice", "1000"), requirement("chicken", "500")]

    const none = scorePantryReuse(requirements, [], 500)
    const partial = scorePantryReuse(requirements, [pantry("rice", "500")], 500)
    const full = scorePantryReuse(
      requirements,
      [pantry("rice", "1000"), pantry("chicken", "500")],
      500
    )

    expect(none.penalty).toBe(500)
    expect(partial.penalty).toBeLessThan(none.penalty)
    expect(full.penalty).toBe(0)
  })

  test("caps pantry surplus and stays deterministic under input reorder", () => {
    const requirements = [requirement("rice", "1000"), requirement("chicken", "500")]
    const deductions = [pantry("rice", "5000"), pantry("chicken", "250")]

    const first = scorePantryReuse(requirements, deductions, 500)
    const reordered = scorePantryReuse([...requirements].reverse(), [...deductions].reverse(), 500)

    expect(first).toEqual(reordered)
    expect(first.coveredFoodCount).toBe(2)
    expect(first.penalty).toBeGreaterThanOrEqual(0)
    expect(first.penalty).toBeLessThanOrEqual(500)
    expect(Number.isSafeInteger(first.penalty)).toBe(true)
  })

  test("rejects mismatched pantry base units instead of guessing a conversion", () => {
    expect(() =>
      scorePantryReuse(
        [requirement("milk", "500", "unit-ml")],
        [pantry("milk", "100", "unit-g")],
        500
      )
    ).toThrow("PANTRY_REUSE_BASE_UNIT_MISMATCH")
  })
})
