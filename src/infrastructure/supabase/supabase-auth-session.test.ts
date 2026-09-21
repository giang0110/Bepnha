import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import { createSupabaseAuthSession } from "./supabase-auth-session"

import type { Database } from "./database.types"

function clientWith(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient<Database>
}

type SupabaseAuthListener = (event: AuthChangeEvent, session: Session | null) => void

describe("Supabase password recovery", () => {
  test("preserves PASSWORD_RECOVERY instead of flattening it into a normal session", () => {
    const unsubscribe = vi.fn()
    let callback: SupabaseAuthListener | undefined
    const onAuthStateChange = vi.fn((listener: SupabaseAuthListener) => {
      callback = listener
      return { data: { subscription: { unsubscribe } } }
    })
    const auth = createSupabaseAuthSession(clientWith({ onAuthStateChange }))
    const listener = vi.fn()
    auth.onAuthStateChange(listener)

    callback?.(
      "PASSWORD_RECOVERY",
      {
        access_token: "recovery-token",
        user: { id: "user-1", email: "nguoi-dung@example.com" }
      } as Session
    )

    expect(listener).toHaveBeenCalledWith({
      kind: "PASSWORD_RECOVERY",
      session: {
        accessToken: "recovery-token",
        identity: { userId: "user-1", email: "nguoi-dung@example.com" }
      }
    })
  })

  test("asks Supabase to return the user to the given recovery path", async () => {
    const resetPasswordForEmail = vi.fn(() => Promise.resolve({ error: null }))
    const session = createSupabaseAuthSession(clientWith({ resetPasswordForEmail }))

    await expect(
      session.requestPasswordReset(
        "nguoi-dung@example.com",
        "https://bepnha.example/reset-password"
      )
    ).resolves.toEqual({ ok: true })
    expect(resetPasswordForEmail).toHaveBeenCalledWith("nguoi-dung@example.com", {
      redirectTo: "https://bepnha.example/reset-password"
    })
  })

  test("reports only accepted-or-not, never whether the address has an account", async () => {
    const accepted = createSupabaseAuthSession(
      clientWith({ resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null })) })
    )
    const refused = createSupabaseAuthSession(
      clientWith({
        resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: { status: 500 } }))
      })
    )

    // Supabase answers the same way for a registered and an unregistered address, and the port
    // surface has no branch that could leak the difference.
    await expect(accepted.requestPasswordReset("a@example.com", "https://x/r")).resolves.toEqual({
      ok: true
    })
    await expect(refused.requestPasswordReset("a@example.com", "https://x/r")).resolves.toEqual({
      ok: false,
      reason: "RETRYABLE_FAILURE"
    })
  })

  test("updates the password through the recovery session", async () => {
    const updateUser = vi.fn(() => Promise.resolve({ error: null }))
    const session = createSupabaseAuthSession(clientWith({ updateUser }))

    await expect(session.updatePassword("mat-khau-moi-1")).resolves.toEqual({ ok: true })
    expect(updateUser).toHaveBeenCalledWith({ password: "mat-khau-moi-1" })
  })

  test.each([
    ["a weak_password code", { code: "weak_password" }, "WEAK_PASSWORD"],
    ["an unprocessable status", { status: 422 }, "WEAK_PASSWORD"],
    [
      "a password-shaped message",
      { message: "Password should be at least 6 characters" },
      "WEAK_PASSWORD"
    ],
    ["a missing session code", { code: "session_not_found" }, "RECOVERY_SESSION_REQUIRED"],
    ["an unauthorized status", { status: 401 }, "RECOVERY_SESSION_REQUIRED"],
    ["a forbidden status", { status: 403 }, "RECOVERY_SESSION_REQUIRED"],
    ["a server fault", { status: 500 }, "RETRYABLE_FAILURE"],
    ["an unrecognisable failure", { weird: true }, "RETRYABLE_FAILURE"]
  ])("maps %s to %s", async (_name, error, reason) => {
    const session = createSupabaseAuthSession(
      clientWith({ updateUser: vi.fn(() => Promise.resolve({ error })) })
    )

    await expect(session.updatePassword("mat-khau-moi-1")).resolves.toEqual({ ok: false, reason })
  })
})
