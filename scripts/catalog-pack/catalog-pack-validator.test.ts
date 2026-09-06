import { describe, expect, test } from "vitest"

import { parseCatalogPackShape } from "./catalog-pack-schema.ts"

const minimumShape = {
  schemaVersion: "1",
  catalogCode: "launch_v1",
  preparedAt: "2026-09-06T00:00:00Z",
  source: { name: "Catalog team", provenance: "Reviewed source bundle" },
  foods: [],
  recipes: [],
  priceBook: {
    regionCode: "vn_baseline",
    versionNumber: 1,
    effectiveFrom: "2026-09-06",
    effectiveTo: null,
    prices: []
  },
  mealOptions: []
} as const

describe("parseCatalogPackShape", () => {
  test("rejects unknown keys", () => {
    expect(parseCatalogPackShape({ ...minimumShape, unexpected: true }).success).toBe(false)
  })

  test("does not coerce strings into numbers", () => {
    const value = {
      ...minimumShape,
      priceBook: { ...minimumShape.priceBook, versionNumber: "1" }
    }
    expect(parseCatalogPackShape(value).success).toBe(false)
  })
})
