import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import type { CatalogAdminRepository } from "@/application/catalog/catalog-admin-repository"
import type { ContentHasher } from "@/application/shared/content-hasher"

import { createCatalogAdminHandler } from "./catalog.js"

function repository(overrides: Partial<CatalogAdminRepository> = {}): CatalogAdminRepository {
  const result = {
    ok: true as const,
    value: { id: "entity", revision: 2, status: "draft" as const }
  }
  return {
    createFood: vi.fn().mockResolvedValue(result),
    saveFoodFactDraft: vi.fn().mockResolvedValue(result),
    publishFoodFact: vi.fn().mockResolvedValue(result),
    retireFood: vi.fn().mockResolvedValue(result),
    createRecipe: vi.fn().mockResolvedValue(result),
    saveRecipeVersionDraft: vi.fn().mockResolvedValue(result),
    publishRecipe: vi.fn().mockResolvedValue(result),
    retireRecipe: vi.fn().mockResolvedValue(result),
    createPriceBook: vi.fn().mockResolvedValue(result),
    savePriceBookDraft: vi.fn().mockResolvedValue(result),
    publishPriceBook: vi.fn().mockResolvedValue(result),
    retirePriceBook: vi.fn().mockResolvedValue(result),
    getAggregateForPublication: vi.fn(),
    ...overrides
  }
}

function responseDouble() {
  const result = { body: undefined as unknown, status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }
  const response = result as unknown as VercelResponse
  result.status.mockReturnValue(response)
  result.json.mockImplementation((body: unknown) => {
    result.body = body
    return response
  })
  return { result, response }
}

function request(method: string, authorization?: string, body?: unknown): VercelRequest {
  return {
    method,
    headers: authorization === undefined ? {} : { authorization },
    body
  } as VercelRequest
}

const hasher: ContentHasher = { sha256: vi.fn().mockResolvedValue("a".repeat(64)) }

describe("POST /api/admin/catalog", () => {
  test.each([
    [undefined, null, 401, "UNAUTHORIZED"],
    ["Bearer forged", null, 401, "UNAUTHORIZED"],
    ["Bearer ordinary", { userId: "user", isAdmin: false }, 403, "ADMIN_REQUIRED"]
  ] as const)(
    "rejects missing, forged, and ordinary credentials",
    async (header, identity, status, error) => {
      const repositoryFor = vi.fn()
      const handler = createCatalogAdminHandler({
        auth: { verify: vi.fn().mockResolvedValue(identity) },
        repositoryFor,
        hasher
      })
      const { result, response } = responseDouble()

      await handler(request("POST", header, {}), response)

      expect(result.status).toHaveBeenCalledWith(status)
      expect(result.body).toEqual({ error })
      expect(repositoryFor).not.toHaveBeenCalled()
    }
  )

  test("executes an allowlisted command with the verified actor repository", async () => {
    const adminRepository = repository()
    const repositoryFor = vi.fn(() => adminRepository)
    const handler = createCatalogAdminHandler({
      auth: { verify: vi.fn().mockResolvedValue({ userId: "admin", isAdmin: true }) },
      repositoryFor,
      hasher
    })
    const { result, response } = responseDouble()

    await handler(
      request("POST", "Bearer signed", {
        action: "create_food",
        input: {
          code: "gao_trang",
          nameVi: "Gạo trắng",
          baseDimension: "mass",
          baseUnitId: "unit-g"
        }
      }),
      response
    )

    expect(repositoryFor).toHaveBeenCalledWith("admin")
    expect(adminRepository.createFood).toHaveBeenCalledOnce()
    expect(result.status).toHaveBeenCalledWith(200)
    expect(result.body).toEqual({ id: "entity", revision: 2, status: "draft" })
  })

  test.each([
    ["Đảo đều rồi dọn món.", 200, 1],
    ["", 400, 0],
    ["a".repeat(501), 400, 0]
  ] as const)(
    "keeps bounded instruction text editorial (status=%s)",
    async (instructionVi, expectedStatus, expectedWrites) => {
      const adminRepository = repository()
      const handler = createCatalogAdminHandler({
        auth: { verify: vi.fn().mockResolvedValue({ userId: "admin", isAdmin: true }) },
        repositoryFor: vi.fn(() => adminRepository),
        hasher
      })
      const { result, response } = responseDouble()
      const ingredient = {
        recipeIngredientId: "local-rice",
        foodId: "food-rice",
        foodFactVersionId: "fact-rice-v1",
        quantity: "500",
        unitId: "unit-g",
        preparationNoteVi: null,
        order: 1
      }

      await handler(
        request("POST", "Bearer signed", {
          action: "save_recipe_version_draft",
          input: {
            recipeVersionId: "recipe-v1",
            expectedRevision: 1,
            recipeId: "recipe",
            versionNumber: 1,
            yieldAdultEquivalent: "4",
            activeMinutes: 10,
            elapsedMinutes: 20,
            ingredients: [ingredient],
            steps: [{ order: 1, instructionVi, timerMinutes: 5, ingredientIds: ["local-rice"] }],
            tagIds: []
          }
        }),
        response
      )

      expect(result.status).toHaveBeenCalledWith(expectedStatus)
      expect(adminRepository.saveRecipeVersionDraft).toHaveBeenCalledTimes(expectedWrites)
      if (expectedWrites === 1) {
        expect(adminRepository.saveRecipeVersionDraft).toHaveBeenCalledWith(
          expect.objectContaining({ ingredients: [ingredient] })
        )
      }
    }
  )

  test.each([
    ["GET", { action: "create_food", input: {} }, 405, "METHOD_NOT_ALLOWED"],
    ["POST", { action: "unknown", input: {} }, 400, "VALIDATION_FAILED"],
    [
      "POST",
      { action: "create_food", input: { code: "rice", contentHash: "attacker" } },
      400,
      "VALIDATION_FAILED"
    ],
    [
      "POST",
      { action: "create_food", input: { code: "rice", extra: true } },
      400,
      "VALIDATION_FAILED"
    ]
  ] as const)(
    "rejects method, action, protected, or extra fields",
    async (method, body, status, error) => {
      const handler = createCatalogAdminHandler({
        auth: { verify: vi.fn().mockResolvedValue({ userId: "admin", isAdmin: true }) },
        repositoryFor: vi.fn(() => repository()),
        hasher
      })
      const { result, response } = responseDouble()

      await handler(request(method, "Bearer signed", body), response)

      expect(result.status).toHaveBeenCalledWith(status)
      expect(result.body).toEqual({ error })
    }
  )

  test("sanitizes repository failures and never returns credentials or SQL", async () => {
    const adminRepository = repository({
      createFood: vi.fn().mockRejectedValue(new Error("SUPABASE_SECRET_KEY SQL token"))
    })
    const handler = createCatalogAdminHandler({
      auth: { verify: vi.fn().mockResolvedValue({ userId: "admin", isAdmin: true }) },
      repositoryFor: vi.fn(() => adminRepository),
      hasher
    })
    const { result, response } = responseDouble()

    await handler(
      request("POST", "Bearer signed", {
        action: "create_food",
        input: {
          code: "gao",
          nameVi: "Gạo",
          baseDimension: "mass",
          baseUnitId: "unit-g"
        }
      }),
      response
    )

    expect(result.status).toHaveBeenCalledWith(503)
    expect(result.body).toEqual({ error: "CATALOG_UNAVAILABLE" })
    expect(JSON.stringify(result.body)).not.toMatch(/secret|sql|token|supabase/i)
  })
})
