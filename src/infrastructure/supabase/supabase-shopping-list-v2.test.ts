import type { SupabaseClient } from "@supabase/supabase-js"
import { expect, test, vi } from "vitest"
import type { Database } from "./database.types"
import { createSupabaseVersionedShoppingListRepository } from "./supabase-shopping-list-repository"
const policy = {
  id: "10000000-0000-4000-8000-000000000001",
  contentHash: "c".repeat(64),
  versionNumber: 1
}
const item = {
  version: "purchase-v2",
  shoppingListItemId: "line",
  foodId: "fish",
  foodNameVi: "Cá",
  baseUnitId: "g",
  baseDimension: "mass",
  requiredBaseQuantity: "600",
  pantryDeductedBaseQuantity: "0",
  purchaseRequiredBaseQuantity: "600",
  purchaseRule: { mode: "loose_mass", saleStepBaseQuantity: "50" },
  purchaseUnitCount: "12",
  purchaseBaseQuantity: "600",
  leftoverBaseQuantity: "0",
  quoteBaseQuantity: "1000",
  quotePriceVnd: 100000,
  lineCostVnd: 60000,
  foodPriceId: "price",
  priceBookId: "book",
  priceFoodFactVersionId: "fact",
  purchaseProvenance: "Reviewed vendor weight sale",
  purchaseTermsContentHash: "a".repeat(64),
  observedAt: "2026-10-02",
  freshness: "current",
  groceryCategoryCode: "meat_seafood",
  checked: false,
  checkedAt: null,
  transferredToPantry: false,
  policyRefs: [policy],
  sources: [
    {
      dayIndex: 0,
      mealPlanItemId: "plan-item",
      mealOptionId: "option",
      mealOptionVersionId: "option-version",
      mealOptionNameVi: "Cá kho",
      mealOptionRecipeId: "component",
      recipeVersionId: "recipe",
      recipeIngredientId: "ingredient",
      foodFactVersionId: "fact",
      baseUnitId: "g",
      requiredBaseQuantity: "600",
      quantityPolicyRef: policy
    }
  ]
}
function repo(line: unknown = item, total = 60000) {
  const payload = {
    status: "ready",
    snapshotVersion: "shopping-list-v2",
    planId: "plan",
    revisionId: "revision",
    weekStart: "2026-10-05",
    calculationFingerprint: "b".repeat(64),
    budgetVnd: 700000,
    budgetStatus: "within",
    overageVnd: 0,
    totalEstimatedCostVnd: total,
    warnings: [],
    items: [line]
  }
  return createSupabaseVersionedShoppingListRepository({
    rpc: vi.fn().mockResolvedValue({ data: payload, error: null })
  } as unknown as SupabaseClient<Database>)
}
test("reads loose fish with no package fiction and validates actual source sum", async () => {
  const r = await repo().load("plan")
  expect(r).toMatchObject({
    snapshotVersion: "shopping-list-v2",
    items: [{ purchaseBaseQuantity: "600", lineCostVnd: 60000 }]
  })
  if (r?.status === "ready") expect(r.items[0]).not.toHaveProperty("purchasePackageCount")
})
test.each([
  { lineCostVnd: 100000 },
  { purchaseBaseQuantity: "1000" },
  { leftoverBaseQuantity: "0.6" },
  { purchaseRule: { mode: "loose_count", saleStepBaseQuantity: "1" } },
  { sources: [{ ...item.sources[0], requiredBaseQuantity: "599" }] },
  { policyRefs: [{ ...policy, contentHash: "bad" }] }
])("rejects invalid v2 amounts, mode, source or policy %j", async (change) => {
  await expect(repo({ ...item, ...change }).load("plan")).rejects.toMatchObject({
    code: "INVALID_STORED_DATA"
  })
})
test("keeps fully pantry-covered row with zero cost", async () => {
  await expect(
    repo(
      {
        ...item,
        pantryDeductedBaseQuantity: "600",
        purchaseRequiredBaseQuantity: "0",
        purchaseUnitCount: "0",
        purchaseBaseQuantity: "0",
        lineCostVnd: 0
      },
      0
    ).load("plan")
  ).resolves.toMatchObject({ items: [{ lineCostVnd: 0, pantryDeductedBaseQuantity: "600" }] })
})
