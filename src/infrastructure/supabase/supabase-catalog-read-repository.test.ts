import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import type { Database } from "./database.types"
import { createSupabaseCatalogReadRepository } from "./supabase-catalog-read-repository"

const publishedRecord = {
  recipe: {
    recipeId: "recipe-rice",
    recipeCode: "com_trang",
    recipeNameVi: "Cơm trắng",
    recipeVersionId: "recipe-v1",
    versionNumber: 1,
    contentHash: "a".repeat(64),
    yieldAdultEquivalent: "4",
    activeMinutes: 10,
    elapsedMinutes: 20,
    ingredients: [
      {
        recipeIngredientId: "ingredient-rice",
        order: 1,
        quantity: "500",
        unitId: "unit-g",
        food: {
          foodId: "food-rice",
          code: "gao_trang",
          nameVi: "Gạo trắng",
          baseUnitId: "unit-g",
          baseDimension: "mass"
        },
        fact: {
          foodFactVersionId: "fact-rice-v1",
          versionNumber: 1,
          contentHash: "b".repeat(64),
          edibleFraction: "1",
          categoryCode: "staple",
          categoryAncestry: ["food", "staple"],
          conversion: {
            unitId: "unit-g",
            baseQuantityPerUnit: "1",
            grossGramsPerUnit: "1",
            displayStep: "5"
          },
          nutrients: [
            {
              nutrientCode: "energy_kcal",
              unitCode: "kcal",
              displayPrecision: 0,
              amountPer100g: "350"
            }
          ],
          allergenAssessments: [{ allergenCode: "peanut", status: "absent" }],
          dietaryTagCodes: ["vegetarian"]
        }
      }
    ]
  },
  priceBook: {
    regionId: "region-vn",
    regionCode: "vn_baseline",
    priceBookId: "book-v1",
    versionNumber: 1,
    contentHash: "c".repeat(64),
    prices: [
      {
        foodPriceId: "price-rice",
        foodId: "food-rice",
        foodFactVersionId: "fact-price-rice-v2",
        packageQuantity: "1",
        packageUnitId: "unit-kg",
        packageBaseQuantity: "1000",
        baseUnitId: "unit-g",
        packagePriceVnd: 30_000,
        purchaseIncrement: "1",
        observedAt: "2026-08-01"
      }
    ]
  }
}

function clientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result))
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe("Supabase catalog read repository", () => {
  test("discovers only the current published price-book pointer", async () => {
    const { client, rpc } = clientWithRpc({
      data: { regionId: "region-vn", priceBookId: "book-current" },
      error: null
    })

    await expect(
      createSupabaseCatalogReadRepository(client).getCurrentPriceBook("region-vn")
    ).resolves.toEqual({ ok: true, value: { priceBookId: "book-current" } })
    expect(rpc).toHaveBeenCalledWith("get_current_price_book", { p_region_id: "region-vn" })
  })

  test("maps exact-ID published calculation JSON without current-pointer substitution", async () => {
    const { client, rpc } = clientWithRpc({ data: publishedRecord, error: null })

    const result = await createSupabaseCatalogReadRepository(client).getPublishedRecipeCalculation(
      "recipe-v1",
      "book-v1"
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        recipePublicationStatus: "published",
        priceBookPublicationStatus: "published",
        recipe: {
          recipeVersionId: "recipe-v1",
          recipeVersionNumber: 1,
          ingredients: [
            {
              quantity: "500",
              fact: {
                edibleFraction: "1",
                nutrients: [{ nutrientCode: "energy_kcal", amountPer100g: "350" }]
              }
            }
          ]
        },
        priceBook: {
          priceBookId: "book-v1",
          prices: [{ packageBaseQuantity: "1000", packagePriceVnd: 30_000 }]
        }
      }
    })
    expect(rpc).toHaveBeenCalledWith("get_published_recipe_calculation_input", {
      p_recipe_version_id: "recipe-v1",
      p_price_book_id: "book-v1"
    })
  })

  test.each([
    [null, null, "NOT_FOUND"],
    [{ malformed: true }, null, "DEPENDENCY_UNAVAILABLE"],
    [null, { code: "08006", message: "secret database endpoint" }, "DEPENDENCY_UNAVAILABLE"]
  ] as const)(
    "fails closed for absent, malformed, or failed RPC data",
    async (data, error, reason) => {
      const { client } = clientWithRpc({ data, error })

      const result = await createSupabaseCatalogReadRepository(
        client
      ).getPublishedRecipeCalculation("recipe-v1", "book-v1")

      expect(result).toEqual({ ok: false, reason })
      expect(JSON.stringify(result)).not.toMatch(/secret|endpoint|database/i)
    }
  )
})
