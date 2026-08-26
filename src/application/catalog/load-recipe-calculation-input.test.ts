import { describe, expect, test, vi } from "vitest"

import type { CatalogReadRepository } from "@/application/catalog/catalog-read-repository"
import { loadRecipeCalculationInput } from "@/application/catalog/load-recipe-calculation-input"

const nutrients = ["energy_kcal", "protein_g", "carbohydrate_g", "fat_g", "fibre_g", "sodium_mg"]
const allergens = [
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "soy",
  "wheat",
  "fish",
  "crustacean",
  "mollusc",
  "sesame"
]

function calculationRecord(overrides: Record<string, unknown> = {}) {
  return {
    recipePublicationStatus: "published" as const,
    priceBookPublicationStatus: "published" as const,
    priceBookRetiredAt: null,
    recipe: {
      recipeId: "recipe-rice",
      recipeVersionId: "recipe-rice-v1",
      recipeVersionNumber: 1,
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
            code: "rice",
            nameVi: "Gạo",
            baseUnitId: "unit-g"
          },
          fact: {
            foodFactVersionId: "fact-rice-v1",
            versionNumber: 1,
            contentHash: "b".repeat(64),
            edibleFraction: "1",
            conversion: {
              unitId: "unit-g",
              baseQuantityPerUnit: "1",
              grossGramsPerUnit: "1"
            },
            nutrients: nutrients.map((nutrientCode) => ({ nutrientCode, amountPer100g: "0" })),
            allergenAssessments: allergens.map((allergenCode) => ({
              allergenCode,
              status: "absent" as const
            })),
            categoryAncestry: ["staple", "food"],
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
          baseUnitId: "unit-g",
          packageBaseQuantity: "1000",
          packagePriceVnd: 30_000,
          observedAt: "2026-08-01"
        }
      ]
    },
    ...overrides
  }
}

function repositoryFor(record: ReturnType<typeof calculationRecord>): CatalogReadRepository {
  return {
    getCurrentPriceBook: vi.fn(),
    getPublishedRecipeCalculation: vi.fn().mockResolvedValue({ ok: true, value: record })
  }
}

const request = {
  recipeVersionId: "recipe-rice-v1",
  priceBookId: "book-v1",
  calculationDate: "2026-08-26",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }]
} as const

describe("loadRecipeCalculationInput", () => {
  test.each([null, "2026-08-25T00:00:00.000Z"])(
    "loads current or retired published books by exact ID (retiredAt=%s)",
    async (priceBookRetiredAt) => {
      const repository = repositoryFor(calculationRecord({ priceBookRetiredAt }))

      const result = await loadRecipeCalculationInput(repository, request)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.reason)
      expect(result.value.input.priceBook.priceBookId).toBe("book-v1")
      expect(result.value.input.recipe.recipeVersionId).toBe("recipe-rice-v1")
      expect(result.value.canonicalInput).not.toContain("retiredAt")
      expect(repository.getCurrentPriceBook).not.toHaveBeenCalled()
      expect(repository.getPublishedRecipeCalculation).toHaveBeenCalledWith(
        "recipe-rice-v1",
        "book-v1"
      )
    }
  )

  test("normalizes unordered set-like children deterministically", async () => {
    const first = calculationRecord()
    const ingredient = first.recipe.ingredients[0]!
    const reordered = calculationRecord({
      recipe: {
        ...first.recipe,
        ingredients: [
          {
            ...ingredient,
            fact: {
              ...ingredient.fact,
              nutrients: [...ingredient.fact.nutrients].reverse(),
              allergenAssessments: [...ingredient.fact.allergenAssessments].reverse(),
              categoryAncestry: [...ingredient.fact.categoryAncestry].reverse()
            }
          }
        ]
      }
    })

    const firstResult = await loadRecipeCalculationInput(repositoryFor(first), request)
    const secondResult = await loadRecipeCalculationInput(repositoryFor(reordered), request)

    expect(firstResult.ok && secondResult.ok).toBe(true)
    if (!firstResult.ok || !secondResult.ok) throw new Error("Expected valid inputs")
    expect(firstResult.value.canonicalInput).toBe(secondResult.value.canonicalInput)
  })

  test.each([
    ["draft recipe", { recipePublicationStatus: "draft" }, "UNPUBLISHED_CATALOG"],
    ["draft book", { priceBookPublicationStatus: "draft" }, "UNPUBLISHED_CATALOG"],
    [
      "wrong recipe ID",
      { recipe: { ...calculationRecord().recipe, recipeVersionId: "substituted" } },
      "CATALOG_ID_MISMATCH"
    ],
    [
      "wrong book ID",
      { priceBook: { ...calculationRecord().priceBook, priceBookId: "substituted" } },
      "CATALOG_ID_MISMATCH"
    ],
    [
      "missing nutrient",
      {
        recipe: {
          ...calculationRecord().recipe,
          ingredients: calculationRecord().recipe.ingredients.map((item) => ({
            ...item,
            fact: { ...item.fact, nutrients: item.fact.nutrients.slice(1) }
          }))
        }
      },
      "INCOMPLETE_CATALOG_LINEAGE"
    ],
    [
      "duplicate price",
      {
        priceBook: {
          ...calculationRecord().priceBook,
          prices: [calculationRecord().priceBook.prices[0], calculationRecord().priceBook.prices[0]]
        }
      },
      "DUPLICATE_CATALOG_CHILD"
    ]
  ] as const)(
    "rejects %s without substituting a current record",
    async (_label, overrides, reason) => {
      const result = await loadRecipeCalculationInput(
        repositoryFor(calculationRecord(overrides)),
        request
      )

      expect(result).toEqual({ ok: false, reason })
    }
  )

  test("maps repository failures without fabricating catalog data", async () => {
    const repository: CatalogReadRepository = {
      getCurrentPriceBook: vi.fn(),
      getPublishedRecipeCalculation: vi.fn().mockResolvedValue({
        ok: false,
        reason: "NOT_FOUND"
      })
    }

    await expect(loadRecipeCalculationInput(repository, request)).resolves.toEqual({
      ok: false,
      reason: "NOT_FOUND"
    })
  })
})
