import type { ReactNode } from "react"

interface AppPageShellProps {
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Provides the single `main` landmark that the skip link targets. The skip link itself lives in
 * `RequireAuth`, which renders it before the primary navigation so one Tab still reaches it.
 */
export function AppPageShell({ children, className = "" }: AppPageShellProps) {
  const mainClassName = ["min-w-0", className].filter(Boolean).join(" ")

  return (
    <main className={mainClassName} id="main-content" tabIndex={-1}>
      {children}
    </main>
  )
}
