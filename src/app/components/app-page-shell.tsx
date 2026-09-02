import type { ReactNode } from "react"

interface AppPageShellProps {
  readonly children: ReactNode
  readonly className?: string
}

export function AppPageShell({ children, className = "" }: AppPageShellProps) {
  const mainClassName = ["min-w-0", className].filter(Boolean).join(" ")

  return (
    <>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-950 focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        href="#main-content"
      >
        Bỏ qua đến nội dung chính
      </a>
      <main className={mainClassName} id="main-content">
        {children}
      </main>
    </>
  )
}
