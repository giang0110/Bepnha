import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { describe, expect, it, vi } from "vitest"

import handler from "./health.js"

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
  result.body = undefined
  result.response = result as unknown as VercelResponse

  return result
}

function requestFor(method: string): VercelRequest {
  return { method } as VercelRequest
}

describe("health function", () => {
  it("returns the public healthy status for GET without operational details", () => {
    const response = createResponse()

    handler(requestFor("GET"), response.response)

    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.body).toEqual({ status: "ok" })
    expect(JSON.stringify(response.body)).not.toMatch(/env|version|database|secret|token|password/i)
  })

  it("rejects non-GET methods with the allowed method and stable error body", () => {
    const response = createResponse()

    handler(requestFor("POST"), response.response)

    expect(response.setHeader).toHaveBeenCalledWith("Allow", "GET")
    expect(response.status).toHaveBeenCalledWith(405)
    expect(response.body).toEqual({ error: "METHOD_NOT_ALLOWED" })
  })
})

describe("Vercel routing", () => {
  it("preserves API functions before falling through to the SPA entry point", async () => {
    const configuration = JSON.parse(
      await readFile(resolve(process.cwd(), "vercel.json"), "utf8")
    ) as {
      rewrites: Array<{ destination: string; source: string }>
    }

    expect(configuration.rewrites).toEqual([
      { source: "/api/(.*)", destination: "/api/$1" },
      { source: "/(.*)", destination: "/index.html" }
    ])

    const [apiRewrite, spaRewrite] = configuration.rewrites
    if (apiRewrite === undefined || spaRewrite === undefined) {
      throw new Error("Vercel rewrites must contain API and SPA rules")
    }

    const apiPath = "/api/health"
    const apiMatch = apiPath.match(new RegExp(apiRewrite.source))
    expect(apiMatch).not.toBeNull()
    const apiCapture = apiMatch?.[1]
    if (apiCapture === undefined) {
      throw new Error("API rewrite must capture the function path")
    }
    expect(apiRewrite.destination.replace("$1", apiCapture)).toBe("/api/health")

    const deepLink = "/phase-0/deep-link"
    expect(deepLink).not.toMatch(new RegExp(apiRewrite.source))
    expect(deepLink).toMatch(new RegExp(spaRewrite.source))
    expect(spaRewrite.destination).toBe("/index.html")
  })
})
