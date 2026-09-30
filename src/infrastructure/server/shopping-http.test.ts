import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import { createShoppingReadHttpHandler } from "./shopping-http"

const PLAN_ID = "40000000-0000-0000-0000-000000000001"
const REVISION_ID = "50000000-0000-0000-0000-000000000001"

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

function request(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: "GET",
    headers: { authorization: "Bearer signed-token" },
    query: { planId: PLAN_ID, revisionId: REVISION_ID },
    ...overrides
  } as VercelRequest
}

describe("shopping read HTTP", () => {
  test("forwards only a verified user token and exact revision reference to the owner-scoped read", async () => {
    const load = vi.fn().mockResolvedValue({ status: "legacy_unavailable" })
    const handler = createShoppingReadHttpHandler({
      auth: { verify: vi.fn().mockResolvedValue({ userId: "user-1" }) },
      load
    })
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(load).toHaveBeenCalledWith("signed-token", PLAN_ID, REVISION_ID)
    expect(state.status).toHaveBeenCalledWith(200)
    expect(state.body).toEqual({ shoppingList: { status: "legacy_unavailable" } })
    expect(state.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
  })

  test.each([
    [request({ method: "POST" }), 405, "METHOD_NOT_ALLOWED"],
    [request({ query: { planId: "not-an-id" } }), 400, "INVALID_REQUEST"],
    [request({ headers: {} }), 401, "UNAUTHORIZED"]
  ] as const)(
    "rejects invalid method, query or authentication",
    async (incoming, status, error) => {
      const load = vi.fn()
      const handler = createShoppingReadHttpHandler({
        auth: { verify: vi.fn().mockResolvedValue({ userId: "user-1" }) },
        load
      })
      const { state, response } = responseDouble()

      await handler(incoming, response)

      expect(state.status).toHaveBeenCalledWith(status)
      expect(state.body).toEqual({ error })
      expect(load).not.toHaveBeenCalled()
    }
  )

  test("does not turn an authentication dependency outage into anonymous access", async () => {
    const handler = createShoppingReadHttpHandler({
      auth: { verify: vi.fn().mockRejectedValue(new Error("down")) },
      load: vi.fn()
    })
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(state.status).toHaveBeenCalledWith(503)
    expect(state.body).toEqual({ error: "AUTH_UNAVAILABLE" })
  })
})
