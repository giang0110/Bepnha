import { createHash } from "node:crypto"

import { describe, expect, test, vi } from "vitest"

import type { CatalogAdminRepository } from "@/application/catalog/catalog-admin-repository"
import { executeCatalogAdminCommand } from "@/application/catalog/execute-catalog-admin-command"
import type { ContentHasher } from "@/application/catalog/content-hasher"
import { REQUIRED_NUTRIENT_CODES, SUPPORTED_ALLERGEN_CODES } from "@/domain/catalog/catalog"

const success = {
  ok: true as const,
  value: { id: "entity", revision: 2, status: "draft" as const }
}

function adminRepository(overrides: Partial<CatalogAdminRepository> = {}): CatalogAdminRepository {
  return {
    createFood: vi.fn().mockResolvedValue(success),
    saveFoodFactDraft: vi.fn().mockResolvedValue(success),
    publishFoodFact: vi.fn().mockResolvedValue({
      ok: true,
      value: { id: "fact-v1", revision: 2, status: "published", contentHash: "f".repeat(64) }
    }),
    retireFood: vi.fn().mockResolvedValue(success),
    createRecipe: vi.fn().mockResolvedValue(success),
    saveRecipeVersionDraft: vi.fn().mockResolvedValue(success),
    publishRecipe: vi.fn().mockResolvedValue({
      ok: true,
      value: { id: "recipe-v1", revision: 2, status: "published", contentHash: "f".repeat(64) }
    }),
    retireRecipe: vi.fn().mockResolvedValue(success),
    createPriceBook: vi.fn().mockResolvedValue(success),
    savePriceBookDraft: vi.fn().mockResolvedValue(success),
    publishPriceBook: vi.fn().mockResolvedValue({
      ok: true,
      value: { id: "book-v1", revision: 2, status: "published", contentHash: "f".repeat(64) }
    }),
    retirePriceBook: vi.fn().mockResolvedValue(success),
    getAggregateForPublication: vi.fn(),
    ...overrides
  }
}

const hasher: ContentHasher = {
  sha256: vi.fn().mockResolvedValue("f".repeat(64))
}

const recipeAggregate = {
  aggregateType: "recipe_version" as const,
  recipe: { recipeId: "recipe", code: "com", nameVi: "Cơm", revision: 1 },
  version: {
    recipeVersionId: "recipe-v1",
    versionNumber: 1,
    revision: 1,
    yieldAdultEquivalent: "4",
    activeMinutes: 10,
    elapsedMinutes: 20,
    publicationStatus: "draft" as const,
    contentHash: null
  },
  ingredients: [
    {
      recipeIngredientId: "ingredient-rice",
      foodId: "food-rice",
      foodFactVersionId: "fact-rice-v1",
      foodFactContentHash: "a".repeat(64),
      foodFactPublicationStatus: "published" as const,
      quantity: "500",
      unitId: "unit-g",
      preparationNoteVi: null,
      order: 1,
      hasPinnedConversion: true
    }
  ],
  steps: [
    {
      recipeStepId: "step-1",
      order: 1,
      instructionVi: "Vo gạo rồi nấu chín.",
      timerMinutes: 20
    }
  ],
  stepIngredients: [],
  tags: []
}

const foodAggregate = {
  aggregateType: "food_fact_version" as const,
  food: {
    foodId: "food-rice",
    code: "gao_trang",
    nameVi: "Gạo trắng",
    baseDimension: "mass",
    baseUnitId: "unit-g",
    revision: 1
  },
  fact: {
    foodFactVersionId: "fact-rice-v1",
    versionNumber: 1,
    revision: 1,
    categoryId: "category-staple",
    edibleFraction: "1",
    nutritionBasis: "per_100g_edible" as const,
    provenance: "Vietnam baseline",
    publicationStatus: "draft" as const,
    contentHash: null
  },
  conversions: [
    {
      unitId: "unit-g",
      baseQuantityPerUnit: "1",
      grossGramsPerUnit: "1",
      displayStep: "5",
      provenance: "Gram identity"
    }
  ],
  assessments: SUPPORTED_ALLERGEN_CODES.map((allergenCode) => ({
    allergenCode,
    status: "absent" as const
  })),
  nutrients: REQUIRED_NUTRIENT_CODES.map((nutrientCode) => ({
    nutrientCode,
    amountPer100g: nutrientCode === "energy_kcal" ? "350" : "0"
  })),
  dietaryTags: [{ dietaryTagId: "tag-vegetarian", code: "vegetarian" }]
}

describe("executeCatalogAdminCommand", () => {
  test("routes an allowlisted create command without adding protected fields", async () => {
    const repository = adminRepository()

    await expect(
      executeCatalogAdminCommand(repository, hasher, {
        action: "create_food",
        input: {
          code: "gao_trang",
          nameVi: "Gạo trắng",
          baseDimension: "mass",
          baseUnitId: "unit-g"
        }
      })
    ).resolves.toEqual(success)
    expect(repository.createFood).toHaveBeenCalledWith({
      code: "gao_trang",
      nameVi: "Gạo trắng",
      baseDimension: "mass",
      baseUnitId: "unit-g"
    })
  })

  test("reloads, validates, canonicalizes, hashes, then publishes a recipe", async () => {
    const events: string[] = []
    const repository = adminRepository({
      getAggregateForPublication: vi.fn(() => {
        events.push("reload")
        return Promise.resolve({ ok: true as const, value: recipeAggregate })
      }),
      publishRecipe: vi.fn((input: Parameters<CatalogAdminRepository["publishRecipe"]>[0]) => {
        events.push("publish")
        expect(input.contentHash).toBe("f".repeat(64))
        return Promise.resolve({
          ok: true as const,
          value: {
            id: input.id,
            revision: 2,
            status: "published" as const,
            contentHash: input.contentHash
          }
        })
      })
    })
    const orderedHasher: ContentHasher = {
      sha256: vi.fn((bytes: Uint8Array) => {
        events.push("hash")
        expect(new TextDecoder().decode(bytes)).toContain('"instructionVi":"Vo gạo rồi nấu chín."')
        return Promise.resolve("f".repeat(64))
      })
    }

    const result = await executeCatalogAdminCommand(repository, orderedHasher, {
      action: "publish_recipe",
      input: { recipeVersionId: "recipe-v1", expectedRevision: 1 }
    })

    expect(result.ok).toBe(true)
    expect(events).toEqual(["reload", "hash", "publish"])
  })

  test.each([
    ["recipe", "recipe_version" as const, recipeAggregate],
    ["food fact", "food_fact_version" as const, foodAggregate]
  ])(
    "keeps the golden %s publication payload and SHA-256 stable",
    async (_label, type, aggregate) => {
      let canonicalPayload = ""
      const recordingHasher: ContentHasher = {
        sha256: (bytes) => {
          canonicalPayload = new TextDecoder().decode(bytes)
          return Promise.resolve(createHash("sha256").update(bytes).digest("hex"))
        }
      }
      const publish = vi.fn(
        (input: { id: string; expectedRevision: number; contentHash: string }) =>
          Promise.resolve({
            ok: true as const,
            value: {
              id: input.id,
              revision: 2,
              status: "published" as const,
              contentHash: input.contentHash
            }
          })
      )
      const repository = adminRepository({
        getAggregateForPublication: vi.fn().mockResolvedValue({ ok: true, value: aggregate }),
        ...(type === "recipe_version" ? { publishRecipe: publish } : { publishFoodFact: publish })
      })
      const id = type === "recipe_version" ? "recipe-v1" : "fact-rice-v1"
      const command =
        type === "recipe_version"
          ? ({
              action: "publish_recipe",
              input: { recipeVersionId: id, expectedRevision: 1 }
            } as const)
          : ({
              action: "publish_food_fact",
              input: { foodFactVersionId: id, expectedRevision: 1 }
            } as const)

      const result = await executeCatalogAdminCommand(repository, recordingHasher, command)

      expect(result.ok).toBe(true)
      expect(canonicalPayload).toMatchSnapshot()
      expect(publish).toHaveBeenCalledWith({
        id,
        expectedRevision: 1,
        contentHash:
          type === "recipe_version"
            ? "6603770e050e45a55559c252c5bb7f655cd3f4f95d1c43767611d67204793a86"
            : "2a3ce91bc4bda223f3e5749a44c713ad2e1d73ae00a78aae0d3ce51cb3bee3a8"
      })
    }
  )

  test("does not write when a recipe aggregate has no structured ingredient", async () => {
    const repository = adminRepository({
      getAggregateForPublication: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...recipeAggregate, ingredients: [] }
      })
    })

    await expect(
      executeCatalogAdminCommand(repository, hasher, {
        action: "publish_recipe",
        input: { recipeVersionId: "recipe-v1", expectedRevision: 1 }
      })
    ).resolves.toEqual({ ok: false, reason: "PUBLICATION_INCOMPLETE" })
    expect(repository.publishRecipe).not.toHaveBeenCalled()
    expect(hasher.sha256).not.toHaveBeenCalled()
  })

  test.each(["", " ", "a".repeat(501)])(
    "rejects invalid editorial instruction before draft write: %s",
    async (instructionVi) => {
      const repository = adminRepository()

      const result = await executeCatalogAdminCommand(repository, hasher, {
        action: "save_recipe_version_draft",
        input: {
          recipeVersionId: "recipe-v1",
          expectedRevision: 1,
          yieldAdultEquivalent: "4",
          activeMinutes: 10,
          elapsedMinutes: 20,
          ingredients: recipeAggregate.ingredients,
          steps: [{ order: 1, instructionVi, timerMinutes: null, ingredientIds: [] }],
          tagIds: []
        }
      })

      expect(result).toEqual({ ok: false, reason: "VALIDATION_FAILED" })
      expect(repository.saveRecipeVersionDraft).not.toHaveBeenCalled()
    }
  )

  test("accepts normal instruction text but never derives structured ingredients from it", async () => {
    const repository = adminRepository()
    const input = {
      recipeVersionId: "recipe-v1",
      expectedRevision: 1,
      yieldAdultEquivalent: "4",
      activeMinutes: 10,
      elapsedMinutes: 20,
      ingredients: recipeAggregate.ingredients,
      steps: [
        {
          order: 1,
          instructionVi: "Đảo đều rồi dọn món.",
          timerMinutes: null,
          ingredientIds: []
        }
      ],
      tagIds: []
    } as const

    await executeCatalogAdminCommand(repository, hasher, {
      action: "save_recipe_version_draft",
      input
    })

    expect(repository.saveRecipeVersionDraft).toHaveBeenCalledWith(input)
    expect(input.ingredients).toHaveLength(1)
    expect(input.ingredients[0]?.foodId).toBe("food-rice")
  })

  test("maps revision conflicts and never retries with a different revision", async () => {
    const repository = adminRepository({
      createFood: vi.fn().mockResolvedValue({ ok: false, reason: "STALE_CATALOG_REVISION" })
    })

    await expect(
      executeCatalogAdminCommand(repository, hasher, {
        action: "create_food",
        input: {
          code: "gao_trang",
          nameVi: "Gạo trắng",
          baseDimension: "mass",
          baseUnitId: "unit-g"
        }
      })
    ).resolves.toEqual({ ok: false, reason: "STALE_CATALOG_REVISION" })
    expect(repository.createFood).toHaveBeenCalledTimes(1)
  })
})
