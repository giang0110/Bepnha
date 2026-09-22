import { describe, expect, test, vi } from "vitest"

import { ACCOUNT_DELETE_CONFIRMATION } from "@/application/account/account-deletion"

import { createAccountApi } from "./account-api"

function response(status: number, payload: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(() => Promise.resolve(payload))
  } as unknown as Response
}

describe("account API", () => {
  test("deletes only through the authenticated account endpoint with the confirmation sentinel", async () => {
    const fetcher = vi.fn(() => Promise.resolve(response(200)))
    const api = createAccountApi(fetcher)

    await expect(api.deleteOwnAccount("owner-token")).resolves.toEqual({ ok: true })

    expect(fetcher).toHaveBeenCalledWith("/api/account", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer owner-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ confirmation: ACCOUNT_DELETE_CONFIRMATION })
    })
  })

  test("maps catalog authorship retention without exposing provider details", async () => {
    const api = createAccountApi(
      vi.fn(() =>
        Promise.resolve(
          response(409, {
            error: "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP",
            providerDetail: "must not escape"
          })
        )
      )
    )

    await expect(api.deleteOwnAccount("owner-token")).resolves.toEqual({
      ok: false,
      reason: "ACCOUNT_RETAINED_FOR_CATALOG_AUTHORSHIP"
    })
  })

  test.each([
    [401, { error: "UNAUTHORIZED" }],
    [401, { error: "anything" }],
    [403, { error: "UNAUTHORIZED" }]
  ])("maps unauthorized response %s consistently", async (status, payload) => {
    const api = createAccountApi(vi.fn(() => Promise.resolve(response(status, payload))))

    await expect(api.deleteOwnAccount("owner-token")).resolves.toEqual({
      ok: false,
      reason: "UNAUTHORIZED"
    })
  })

  test.each([
    [400, { error: "CONFIRMATION_REQUIRED" }],
    [409, { error: "unexpected-conflict" }],
    [503, { error: "ACCOUNT_DELETE_UNAVAILABLE" }],
    [500, null]
  ])(
    "collapses provider/server failure %s to a retryable account failure",
    async (status, payload) => {
      const api = createAccountApi(vi.fn(() => Promise.resolve(response(status, payload))))

      await expect(api.deleteOwnAccount("owner-token")).resolves.toEqual({
        ok: false,
        reason: "ACCOUNT_DELETE_UNAVAILABLE"
      })
    }
  )

  test("treats malformed JSON error responses as retryable", async () => {
    const badResponse = {
      ok: false,
      status: 503,
      json: vi.fn(() => Promise.reject(new SyntaxError("bad json")))
    } as unknown as Response
    const api = createAccountApi(vi.fn(() => Promise.resolve(badResponse)))

    await expect(api.deleteOwnAccount("owner-token")).resolves.toEqual({
      ok: false,
      reason: "ACCOUNT_DELETE_UNAVAILABLE"
    })
  })

  test("treats network failures as retryable", async () => {
    const api = createAccountApi(vi.fn(() => Promise.reject(new Error("network down"))))

    await expect(api.deleteOwnAccount("owner-token")).resolves.toEqual({
      ok: false,
      reason: "ACCOUNT_DELETE_UNAVAILABLE"
    })
  })
})
