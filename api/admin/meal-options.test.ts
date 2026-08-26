import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import type { MealOptionAdminRepository } from "@/application/meal-option/execute-meal-option-admin-command"

import { createMealOptionAdminHandler } from "./meal-options.js"

function responseDouble() {
  const state = { body: undefined as unknown, status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }
  const response = state as unknown as VercelResponse
  state.status.mockReturnValue(response)
  state.json.mockImplementation((body: unknown) => {
    state.body = body
    return response
  })
  return { state, response }
}

function request(method: string, body: unknown, authorization = "Bearer signed"): VercelRequest {
  return {
    method,
    body,
    headers: { authorization, "content-type": "application/json" }
  } as VercelRequest
}

function repository(overrides: Partial<MealOptionAdminRepository> = {}): MealOptionAdminRepository {
  const success = {
    ok: true as const,
    value: { id: "option-1", revision: 1, status: "draft" as const }
  }
  return {
    create: vi.fn().mockResolvedValue(success),
    saveDraft: vi.fn().mockResolvedValue(success),
    loadPublicationAggregate: vi.fn(),
    publish: vi.fn().mockResolvedValue(success),
    retire: vi.fn().mockResolvedValue(success),
    ...overrides
  }
}

describe("POST /api/admin/meal-options", () => {
  test.each([
    [undefined, null, 401, "UNAUTHORIZED"],
    ["Bearer forged", null, 401, "UNAUTHORIZED"],
    ["Bearer ordinary", { userId: "user", isAdmin: false }, 403, "ADMIN_REQUIRED"]
  ] as const)(
    "requires a signed administrator identity",
    async (authorization, identity, status, error) => {
      const handler = createMealOptionAdminHandler({
        auth: { verify: vi.fn().mockResolvedValue(identity) },
        repositoryFor: vi.fn(),
        hasher: { sha256: vi.fn() }
      })
      const { state, response } = responseDouble()
      await handler(request("POST", {}, authorization), response)
      expect(state.status).toHaveBeenCalledWith(status)
      expect(state.body).toEqual({ error })
    }
  )

  test("accepts only the closed create command and uses the verified actor", async () => {
    const repo = repository()
    const repositoryFor = vi.fn(() => repo)
    const handler = createMealOptionAdminHandler({
      auth: { verify: vi.fn().mockResolvedValue({ userId: "admin-1", isAdmin: true }) },
      repositoryFor,
      hasher: { sha256: vi.fn() }
    })
    const { state, response } = responseDouble()
    await handler(
      request("POST", {
        action: "create_meal_option",
        input: { code: "com_ga_rau", nameVi: "Cơm gà rau" }
      }),
      response
    )
    expect(repositoryFor).toHaveBeenCalledWith("admin-1")
    expect(repo.create).toHaveBeenCalledOnce()
    expect(state.status).toHaveBeenCalledWith(200)
  })

  test.each([
    ["GET", { action: "create_meal_option", input: {} }, 405],
    [
      "POST",
      { action: "create_meal_option", input: { code: "x", nameVi: "X", contentHash: "forged" } },
      400
    ],
    [
      "POST",
      {
        action: "publish_meal_option",
        input: { mealOptionVersionId: "v", expectedRevision: 1, actor: "forged" }
      },
      400
    ],
    [
      "POST",
      {
        action: "retire_meal_option",
        input: { mealOptionId: "x", expectedRevision: 1, currentVersionId: "forged" }
      },
      400
    ],
    ["POST", { action: "unknown", input: {} }, 400]
  ] as const)(
    "rejects method, unknown, extra, and authoritative fields",
    async (method, body, status) => {
      const handler = createMealOptionAdminHandler({
        auth: { verify: vi.fn().mockResolvedValue({ userId: "admin-1", isAdmin: true }) },
        repositoryFor: vi.fn(() => repository()),
        hasher: { sha256: vi.fn() }
      })
      const { state, response } = responseDouble()
      await handler(request(method, body), response)
      expect(state.status).toHaveBeenCalledWith(status)
    }
  )

  test("returns only sanitized dependency failures", async () => {
    const repo = repository({
      create: vi.fn().mockRejectedValue(new Error("SUPABASE_SECRET_KEY leaked"))
    })
    const handler = createMealOptionAdminHandler({
      auth: { verify: vi.fn().mockResolvedValue({ userId: "admin-1", isAdmin: true }) },
      repositoryFor: vi.fn(() => repo),
      hasher: { sha256: vi.fn() }
    })
    const { state, response } = responseDouble()
    await handler(
      request("POST", {
        action: "create_meal_option",
        input: { code: "com_ga_rau", nameVi: "Cơm gà rau" }
      }),
      response
    )
    expect(state.body).toEqual({ error: "CATALOG_UNAVAILABLE" })
    expect(JSON.stringify(state.body)).not.toMatch(/secret|supabase/i)
  })
})
