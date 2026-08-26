import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js"

import type {
  AuthOperationResult,
  AuthSession,
  AuthSessionPort
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
        (_event: AuthChangeEvent, session: Session | null) => listener(mapSession(session))
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
      const { error } = await client.auth.signOut()
      return error === null ? { ok: true } : { ok: false, reason: "RETRYABLE_FAILURE" }
    }
  }
}
