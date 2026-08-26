import { createContext, use } from "react"

import type { AuthOperationResult, AuthSession } from "@/application/auth/auth-session-port"

export type AuthStatus = "authenticated" | "loading" | "signed-out"

export interface AuthContextValue {
  session: AuthSession | null
  signIn(email: string, password: string): Promise<AuthOperationResult>
  signOut(): Promise<{ ok: true } | { ok: false; reason: "RETRYABLE_FAILURE" }>
  signUp(email: string, password: string): Promise<AuthOperationResult>
  status: AuthStatus
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = use(AuthContext)
  if (value === null) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return value
}
