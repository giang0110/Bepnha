import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js"

import type {
  AuthOperationResult,
  AuthSession,
  AuthSessionChange,
  AuthSessionPort,
  PasswordUpdateResult
} from "@/application/auth/auth-session-port"

import type { Database } from "./database.types.js"

function mapSession(session: Session | null): AuthSession | null {
  if (session === null) {
    return null
  }
  return {
    accessToken: session.access_token,
    identity: { userId: session.user.id, email: session.user.email ?? null }
  }
}

function mapAuthChange(event: AuthChangeEvent, session: Session | null): AuthSessionChange {
  const mappedSession = mapSession(session)
  if (event === "PASSWORD_RECOVERY" && mappedSession !== null) {
    return { kind: "PASSWORD_RECOVERY", session: mappedSession }
  }
  return { kind: "SESSION", session: mappedSession }
}

function mapAuthResult(
  session: Session | null,
  error: unknown,
  confirmationPending = false
): AuthOperationResult {
  if (error !== null) {
    return { ok: false, reason: "INVALID_CREDENTIALS" }
  }
  if (confirmationPending) {
    return { ok: true, session: null, confirmationPending: true }
  }
  return { ok: true, session: mapSession(session) }
}

interface SupabaseAuthFailure {
  readonly code?: string
  readonly status?: number
  readonly message?: string
}

function readAuthFailure(error: unknown): SupabaseAuthFailure {
  if (typeof error !== "object" || error === null) return {}
  const value = error as Record<string, unknown>
  return {
    ...(typeof value.code === "string" ? { code: value.code } : {}),
    ...(typeof value.status === "number" ? { status: value.status } : {}),
    ...(typeof value.message === "string" ? { message: value.message } : {})
  }
}

function mapPasswordUpdateFailure(error: unknown): PasswordUpdateResult {
  const { code, status, message } = readAuthFailure(error)
  if (code === "weak_password" || status === 422 || /password/iu.test(message ?? "")) {
    return { ok: false, reason: "WEAK_PASSWORD" }
  }
  // A recovery link that expired or was already spent leaves no session to update.
  if (code === "session_not_found" || status === 401 || status === 403) {
    return { ok: false, reason: "RECOVERY_SESSION_REQUIRED" }
  }
  return { ok: false, reason: "RETRYABLE_FAILURE" }
}

export function createSupabaseAuthSession(client: SupabaseClient<Database>): AuthSessionPort {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error !== null) {
        throw new Error("AUTH_SESSION_UNAVAILABLE")
      }
      return mapSession(data.session)
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange(
        (event: AuthChangeEvent, session: Session | null) => listener(mapAuthChange(event, session))
      )
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      return mapAuthResult(data.session, error)
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password })
      return mapAuthResult(data.session, error, error === null && data.session === null)
    },
    async signOut() {
      // A normal UI sign-out should clear only this browser session. Supabase defaults to
      // global sign-out, which would unexpectedly revoke the user's sessions on every device.
      const { error } = await client.auth.signOut({ scope: "local" })
      return error === null ? { ok: true } : { ok: false, reason: "RETRYABLE_FAILURE" }
    },
    async requestPasswordReset(email, redirectTo) {
      // The result deliberately does not distinguish "no such account": see the port's contract.
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
      return error === null ? { ok: true } : { ok: false, reason: "RETRYABLE_FAILURE" }
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password })
      return error === null ? { ok: true } : mapPasswordUpdateFailure(error)
    }
  }
}
