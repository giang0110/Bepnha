import { describe, expect, test } from "vitest"

import {
  normalizePantrySnapshotV1,
  type PantryItemNormalizationInputV1
} from "./normalize-pantry-snapshot"

function pantryItem(
  overrides: Partial<PantryItemNormalizationInputV1> = {}
): PantryItemNormalizationInputV1 {
  return {
    pantryItemId: "pantry-b",
    foodId: "food-b",
    foodFactVersionId: "fact-b",
    foodFactFoodId: "food-b",
    quantity: "250.000",
    unitId: "unit-g",
    baseQuantity: "250.000",
    baseUnitId: "unit-g",
    foodBaseUnitId: "unit-g",
    baseDimension: "mass",
    version: 2,
    ...overrides
  }
}

describe("normalizePantrySnapshotV1", () => {
  test("orders items deterministically and canonicalizes decimal quantities", () => {
    const result = normalizePantrySnapshotV1([
      pantryItem(),
      pantryItem({
        pantryItemId: "pantry-a",
        foodId: "food-a",
        foodFactVersionId: "fact-a",
        foodFactFoodId: "food-a",
        quantity: "0.000",
        baseQuantity: "0.000",
        version: 1
      })
    ])

    expect(result).toEqual({
      ok: true,
      value: {
        version: "pantry-snapshot-v1",
        items: [
          {
            pantryItemId: "pantry-a",
            foodId: "food-a",
            foodFactVersionId: "fact-a",
            quantity: "0",
            unitId: "unit-g",
            baseQuantity: "0",
            baseUnitId: "unit-g",
            baseDimension: "mass",
            version: 1
          },
          {
            pantryItemId: "pantry-b",
            foodId: "food-b",
            foodFactVersionId: "fact-b",
            quantity: "250",
            unitId: "unit-g",
            baseQuantity: "250",
            baseUnitId: "unit-g",
            baseDimension: "mass",
            version: 2
          }
        ]
      }
    })
  })

  test("is byte-equivalent for repeated normalization regardless of input order", () => {
    const first = pantryItem({
      pantryItemId: "pantry-a",
      foodId: "food-a",
      foodFactVersionId: "fact-a",
      foodFactFoodId: "food-a"
    })
    const second = pantryItem()

    expect(JSON.stringify(normalizePantrySnapshotV1([first, second]))).toBe(
      JSON.stringify(normalizePantrySnapshotV1([second, first]))
    )
  })

  test("rejects duplicate stable food identities", () => {
    const result = normalizePantrySnapshotV1([
      pantryItem({ pantryItemId: "pantry-1" }),
      pantryItem({ pantryItemId: "pantry-2", foodFactVersionId: "fact-other" })
    ])

    expect(result).toEqual({
      ok: false,
      error: { code: "DUPLICATE_PANTRY_FOOD", foodId: "food-b" }
    })
  })

  test.each([
    ["quantity", "-1"],
    ["baseQuantity", "-0.1"],
    ["quantity", "01"],
    ["baseQuantity", "1e3"]
  ] as const)("rejects invalid canonical %s values", (field, value) => {
    const result = normalizePantrySnapshotV1([pantryItem({ [field]: value })])

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_PANTRY_QUANTITY", pantryItemId: "pantry-b" }
    })
  })

  test("rejects mismatched stable food and fact lineage", () => {
    const result = normalizePantrySnapshotV1([pantryItem({ foodFactFoodId: "food-someone-else" })])

    expect(result).toEqual({
      ok: false,
      error: { code: "PANTRY_FACT_LINEAGE_MISMATCH", pantryItemId: "pantry-b" }
    })
  })

  test("rejects a base unit that does not match the permanent food base unit", () => {
    const result = normalizePantrySnapshotV1([pantryItem({ foodBaseUnitId: "unit-ml" })])

    expect(result).toEqual({
      ok: false,
      error: { code: "PANTRY_BASE_UNIT_MISMATCH", pantryItemId: "pantry-b" }
    })
  })

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid pantry versions: %s",
    (version) => {
      const result = normalizePantrySnapshotV1([pantryItem({ version })])

      expect(result).toEqual({
        ok: false,
        error: { code: "INVALID_PANTRY_VERSION", pantryItemId: "pantry-b" }
      })
    }
  )
})
