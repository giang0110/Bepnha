import { Navigate, Route, Routes } from "react-router"

import type { HouseholdRepository } from "@/application/household/household-repository"
import { useAuth } from "@/app/auth/auth-context"
import { RequireAuth } from "@/app/auth/require-auth"
import { NotFoundPage } from "@/app/not-found-page"
import { SignInPage } from "@/features/auth/sign-in-page"
import { SignOutButton } from "@/features/auth/sign-out-button"
import { SignUpPage } from "@/features/auth/sign-up-page"
import { OnboardingPage } from "@/features/household/onboarding/onboarding-page"
import { HouseholdSummaryPage } from "@/features/household/household-summary-page"

function HomeRedirect() {
  const auth = useAuth()
  if (auth.status === "loading") {
    return <p role="status">Đang kiểm tra phiên đăng nhập…</p>
  }
  return <Navigate replace to={auth.status === "authenticated" ? "/onboarding" : "/sign-in"} />
}

function ProtectedPlaceholder({ heading }: Readonly<{ heading: string }>) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p>Nội dung thiết lập sẽ được hoàn thiện trong các tác vụ tiếp theo của Giai đoạn 1.</p>
      <SignOutButton />
    </main>
  )
}

export function AppRouter({
  householdRepository
}: Readonly<{ householdRepository: HouseholdRepository }>) {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage repository={householdRepository} />} />
        <Route
          path="/household"
          element={<HouseholdSummaryPage repository={householdRepository} />}
        />
        <Route
          path="/settings/household"
          element={<ProtectedPlaceholder heading="Cài đặt gia đình" />}
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
