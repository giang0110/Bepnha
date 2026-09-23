import { Navigate, Outlet, useLocation } from "react-router"

import { AppNav } from "@/app/components/app-nav"
import { AppSkipLink } from "@/app/components/app-skip-link"
import { OfflineBanner } from "@/app/components/offline-banner"
import { SignOutButton } from "@/features/auth/sign-out-button"

import { useAuth } from "./auth-context"

export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-8">
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      </main>
    )
  }
  if (auth.status === "signed-out") {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/sign-in" replace state={{ from }} />
  }
  return (
    <>
      {/* Order matters: the skip link must precede the navigation so the first Tab reaches it. */}
      <AppSkipLink />
      <OfflineBanner />
      <div className="min-h-screen bg-paper-sunken text-ink lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <AppNav />
        <div className="min-w-0 pb-24 lg:pb-0">
          <Outlet />
          <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
            <div className="border-t border-edge pt-5">
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
