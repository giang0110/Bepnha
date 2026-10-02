import { describe, expect, test, vi } from "vitest"
import type {
  CatalogAdminRepository,
  FoodQuantityPolicyPublicationAggregate
} from "./catalog-admin-repository"
import type { FoodQuantityPolicyDraftInput, PriceBookDraftInputV2 } from "./catalog-admin-command"
import { executeCatalogAdminCommand } from "./execute-catalog-admin-command"
const draft: FoodQuantityPolicyDraftInput = {
  foodQuantityPolicyVersionId: "policy",
  expectedRevision: 1,
  foodId: "fish",
  foodFactVersionId: "fish-fact",
  versionNumber: 1,
  baseUnitId: "g",
  baseDimension: "mass",
  foodForm: "portionable_mass",
  stepBaseQuantity: "1",
  rounding: "half_up",
  provenance: "Reviewed cut fish in grams"
}
const aggregate: FoodQuantityPolicyPublicationAggregate = {
  aggregateType: "food_quantity_policy_version",
  policy: { ...draft, revision: 1, publicationStatus: "draft", contentHash: null },
  foodFactContentHash: "a".repeat(64),
  foodFactPublicationStatus: "published",
  conversions: [
    {
      unitId: "g",
      unitCode: "g",
      displayStep: "1",
      sourceDimension: "mass",
      sourceToDimensionBase: "1",
      foodBaseUnitId: "g",
      foodBaseDimension: "mass",
      foodBaseUnitToDimensionBase: "1",
      baseQuantityPerUnit: "1",
      grossGramsPerUnit: "1"
    }
  ]
}
function setup(value = aggregate) {
  const saveFoodQuantityPolicyDraft = vi
    .fn()
    .mockResolvedValue({ ok: true, value: { id: "policy", revision: 1, status: "draft" } })
  const publishFoodQuantityPolicy = vi
    .fn()
    .mockResolvedValue({ ok: true, value: { id: "policy", revision: 2, status: "published" } })
  const savePriceBookDraft = vi
    .fn()
    .mockResolvedValue({ ok: true, value: { id: "book", revision: 2, status: "draft" } })
  const getAggregateForPublication = vi.fn().mockResolvedValue({ ok: true, value })
  const repository = {
    saveFoodQuantityPolicyDraft,
    publishFoodQuantityPolicy,
    savePriceBookDraft,
    getAggregateForPublication
  } as unknown as CatalogAdminRepository
  const sha256 = vi.fn<(bytes: Uint8Array) => Promise<string>>().mockResolvedValue("f".repeat(64))
  return {
    repository,
    sha256,
    saveFoodQuantityPolicyDraft,
    publishFoodQuantityPolicy,
    savePriceBookDraft
  }
}
const book: PriceBookDraftInputV2 = {
  priceBookId: "book",
  expectedRevision: 1,
  purchasingVersion: "purchase-v2",
  effectiveFrom: "2026-10-01",
  effectiveTo: null,
  prices: [
    {
      foodPriceId: "fish-price",
      foodId: "fish",
      foodFactVersionId: "fish-fact",
      baseUnitId: "g",
      baseDimension: "mass",
      packageUnitId: "g",
      packageQuantity: "1000",
      packageBaseQuantity: "1000",
      packagePriceVnd: 100000,
      purchaseIncrement: "1",
      observedAt: "2026-10-01",
      sourceReference: "Synthetic quote",
      purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "50" },
      purchaseProvenance: "Synthetic supplier accepts increments of 50g"
    }
  ]
}
describe("catalog physical policies and purchasing publication", () => {
  test("saves explicit draft fields without authoring a hash", async () => {
    const s = setup()
    expect(
      await executeCatalogAdminCommand(
        s.repository,
        { sha256: s.sha256 },
        { action: "save_food_quantity_policy_draft", input: draft }
      )
    ).toMatchObject({ ok: true })
    expect(s.saveFoodQuantityPolicyDraft).toHaveBeenCalledWith(draft)
    expect(s.sha256).not.toHaveBeenCalled()
  })
  test.each(["", "unknown"])("rejects an unverified policy source %s", async (provenance) => {
    const s = setup()
    expect(
      await executeCatalogAdminCommand(
        s.repository,
        { sha256: s.sha256 },
        { action: "save_food_quantity_policy_draft", input: { ...draft, provenance } }
      )
    ).toEqual({ ok: false, reason: "VALIDATION_FAILED" })
    expect(s.saveFoodQuantityPolicyDraft).not.toHaveBeenCalled()
  })
  test("hashes the pinned fact and physical policy on publication", async () => {
    const s = setup()
    expect(
      await executeCatalogAdminCommand(
        s.repository,
        { sha256: s.sha256 },
        {
          action: "publish_food_quantity_policy",
          input: { foodQuantityPolicyVersionId: "policy", expectedRevision: 1 }
        }
      )
    ).toMatchObject({ ok: true })
    const body = new TextDecoder().decode(s.sha256.mock.calls[0]?.[0])
    expect(body).toContain('"stepBaseQuantity":"1"')
    expect(body).toContain('"foodFactContentHash":"' + "a".repeat(64) + '"')
    expect(s.publishFoodQuantityPolicy).toHaveBeenCalledWith({
      id: "policy",
      expectedRevision: 1,
      contentHash: "f".repeat(64)
    })
  })
  test("rejects whole pieces without a piece conversion", async () => {
    const s = setup({
      ...aggregate,
      policy: {
        ...aggregate.policy,
        foodForm: "whole_piece",
        rounding: "ceil",
        stepBaseQuantity: "200"
      }
    })
    expect(
      await executeCatalogAdminCommand(
        s.repository,
        { sha256: s.sha256 },
        {
          action: "publish_food_quantity_policy",
          input: { foodQuantityPolicyVersionId: "policy", expectedRevision: 1 }
        }
      )
    ).toEqual({ ok: false, reason: "PUBLICATION_INCOMPLETE" })
    expect(s.publishFoodQuantityPolicy).not.toHaveBeenCalled()
  })
  test.each(["", "unknown"])(
    "rejects loose prices without declared sale evidence %s",
    async (purchaseProvenance) => {
      const s = setup()
      expect(
        await executeCatalogAdminCommand(
          s.repository,
          { sha256: s.sha256 },
          {
            action: "save_price_book_draft",
            input: { ...book, prices: book.prices.map((p) => ({ ...p, purchaseProvenance })) }
          }
        )
      ).toEqual({ ok: false, reason: "VALIDATION_FAILED" })
      expect(s.savePriceBookDraft).not.toHaveBeenCalled()
    }
  )
  test("rejects mass prices disguised as loose count and duplicate food rows", async () => {
    const s = setup()
    for (const prices of [
      [
        {
          ...book.prices[0]!,
          purchaseRule: { mode: "loose_count" as const, saleStepBaseQuantity: "1" }
        }
      ],
      [...book.prices, ...book.prices]
    ])
      expect(
        await executeCatalogAdminCommand(
          s.repository,
          { sha256: s.sha256 },
          { action: "save_price_book_draft", input: { ...book, prices } }
        )
      ).toEqual({ ok: false, reason: "VALIDATION_FAILED" })
  })
})
