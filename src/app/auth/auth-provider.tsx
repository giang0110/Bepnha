import { useEffect, useMemo, useState, type ReactNode } from "react"

import type { AuthSession, AuthSessionPort } from "@/application/auth/auth-session-port"
import { AuthContext, type AuthContextValue, type AuthStatus } from "@/app/auth/auth-context"

export function AuthProvider({
  children,
  port
}: Readonly<{ children: ReactNode; port: AuthSessionPort }>) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")

  useEffect(() => {
    let active = true
    const unsubscribe = port.onAuthStateChange((nextSession) => {
      if (active) {
        setSession(nextSession)
        setStatus(nextSession === null ? "signed-out" : "authenticated")
      }
    })

    void port
      .getSession()
      .then((restoredSession) => {
        if (active) {
          setSession(restoredSession)
          setStatus(restoredSession === null ? "signed-out" : "authenticated")
        }
      })
      .catch(() => {
        if (active) {
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
      session,
      status,
      async signIn(email, password) {
        const result = await port.signIn(email, password)
        if (result.ok && result.session !== null) {
          setSession(result.session)
          setStatus("authenticated")
        }
        return result
      },
      async signUp(email, password) {
        const result = await port.signUp(email, password)
        if (result.ok && result.session !== null) {
          setSession(result.session)
          setStatus("authenticated")
        }
        return result
      },
      async signOut() {
        const result = await port.signOut()
        if (result.ok) {
          setSession(null)
          setStatus("signed-out")
        }
        return result
      }
    }),
    [port, session, status]
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
