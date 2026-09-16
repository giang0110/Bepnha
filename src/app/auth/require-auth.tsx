import { Navigate, Outlet, useLocation } from "react-router"

import { AppNav } from "@/app/components/app-nav"
import { AppSkipLink } from "@/app/components/app-skip-link"
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
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }
  return (
    <>
      {/* Order matters: the skip link must precede the navigation so the first Tab reaches it. */}
      <AppSkipLink />
      <AppNav />
      <Outlet />
      <div className="mx-auto w-full max-w-md px-4 pb-6">
        <SignOutButton />
      </div>
    </>
  )
}
