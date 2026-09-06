import { describe, expect, test } from "vitest"

import { buildReadyCatalogPack } from "./catalog-pack-test-builder.ts"
import { validateCatalogPackValue } from "./catalog-pack-validator.ts"

describe("catalog pack nutrient authority constraints", () => {
  test("rejects nutrient precision beyond the authoritative six-decimal scale", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.foods[0]!.fact.nutrients[0]!.amountPer100g = "1.1234567"

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "INVALID_DECIMAL"
    )
  })

  test("rejects nutrient magnitude beyond the authoritative twelve integer digits", () => {
    const pack = structuredClone(buildReadyCatalogPack())
    pack.foods[0]!.fact.nutrients[0]!.amountPer100g = "1234567890123"

    expect(validateCatalogPackValue(pack).diagnostics.map((item) => item.code)).toContain(
      "INVALID_DECIMAL"
    )
  })
})
