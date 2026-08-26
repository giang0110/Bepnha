import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, it, vi } from "vitest"

import { createMeHandler } from "./me.js"

type ResponseDouble = {
  body: unknown
  json: ReturnType<typeof vi.fn>
  response: VercelResponse
  setHeader: ReturnType<typeof vi.fn>
  status: ReturnType<typeof vi.fn>
}

function createResponse(): ResponseDouble {
  const result = {} as ResponseDouble
  result.status = vi.fn(() => result.response)
  result.json = vi.fn((body: unknown) => {
    result.body = body
    return result.response
  })
  result.setHeader = vi.fn()
  result.response = result as unknown as VercelResponse
  return result
}

function requestFor(method: string, authorization?: string, body?: unknown): VercelRequest {
  return {
    method,
    body,
    headers: authorization === undefined ? {} : { authorization }
  } as VercelRequest
}

describe("GET /api/me", () => {
  it("returns only the verified user id and ignores body identity", async () => {
    const verify = vi.fn(() => Promise.resolve({ userId: "verified-user" }))
    const handler = createMeHandler({ verify })
    const response = createResponse()

    await handler(
      requestFor("GET", "Bearer valid-token", { userId: "attacker-selected-user" }),
      response.response
    )

    expect(verify).toHaveBeenCalledWith("valid-token")
    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.body).toEqual({ userId: "verified-user" })
  })

  it.each([undefined, "Bearer forged-token"])(
    "returns a stable unauthorized response for missing or rejected credentials",
    async (authorization) => {
      const handler = createMeHandler({ verify: vi.fn(() => Promise.resolve(null)) })
      const response = createResponse()

      await handler(requestFor("GET", authorization), response.response)

      expect(response.status).toHaveBeenCalledWith(401)
      expect(response.body).toEqual({ error: "UNAUTHORIZED" })
    }
  )

  it("rejects unsupported methods without trying authentication", async () => {
    const verify = vi.fn()
    const handler = createMeHandler({ verify })
    const response = createResponse()

    await handler(requestFor("POST", "Bearer token"), response.response)

    expect(response.setHeader).toHaveBeenCalledWith("Allow", "GET")
    expect(response.status).toHaveBeenCalledWith(405)
    expect(response.body).toEqual({ error: "METHOD_NOT_ALLOWED" })
    expect(verify).not.toHaveBeenCalled()
  })

  it("sanitizes infrastructure failures without leaking credentials or internals", async () => {
    const handler = createMeHandler({
      verify: vi.fn(() => Promise.reject(new Error("valid-token SUPABASE_URL database timeout")))
    })
    const response = createResponse()

    await handler(requestFor("GET", "Bearer valid-token"), response.response)

    expect(response.status).toHaveBeenCalledWith(503)
    expect(response.body).toEqual({ error: "AUTH_UNAVAILABLE" })
    expect(JSON.stringify(response.body)).not.toMatch(/token|supabase|database|timeout/i)
  })
})
