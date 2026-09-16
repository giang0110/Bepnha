import { readdir, readFile } from "node:fs/promises"
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

type VercelConfiguration = {
  headers?: Array<{
    headers: Array<{ key: string; value: string }>
    source: string
  }>
  installCommand?: string
  rewrites: Array<{ destination: string; source: string }>
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

function expectSecurityHeaders(response: ResponseDouble): void {
  expect(response.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff")
  expect(response.setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer")
  expect(response.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY")
  expect(response.setHeader).toHaveBeenCalledWith(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  )
  expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
}

async function readVercelConfiguration(): Promise<VercelConfiguration> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), "vercel.json"), "utf8")
  ) as VercelConfiguration
}

describe("health function", () => {
  it("returns the public healthy status for GET without operational details", () => {
    const response = createResponse()

    handler(requestFor("GET"), response.response)

    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.body).toEqual({ status: "ok" })
    expect(JSON.stringify(response.body)).not.toMatch(/env|version|database|secret|token|password/i)
    expectSecurityHeaders(response)
  })

  it("rejects non-GET methods with the allowed method and stable error body", () => {
    const response = createResponse()

    handler(requestFor("POST"), response.response)

    expect(response.setHeader).toHaveBeenCalledWith("Allow", "GET")
    expect(response.status).toHaveBeenCalledWith(405)
    expect(response.body).toEqual({ error: "METHOD_NOT_ALLOWED" })
    expectSecurityHeaders(response)
  })
})

describe("Vercel routing", () => {
  it("preserves API functions before falling through to the SPA entry point", async () => {
    const configuration = await readVercelConfiguration()

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

  it("keeps the deployable function count inside the platform ceiling", async () => {
    // Vercel turns every file under `api/` into a Serverless Function, `.test.ts` files included,
    // and the Hobby plan rejects a deployment with more than 12. Four test files silently occupied
    // that budget until `.vercelignore` excluded them; adding the tenth real endpoint would
    // otherwise have failed at deploy time rather than here.
    const HOBBY_FUNCTION_CEILING = 12

    const entries = await readdir(resolve(import.meta.dirname), {
      recursive: true,
      withFileTypes: true
    })
    const deployable = entries.filter((entry) => entry.isFile() && !entry.name.endsWith(".test.ts"))

    expect(deployable.length).toBeLessThanOrEqual(HOBBY_FUNCTION_CEILING)

    const ignore = await readFile(".vercelignore", "utf8")
    expect(ignore).toContain("api/**/*.test.ts")
  })

  it("installs from the lockfile so the build never depends on a hoisted transitive binary", async () => {
    const configuration = await readVercelConfiguration()

    // `npm run build` runs `tsc`, but the declared devDependency
    // `typescript -> npm:@typescript/typescript6` only ships a `tsc6` binary. The `tsc` binary comes
    // from its own transitive dependency, and npm only guarantees `node_modules/.bin` entries for
    // direct dependencies. An incremental or cached platform install can therefore leave `tsc`
    // unlinked and fail the build with `tsc: command not found` (exit 127), which is what every
    // Vercel deployment of this repository did. `npm ci` rebuilds the tree from the lockfile exactly
    // as CI does, and `--include=dev` keeps the build toolchain present even when the platform sets
    // a production NODE_ENV.
    expect(configuration.installCommand).toBe("npm ci --include=dev")
  })

  it("applies defensive SPA headers without broadening cross-origin access", async () => {
    const configuration = await readVercelConfiguration()

    expect(configuration.headers).toEqual([
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains"
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
          }
        ]
      }
    ])
    expect(JSON.stringify(configuration.headers)).not.toMatch(
      /Access-Control-Allow-Origin|unsafe-eval/i
    )
  })

  it("keeps the static content policy strict where it matters", async () => {
    const configuration = await readVercelConfiguration()
    const policy =
      configuration.headers?.[0]?.headers.find((header) => header.key === "Content-Security-Policy")
        ?.value ?? ""

    // The production document loads one external module script and no inline script, so no script
    // nonce or hash is needed and inline script must stay forbidden.
    expect(policy).toContain("script-src 'self';")
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/u)
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    // The browser client reaches Supabase REST, Auth and Realtime directly and nothing else.
    expect(policy).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
  })
})
