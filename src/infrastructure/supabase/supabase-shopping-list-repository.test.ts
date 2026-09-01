import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import type { Database } from "./database.types"
import { createSupabaseShoppingListRepository } from "./supabase-shopping-list-repository"

const readyPayload = {
  status: "ready",
  planId: "plan-a",
  revisionId: "revision-a",
  weekStart: "2026-08-31",
  calculationFingerprint: "a".repeat(64),
  budgetVnd: "700000",
  budgetStatus: "within",
  overageVnd: 0,
  totalEstimatedCostVnd: 50_000,
  warnings: [
    {
      code: "STALE_PRICE",
      foodId: "food-a",
      foodPriceId: "price-a",
      observedAt: "2026-07-01",
      ageDays: 56
    }
  ],
  items: [
    {
      shoppingListItemId: "item-a",
      foodId: "food-a",
      foodNameVi: "Gạo",
      baseUnitId: "unit-g",
      requiredBaseQuantity: "700",
      packageBaseQuantity: "1000",
      purchaseIncrement: "1",
      purchasePackageCount: "1",
      purchaseBaseQuantity: "1000",
      leftoverBaseQuantity: "300",
      packagePriceVnd: "50000",
      lineCostVnd: 50_000,
      foodPriceId: "price-a",
      priceBookId: "book-a",
      priceFoodFactVersionId: "fact-a",
      observedAt: "2026-07-01",
      freshness: "stale_usable",
      groceryCategoryCode: "staples",
      checked: false,
      checkedAt: null,
      sources: [
        {
          dayIndex: 0,
          mealPlanItemId: "plan-item-a",
          mealOptionId: "option-a",
          mealOptionVersionId: "option-v1",
          mealOptionNameVi: "Cơm nhà",
          mealOptionRecipeId: "component-a",
          recipeVersionId: "recipe-v1",
          recipeIngredientId: "ingredient-a",
          foodFactVersionId: "fact-a",
          baseUnitId: "unit-g",
          requiredBaseQuantity: "100"
        }
      ]
    }
  ]
} as const

function clientWithRpc(
  responder: (name: string, args: unknown) => { data: unknown; error: unknown }
) {
  const rpc = vi.fn((name: string, args: unknown) => Promise.resolve(responder(name, args)))
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc
  }
}

describe("Supabase shopping-list repository read", () => {
  it("loads and strictly maps the current ready revision", async () => {
    const { client, rpc } = clientWithRpc(() => ({ data: readyPayload, error: null }))

    await expect(createSupabaseShoppingListRepository(client).load("plan-a")).resolves.toEqual({
      ...readyPayload,
      budgetVnd: 700_000,
      items: [
        {
          ...readyPayload.items[0],
          packagePriceVnd: 50_000,
          lineCostVnd: 50_000,
          sources: [...readyPayload.items[0].sources]
        }
      ],
      warnings: [...readyPayload.warnings]
    })
    expect(rpc).toHaveBeenCalledWith("get_shopping_list", {
      p_plan_id: "plan-a"
    })
  })

  it("passes an exact historical revision id and maps legacy unavailable evidence", async () => {
    const legacy = {
      status: "legacy_unavailable",
      code: "SHOPPING_LIST_NOT_AVAILABLE_FOR_LEGACY_REVISION",
      planId: "plan-a",
      revisionId: "revision-v1",
      weekStart: "2026-08-24"
    }
    const { client, rpc } = clientWithRpc(() => ({ data: legacy, error: null }))

    await expect(
      createSupabaseShoppingListRepository(client).load("plan-a", "revision-v1")
    ).resolves.toEqual(legacy)
    expect(rpc).toHaveBeenCalledWith("get_shopping_list", {
      p_plan_id: "plan-a",
      p_revision_id: "revision-v1"
    })
  })

  it("returns null when RLS hides a missing or cross-owner plan", async () => {
    const { client } = clientWithRpc(() => ({ data: null, error: null }))

    await expect(
      createSupabaseShoppingListRepository(client).load("plan-hidden")
    ).resolves.toBeNull()
  })

  it("rejects malformed stored evidence instead of guessing", async () => {
    const malformed = {
      ...readyPayload,
      items: [
        {
          ...readyPayload.items[0],
          requiredBaseQuantity: "0700"
        }
      ]
    }
    const { client } = clientWithRpc(() => ({ data: malformed, error: null }))

    await expect(createSupabaseShoppingListRepository(client).load("plan-a")).rejects.toMatchObject(
      {
        code: "INVALID_STORED_DATA"
      }
    )
  })

  it.each([
    [{ code: "42501", message: "permission denied sensitive detail" }, "UNAUTHORIZED"],
    [{ code: "08006", message: "database host and token" }, "DEPENDENCY_UNAVAILABLE"]
  ] as const)("maps RPC failures without leaking raw text", async (error, code) => {
    const { client } = clientWithRpc(() => ({ data: null, error }))

    const promise = createSupabaseShoppingListRepository(client).load("plan-a")
    await expect(promise).rejects.toMatchObject({ code })
    await expect(promise).rejects.not.toThrow(/permission|database|host|token|detail/i)
  })
})

describe("Supabase shopping-list repository check state", () => {
  it.each([
    [true, "2026-09-01T00:00:00Z"],
    [false, null]
  ] as const)("sets checked=%s through the narrow RPC", async (checked, checkedAt) => {
    const { client, rpc } = clientWithRpc(() => ({
      data: { shoppingListItemId: "item-a", checked, checkedAt },
      error: null
    }))

    await expect(
      createSupabaseShoppingListRepository(client).setChecked("item-a", checked)
    ).resolves.toEqual({ shoppingListItemId: "item-a", checked, checkedAt })
    expect(rpc).toHaveBeenCalledWith("set_shopping_item_checked", {
      p_shopping_list_item_id: "item-a",
      p_checked: checked
    })
  })

  it("rejects a mismatched or malformed mutation response", async () => {
    const { client } = clientWithRpc(() => ({
      data: { shoppingListItemId: "another-item", checked: true, checkedAt: null },
      error: null
    }))

    await expect(
      createSupabaseShoppingListRepository(client).setChecked("item-a", true)
    ).rejects.toMatchObject({ code: "INVALID_STORED_DATA" })
  })

  it.each([
    [{ code: "42501", message: "owner mismatch detail" }, "UNAUTHORIZED"],
    [{ code: "08006", message: "database host and token" }, "DEPENDENCY_UNAVAILABLE"]
  ] as const)("maps check-state RPC failures", async (error, code) => {
    const { client } = clientWithRpc(() => ({ data: null, error }))

    await expect(
      createSupabaseShoppingListRepository(client).setChecked("item-a", true)
    ).rejects.toMatchObject({ code })
  })
})
