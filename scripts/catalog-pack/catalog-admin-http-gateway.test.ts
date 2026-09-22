import { describe, expect, test, vi } from "vitest"

import { createAdminHttpGateway } from "./catalog-admin-http-gateway.ts"
import type { CatalogMutationPlanOperationV1 } from "./catalog-mutation-types.ts"

const operation: CatalogMutationPlanOperationV1 = {
  operationId: "op-1",
  kind: "create_food",
  logicalKey: "food:ga_ta",
  dependsOn: [],
  input: null,
  outputs: ["id", "revision"]
}

function respondWith(status: number, body: unknown) {
  return vi.fn(async () =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
      })
    )
  )
}

function gateway(fetchImpl: unknown) {
  return createAdminHttpGateway({
    endpoint: "https://example.test/api/admin/catalog",
    accessToken: "token-abc",
    fetch: fetchImpl as typeof globalThis.fetch
  })
}

function callArgs(fetchImpl: { mock: { calls: unknown[][] } }, index = 0) {
  const call = fetchImpl.mock.calls[index]
  if (call === undefined) throw new Error("fetch was not called")
  return { url: call[0] as string, init: call[1] as RequestInit }
}

describe("the request it sends", () => {
  test("posts the operation kind as the action and the resolved input as the input", async () => {
    const fetchImpl = respondWith(200, { id: "food-1", revision: 1, status: "draft" })
    await gateway(fetchImpl)(operation, { code: "ga_ta" })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const { url, init } = callArgs(fetchImpl)
    expect(url).toBe("https://example.test/api/admin/catalog")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      action: "create_food",
      input: { code: "ga_ta" }
    })
  })

  test("routes meal-option operations to the dedicated admin endpoint", async () => {
    const fetchImpl = respondWith(200, { id: "meal-option-1", revision: 1, status: "draft" })
    await gateway(fetchImpl)(
      {
        ...operation,
        operationId: "create_meal_option:test",
        kind: "create_meal_option",
        logicalKey: "meal_option:test"
      },
      { code: "test", nameVi: "Test" }
    )

    const { url } = callArgs(fetchImpl)
    expect(url).toBe("https://example.test/api/admin/meal-options")
  })

  test("authenticates as the operator rather than with a shared secret", async () => {
    const fetchImpl = respondWith(200, { id: "food-1", revision: 1, status: "draft" })
    await gateway(fetchImpl)(operation, {})

    const { init } = callArgs(fetchImpl)
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer token-abc")
  })

  test("sends one request per operation and never retries", async () => {
    const fetchImpl = respondWith(503, { error: "CATALOG_UNAVAILABLE" })
    await gateway(fetchImpl)(operation, {})

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe("how it reads the answer", () => {
  test("takes the outputs a plan operation declares", async () => {
    const fetchImpl = respondWith(200, {
      id: "food-1",
      revision: 3,
      status: "published",
      contentHash: "a".repeat(64)
    })
    const outcome = await gateway(fetchImpl)(operation, {})

    expect(outcome).toEqual({
      ok: true,
      outputs: { id: "food-1", revision: 3, status: "published", contentHash: "a".repeat(64) }
    })
  })

  test.each([
    [401, "UNAUTHORIZED"],
    [403, "ADMIN_REQUIRED"],
    [409, "STALE_CATALOG_REVISION"],
    [422, "PUBLICATION_INCOMPLETE"],
    [400, "VALIDATION_FAILED"],
    [503, "CATALOG_UNAVAILABLE"]
  ])("carries the endpoint's own %i reason through", async (status, error) => {
    const fetchImpl = respondWith(status, { error })
    const outcome = await gateway(fetchImpl)(operation, {})

    expect(outcome).toEqual({ ok: false, reason: `${status} ${error}` })
  })

  test("prints the refusing rule beside the code, so the operator need not go and find it", async () => {
    const fetchImpl = respondWith(400, {
      error: "VALIDATION_FAILED",
      detail: "PRICE_REQUIRES_PUBLISHED_FACT_CONVERSION"
    })
    const outcome = await gateway(fetchImpl)(operation, {})

    expect(outcome).toEqual({
      ok: false,
      reason: "400 VALIDATION_FAILED (PRICE_REQUIRES_PUBLISHED_FACT_CONVERSION)"
    })
  })

  test("reports a status even when the body says nothing", async () => {
    const fetchImpl = respondWith(500, undefined)
    const outcome = await gateway(fetchImpl)(operation, {})

    expect(outcome).toEqual({ ok: false, reason: "500" })
  })

  test("refuses a 200 that carries no id rather than recording an empty success", async () => {
    const fetchImpl = respondWith(200, { revision: 1, status: "draft" })
    const outcome = await gateway(fetchImpl)(operation, {})

    expect(outcome).toEqual({ ok: false, reason: "the endpoint answered 200 with no usable id" })
  })

  test("says a request that never got an answer may still have been applied", async () => {
    const fetchImpl = vi.fn(async () => Promise.reject(new Error("socket hang up")))
    const outcome = await gateway(fetchImpl)(operation, {})

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toMatch(/may or may not have been applied/)
  })

  test("a timeout is reported the same way, not as a clean failure", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"))
          })
        })
    )
    const outcome = await createAdminHttpGateway({
      endpoint: "https://example.test/api/admin/catalog",
      accessToken: "token-abc",
      fetch: fetchImpl as typeof globalThis.fetch,
      timeoutMs: 5
    })(operation, {})

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toMatch(/may or may not have been applied/)
  })
})
