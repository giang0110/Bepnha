import { expect, test } from "vitest"
import { legacyFixedPackPriceV2 } from "./legacy-fixed-pack-terms"
test("legacy quotes retain explicit fixed packages and bind every immutable quote field", () => {
  const p = {
    foodPriceId: "price",
    priceBookId: "book",
    foodId: "eggs",
    foodFactVersionId: "fact",
    baseUnitId: "item",
    packageBaseQuantity: "10",
    packagePriceVnd: 20000,
    purchaseIncrement: "1",
    observedAt: "2026-10-02"
  }
  const r = legacyFixedPackPriceV2(p, "count", "Reviewed fixed box of ten")
  expect(r).toMatchObject({
    quoteBaseQuantity: "10",
    quotePriceVnd: 20000,
    purchaseRule: { mode: "fixed_pack", packIncrement: "1" }
  })
  expect(r.purchaseTermsContentHash).toMatch(/^[a-f0-9]{64}$/u)
  expect(
    legacyFixedPackPriceV2({ ...p, packagePriceVnd: 21000 }, "count", "Reviewed fixed box of ten")
      .purchaseTermsContentHash
  ).not.toBe(r.purchaseTermsContentHash)
  expect(() => legacyFixedPackPriceV2(p, "count", "")).toThrow("LEGACY_PRICE_SOURCE_REQUIRED")
})
