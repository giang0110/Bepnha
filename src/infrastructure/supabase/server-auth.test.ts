// @vitest-environment node

import { describe, expect, it, vi } from "vitest"

import { createServerAuthVerifier, parseBearerToken } from "./server-auth"

describe("parseBearerToken", () => {
  it("returns the exact token for a single valid bearer header", () => {
    expect(parseBearerToken("Bearer header.payload.signature")).toBe("header.payload.signature")
    expect(parseBearerToken("bearer token-value")).toBe("token-value")
  })

  it.each([
    undefined,
    "",
    "Bearer",
    "Bearer  token",
    "Basic token",
    "Bearer token extra",
    ["Bearer one", "Bearer two"]
  ])("rejects malformed or ambiguous authorization value %j", (header) => {
    expect(parseBearerToken(header)).toBeNull()
  })
})

describe("createServerAuthVerifier", () => {
  it("verifies the access token with getUser and returns only the user id", async () => {
    const getUser = vi.fn(() =>
      Promise.resolve({
        data: { user: { id: "user-a", email: "private@example.test" } },
        error: null
      })
    )
    const verifier = createServerAuthVerifier({ auth: { getUser } })

    await expect(verifier.verify("access-token")).resolves.toEqual({ userId: "user-a" })
    expect(getUser).toHaveBeenCalledWith("access-token")
  })

  it("maps rejected, missing, or malformed users to unauthorized", async () => {
    const errorVerifier = createServerAuthVerifier({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: new Error("expired") }))
      }
    })
    const missingVerifier = createServerAuthVerifier({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) }
    })

    await expect(errorVerifier.verify("expired-token")).resolves.toBeNull()
    await expect(missingVerifier.verify("missing-user")).resolves.toBeNull()
  })
})
