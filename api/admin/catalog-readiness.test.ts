import type { VercelRequest, VercelResponse } from "@vercel/node"
import { afterEach, describe, expect, test, vi } from "vitest"

import handler from "./catalog.js"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function setup(restResponse: () => Response, isAdmin = true) {
  vi.stubEnv("SUPABASE_URL", "https://catalog.example.test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key")
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-server-key")
  const requests: { url: URL; method: string }[] = []
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
    requests.push({ url, method })
    return Promise.resolve(
      url.pathname === "/auth/v1/user"
        ? Response.json({ id: "admin-test", app_metadata: { role: isAdmin ? "admin" : "user" } })
        : restResponse()
    )
  })
  const result = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }
  const response = result as unknown as VercelResponse
  result.status.mockReturnValue(response)
  return { requests, result, response }
}

function request(input: Record<string, unknown> = {}): VercelRequest {
  return {
    method: "POST",
    headers: { authorization: "Bearer synthetic-admin-token", "content-type": "application/json" },
    body: { action: "check_catalog_readiness", input }
  } as VercelRequest
}

describe("deployed catalog readiness with Supabase transport", () => {
  test("reports a refused dependency with only its safe code and never writes", async () => {
    const { result, response, requests } = setup(() =>
      Response.json({ code: "42501", message: "RAW_SECRET_HOST_AND_SQL" }, { status: 403 })
    )

    await handler(request(), response)

    expect(result.status).toHaveBeenCalledWith(503)
    expect(result.json).toHaveBeenCalledWith({
      error: "CATALOG_UNAVAILABLE",
      stage: "allergens",
      dependencyStatus: 403,
      dependencyCode: "42501"
    })
    expect(requests.filter((item) => item.url.pathname.startsWith("/rest/v1/"))).toEqual([
      {
        url: new URL("https://catalog.example.test/rest/v1/allergens?select=id&limit=1"),
        method: "GET"
      }
    ])
  })

  test("verifies reference and draft read access without invoking a mutation", async () => {
    const { result, response, requests } = setup(() => Response.json([{ id: "reference-test" }]))

    await handler(request(), response)

    expect(result.status).toHaveBeenCalledWith(200)
    expect(result.json).toHaveBeenCalledWith({ ready: true })
    expect(requests.map((item) => [item.method, item.url.pathname])).toEqual([
      ["GET", "/auth/v1/user"],
      ["GET", "/rest/v1/allergens"],
      ["GET", "/rest/v1/nutrients"],
      ["GET", "/rest/v1/food_fact_versions"]
    ])
  })

  test("requires the verified admin role before querying dependencies", async () => {
    const { result, response, requests } = setup(() => Response.json([]), false)

    await handler(request(), response)

    expect(result.status).toHaveBeenCalledWith(403)
    expect(requests).toHaveLength(1)
  })

  test("rejects extra readiness input fields before accessing the catalog", async () => {
    const { result, response, requests } = setup(() => Response.json([]))

    await handler(request({ table: "auth.users" }), response)

    expect(result.status).toHaveBeenCalledWith(400)
    expect(requests).toHaveLength(1)
  })

  test("withholds arbitrary dependency codes and driver messages", async () => {
    const { result, response } = setup(() =>
      Response.json({ code: "RAW_SECRET_CODE", message: "RAW_SECRET_MESSAGE" }, { status: 401 })
    )

    await handler(request(), response)

    expect(result.json).toHaveBeenCalledWith({
      error: "CATALOG_UNAVAILABLE",
      stage: "allergens",
      dependencyStatus: 401
    })
  })

  test("reports missing server configuration without calling the catalog", async () => {
    const { result, response, requests } = setup(() => Response.json([]))
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined)

    await handler(request(), response)

    expect(result.status).toHaveBeenCalledWith(503)
    expect(result.json).toHaveBeenCalledWith({
      error: "CATALOG_UNAVAILABLE",
      stage: "configuration"
    })
    expect(requests).toHaveLength(1)
  })
})
