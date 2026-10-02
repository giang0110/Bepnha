// @vitest-environment node
import { describe, expect, test } from "vitest"
import { buildReadyCatalogPack, purchasingPackFixture } from "./catalog-pack-test-builder.ts"
import { parseCatalogPackShape } from "./catalog-pack-schema.ts"
import { validateCatalogPackValue } from "./catalog-pack-validator.ts"
import {
  packToSheets,
  sheetsToPack,
  SHEET_FILE_NAMES,
  SHEET_HEADERS
} from "./catalog-sheet-tables.ts"

describe("versioned cooking and purchasing catalog", () => {
  test("accepts explicit v2 policies and purchasing terms", () => {
    const pack = purchasingPackFixture()
    expect(parseCatalogPackShape(pack).success).toBe(true)
    expect(
      validateCatalogPackValue(pack).diagnostics.filter((item) => item.severity === "error")
    ).toEqual([])
  })
  test("round trips all policy and sale fields through CSV tables", () => {
    const pack = purchasingPackFixture()
    const sheets = packToSheets(pack)
    const imported = sheetsToPack(sheets)
    expect(imported.errors).toEqual([])
    expect(imported.pack).toEqual(pack)
    expect(sheets["pack.csv"][0]).toContain("schemaVersion")
    expect(sheets).toHaveProperty("food_quantity_policies.csv")
  })
  test("preserves legacy tables and never invents metadata on import", () => {
    const pack = buildReadyCatalogPack()
    const sheets = packToSheets(pack)
    expect(Object.keys(sheets)).toEqual([...SHEET_FILE_NAMES])
    expect(sheets["pack.csv"][0]).toEqual([...SHEET_HEADERS["pack.csv"]])
    expect(sheetsToPack(sheets).pack).toEqual(pack)
    expect(sheetsToPack(sheets).pack).not.toHaveProperty("foodQuantityPolicies")
  })
  test("blocks missing cooking policy instead of inferring form from a category", () => {
    const pack = { ...purchasingPackFixture(), foodQuantityPolicies: [] }
    expect(validateCatalogPackValue(pack).blockers).toContain("MISSING_QUANTITY_POLICY")
  })
  test("blocks loose count terms for a mass food", () => {
    const pack = purchasingPackFixture()
    const changed = {
      ...pack,
      priceBook: {
        ...pack.priceBook,
        prices: pack.priceBook.prices.map((price) => ({
          ...price,
          purchaseRule: { mode: "loose_count", saleStepBaseQuantity: "1" }
        }))
      }
    }
    expect(validateCatalogPackValue(changed).diagnostics).toContainEqual(
      expect.objectContaining({ code: "PURCHASE_DIMENSION_MISMATCH", severity: "error" })
    )
  })
  test("requires a sale source rather than treating a kg quote as loose", () => {
    const pack = purchasingPackFixture()
    const changed = {
      ...pack,
      priceBook: {
        ...pack.priceBook,
        prices: pack.priceBook.prices.map((price) => ({
          ...price,
          purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "50" },
          purchaseProvenance: ""
        }))
      }
    }
    expect(validateCatalogPackValue(changed).diagnostics).toContainEqual(
      expect.objectContaining({ code: "PURCHASE_TERMS_UNVERIFIED", severity: "error" })
    )
  })
  test("blocks a whole piece without a measured piece conversion", () => {
    const pack = purchasingPackFixture()
    const changed = {
      ...pack,
      foodQuantityPolicies: pack.foodQuantityPolicies.map((policy) => ({
        ...policy,
        foodForm: "whole_piece",
        stepBaseQuantity: "200",
        rounding: "ceil"
      }))
    }
    expect(validateCatalogPackValue(changed).diagnostics).toContainEqual(
      expect.objectContaining({ code: "MISSING_WHOLE_PIECE_CONVERSION", severity: "error" })
    )
  })
})
