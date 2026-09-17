import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, test, vi } from "vitest"

import { ACCOUNT_DELETE_CONFIRMATION } from "@/application/account/account-deletion"

import { createAccountHttpHandler, type AccountDeleter } from "./account-http"

function responseDouble() {
  const state = {
    body: undefined as unknown,
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn()
  }
  const response = state as unknown as VercelResponse
  state.status.mockReturnValue(response)
  state.json.mockImplementation((body: unknown) => {
    state.body = body
    return response
  })
  return { state, response }
}

function request(
  options: {
    method?: string
    contentType?: string
    authorization?: string
    body?: unknown
  } = {}
) {
  return {
    method: options.method ?? "DELETE",
    body: "body" in options ? options.body : { confirmation: ACCOUNT_DELETE_CONFIRMATION },
    headers: {
      authorization: options.authorization ?? "Bearer signed-token",
      "content-type": options.contentType ?? "application/json"
    }
  } as unknown as VercelRequest
}

function setup(
  deleteUser: AccountDeleter["deleteUser"] = vi.fn(() => Promise.resolve({ error: null })),
  verified: unknown = { userId: "user-1" }
) {
  const deleterFactory = vi.fn(() => ({ deleteUser }))
  const emit = vi.fn()
  const handler = createAccountHttpHandler({
    auth: { verify: vi.fn().mockResolvedValue(verified) },
    deleterFactory,
    telemetry: { emit },
    createCorrelationId: () => "generated-correlation-id",
    now: () => 100
  })
  return { handler, deleteUser, deleterFactory, emit }
}

describe("account deletion endpoint", () => {
  test("deletes exactly the account the verified token belongs to", async () => {
    const { handler, deleteUser } = setup()
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(deleteUser).toHaveBeenCalledWith("user-1")
    expect(state.status).toHaveBeenCalledWith(200)
    expect(state.body).toEqual({ status: "deleted" })
  })

  test("ignores any account identifier a caller tries to supply", async () => {
    const { handler, deleteUser } = setup()
    const { state, response } = responseDouble()

    // An extra key is rejected outright: there is no request shape that names a different account.
    await handler(
      request({ body: { confirmation: ACCOUNT_DELETE_CONFIRMATION, userId: "someone-else" } }),
      response
    )

    expect(deleteUser).not.toHaveBeenCalled()
    expect(state.status).toHaveBeenCalledWith(400)
    expect(state.body).toEqual({ error: "CONFIRMATION_REQUIRED" })
  })

  test.each([
    ["a missing body", undefined],
    ["an empty object", {}],
    ["the wrong sentinel", { confirmation: "yes" }],
    ["a non-object body", "confirm"]
  ])("refuses %s without touching the deleter", async (_name, body) => {
    const { handler, deleteUser, deleterFactory } = setup()
    const { state, response } = responseDouble()

    await handler(request({ body }), response)

    expect(state.status).toHaveBeenCalledWith(400)
    expect(deleterFactory).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  test("never reaches the secret-backed deleter on an unauthenticated request", async () => {
    const { handler, deleterFactory } = setup(undefined, null)
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(state.status).toHaveBeenCalledWith(401)
    expect(deleterFactory).not.toHaveBeenCalled()
  })

  test("rejects a missing bearer token before verification", async () => {
    const { handler, deleterFactory } = setup()
    const { state, response } = responseDouble()

    await handler(request({ authorization: "" }), response)

    expect(state.status).toHaveBeenCalledWith(401)
    expect(deleterFactory).not.toHaveBeenCalled()
  })

  test("accepts only DELETE", async () => {
    const { handler } = setup()
    const { state, response } = responseDouble()

    await handler(request({ method: "POST" }), response)

    expect(state.status).toHaveBeenCalledWith(405)
    expect(state.setHeader).toHaveBeenCalledWith("Allow", "DELETE")
  })

  test("requires a JSON content type", async () => {
    const { handler } = setup()
    const { state, response } = responseDouble()

    await handler(request({ contentType: "text/plain" }), response)

    expect(state.status).toHaveBeenCalledWith(415)
  })

  test.each([
    ["a foreign key code", { code: "23503" }],
    [
      "a constraint message",
      { message: 'violates foreign key constraint "food_fact_versions_created_by_fkey"' }
    ]
  ])("explains catalog authorship retention from %s", async (_name, error) => {
    const { handler } = setup(vi.fn(() => Promise.resolve({ error })))
    const { state, response } = responseDouble()

    await handler(request(), response)

    // Catalog tables reference auth.users with `on delete restrict`; deleting such an account would
    // destroy immutable provenance. That is a refusal, not a server fault.
    expect(state.status).toHaveBeenCalledWith(409)
    expect(state.body).toEqual({ error: "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP" })
  })

  test("reports an unrelated provider fault as retryable", async () => {
    const { handler } = setup(vi.fn(() => Promise.resolve({ error: { status: 500 } })))
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(state.status).toHaveBeenCalledWith(503)
    expect(state.body).toEqual({ error: "ACCOUNT_DELETE_UNAVAILABLE" })
  })

  test("survives a deleter that throws", async () => {
    const { handler } = setup(vi.fn(() => Promise.reject(new Error("boom"))))
    const { state, response } = responseDouble()

    await handler(request(), response)

    expect(state.status).toHaveBeenCalledWith(503)
  })

  test("emits bounded telemetry carrying no account data", async () => {
    const { handler, emit } = setup()
    const { response } = responseDouble()

    await handler(request(), response)

    expect(emit).toHaveBeenCalledWith({
      event: "account_request",
      operation: "delete",
      correlationId: "generated-correlation-id",
      durationMs: 0,
      httpStatus: 200,
      outcomeCode: "DELETED"
    })
    const emitted = JSON.stringify(emit.mock.calls)
    expect(emitted).not.toContain("user-1")
    expect(emitted).not.toContain("signed-token")
  })
})
