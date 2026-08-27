import { describe, expect, test } from "vitest"

import { canonicalRecipeCalculationInput } from "@/domain/calculation/recipe-calculation-input"
import { PORTION_CONFIG_V1 } from "@/domain/portion/portion-config"
import { PRICE_FRESHNESS_CONFIG_V1 } from "@/domain/pricing/pricing"

const fixture = {
  calculationVersion: "recipe-calculation-v1",
  portionConfig: PORTION_CONFIG_V1,
  priceFreshnessConfig: PRICE_FRESHNESS_CONFIG_V1,
  calculationDate: "2026-08-26",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
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
          nutrients: [
            { nutrientCode: "protein_g", amountPer100g: "7" },
            { nutrientCode: "energy_kcal", amountPer100g: "350" }
          ],
          allergenAssessments: [
            { allergenCode: "soy", status: "absent" },
            { allergenCode: "egg", status: "absent" }
          ],
          categoryAncestry: ["staple"],
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
        foodFactVersionId: "fact-price-rice-v1",
        baseUnitId: "unit-g",
        packageBaseQuantity: "1000",
        packagePriceVnd: 30_000,
        observedAt: "2026-08-01"
      }
    ]
  }
} as const

describe("canonicalRecipeCalculationInput", () => {
  test("contains exact lineage/config/date and excludes a mutable current pointer", () => {
    const canonical = canonicalRecipeCalculationInput({
      ...fixture,
      currentPriceBookId: "mutable-pointer-must-not-enter-fingerprint"
    })

    expect(canonical).toContain('"calculationVersion":"recipe-calculation-v1"')
    expect(canonical).toContain('"version":"portion-v1"')
    expect(canonical).toContain('"version":"price-freshness-v1"')
    expect(canonical).toContain('"foodFactVersionId":"fact-rice-v1"')
    expect(canonical).toContain('"priceBookId":"book-v1"')
    expect(canonical).toContain('"calculationDate":"2026-08-26"')
    expect(canonical).not.toContain("currentPriceBookId")
    expect(canonical).not.toContain("mutable-pointer")
  })

  test("sorts set-like lineage and prices while retaining ingredient order", () => {
    const reordered = {
      ...fixture,
      recipe: {
        ...fixture.recipe,
        ingredients: fixture.recipe.ingredients.map((ingredient) => ({
          ...ingredient,
          fact: {
            ...ingredient.fact,
            nutrients: [...ingredient.fact.nutrients].reverse(),
            allergenAssessments: [...ingredient.fact.allergenAssessments].reverse(),
            categoryAncestry: [...ingredient.fact.categoryAncestry].reverse(),
            dietaryTagCodes: [...ingredient.fact.dietaryTagCodes].reverse()
          }
        }))
      },
      priceBook: { ...fixture.priceBook, prices: [...fixture.priceBook.prices].reverse() }
    }

    expect(canonicalRecipeCalculationInput(reordered)).toBe(
      canonicalRecipeCalculationInput(fixture)
    )
  })

  test("ignores a mutable food display name", () => {
    const renamed = {
      ...fixture,
      recipe: {
        ...fixture.recipe,
        ingredients: fixture.recipe.ingredients.map((ingredient) => ({
          ...ingredient,
          food: { ...ingredient.food, nameVi: "Gạo trắng đổi tên" }
        }))
      }
    }

    expect(canonicalRecipeCalculationInput(renamed)).toBe(canonicalRecipeCalculationInput(fixture))
  })

  test.each([
    ["recipe hash", { recipe: { ...fixture.recipe, contentHash: "d".repeat(64) } }],
    [
      "fact ID",
      {
        recipe: {
          ...fixture.recipe,
          ingredients: fixture.recipe.ingredients.map((ingredient) => ({
            ...ingredient,
            fact: { ...ingredient.fact, foodFactVersionId: "fact-rice-v2" }
          }))
        }
      }
    ],
    [
      "conversion",
      {
        recipe: {
          ...fixture.recipe,
          ingredients: fixture.recipe.ingredients.map((ingredient) => ({
            ...ingredient,
            fact: {
              ...ingredient.fact,
              conversion: { ...ingredient.fact.conversion, grossGramsPerUnit: "1.1" }
            }
          }))
        }
      }
    ],
    [
      "price",
      {
        priceBook: {
          ...fixture.priceBook,
          prices: fixture.priceBook.prices.map((item) => ({ ...item, packagePriceVnd: 30_001 }))
        }
      }
    ],
    ["date", { calculationDate: "2026-08-27" }]
  ] as const)("changes canonical bytes when the %s changes", (_label, change) => {
    expect(canonicalRecipeCalculationInput({ ...fixture, ...change })).not.toBe(
      canonicalRecipeCalculationInput(fixture)
    )
  })

  test("instruction text is retained in immutable recipe snapshots but never accepted here", () => {
    const firstRecipeSnapshot = { instructionVi: "Thêm dầu.", calculation: fixture }
    const secondRecipeSnapshot = { instructionVi: "Dọn món.", calculation: fixture }

    expect(canonicalRecipeCalculationInput(firstRecipeSnapshot.calculation)).toBe(
      canonicalRecipeCalculationInput(secondRecipeSnapshot.calculation)
    )
  })
})
