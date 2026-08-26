// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

import { createServerAdminAuthVerifier } from "./server-admin-auth"

describe("server administrator authentication", () => {
  test("accepts only signed app metadata administrator role", async () => {
    const getUser = vi.fn(() =>
      Promise.resolve({
        data: {
          user: {
            id: "admin-user",
            app_metadata: { role: "admin" },
            user_metadata: { role: "ordinary" }
          }
        },
        error: null
      })
    )

    await expect(
      createServerAdminAuthVerifier({ auth: { getUser } }).verify("signed-token")
    ).resolves.toEqual({ userId: "admin-user", isAdmin: true })
    expect(getUser).toHaveBeenCalledWith("signed-token")
  })

  test.each([
    [{ id: "user", app_metadata: {}, user_metadata: { role: "admin" } }, false],
    [{ id: "user", app_metadata: { role: "user" }, user_metadata: {} }, false],
    [{ id: "admin", app_metadata: { role: "admin" }, user_metadata: {} }, true]
  ])("uses signed app metadata only for administrator status", async (user, isAdmin) => {
    const verifier = createServerAdminAuthVerifier({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })) }
    })

    await expect(verifier.verify("untrusted-token")).resolves.toEqual({ userId: user.id, isAdmin })
  })

  test("rejects forged or otherwise unverifiable tokens", async () => {
    const verifier = createServerAdminAuthVerifier({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: { code: "bad_jwt" } }))
      }
    })

    await expect(verifier.verify("forged-token")).resolves.toBeNull()
  })
})
