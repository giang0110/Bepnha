import { useEffect, useMemo, useState, type ReactNode } from "react"

import type { AuthSession, AuthSessionPort } from "@/application/auth/auth-session-port"
import { AuthContext, type AuthContextValue, type AuthStatus } from "@/app/auth/auth-context"

export function AuthProvider({
  children,
  port
}: Readonly<{ children: ReactNode; port: AuthSessionPort }>) {
  const [passwordRecoveryReady, setPasswordRecoveryReady] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")

  useEffect(() => {
    let active = true
    let authEventSeen = false
    const unsubscribe = port.onAuthStateChange((change) => {
      authEventSeen = true
      if (active) {
        setSession(change.session)
        setStatus(change.session === null ? "signed-out" : "authenticated")
        if (change.kind === "PASSWORD_RECOVERY") {
          setPasswordRecoveryReady(true)
        } else if (change.session === null) {
          setPasswordRecoveryReady(false)
        }
      }
    })

    void port
      .getSession()
      .then((restoredSession) => {
        if (active && !authEventSeen) {
          setPasswordRecoveryReady(false)
          setSession(restoredSession)
          setStatus(restoredSession === null ? "signed-out" : "authenticated")
        }
      })
      .catch(() => {
        if (active && !authEventSeen) {
          setPasswordRecoveryReady(false)
          setSession(null)
          setStatus("signed-out")
        }
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [port])

  const value = useMemo<AuthContextValue>(
    () => ({
      passwordRecoveryReady,
      session,
      status,
      async signIn(email, password) {
        const result = await port.signIn(email, password)
        if (result.ok && result.session !== null) {
          setPasswordRecoveryReady(false)
          setSession(result.session)
          setStatus("authenticated")
        }
        return result
      },
      async signUp(email, password) {
        const result = await port.signUp(email, password)
        if (result.ok && result.session !== null) {
          setPasswordRecoveryReady(false)
          setSession(result.session)
          setStatus("authenticated")
        }
        return result
      },
      async signOut() {
        const result = await port.signOut()
        if (result.ok) {
          setPasswordRecoveryReady(false)
          setSession(null)
          setStatus("signed-out")
        }
        return result
      },
      requestPasswordReset(email, redirectTo) {
        return port.requestPasswordReset(email, redirectTo)
      },
      async updatePassword(password) {
        const result = await port.updatePassword(password)
        if (result.ok) {
          setPasswordRecoveryReady(false)
        }
        return result
      }
    }),
    [passwordRecoveryReady, port, session, status]
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
