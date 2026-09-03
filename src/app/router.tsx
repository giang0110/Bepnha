import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router"

import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"
import type { ShoppingListRepository } from "@/application/shopping/shopping-list-repository"
import { useAuth } from "@/app/auth/auth-context"
import { RequireAuth } from "@/app/auth/require-auth"
import { NotFoundPage } from "@/app/not-found-page"
import type { AssistantApi } from "@/features/assistant/assistant-api"
import { SignInPage } from "@/features/auth/sign-in-page"
import { SignUpPage } from "@/features/auth/sign-up-page"
import type { PlannerApi } from "@/features/plans/planner-api"

const AssistantCard = lazy(async () => ({
  default: (await import("@/features/assistant/assistant-card")).AssistantCard
}))
const HouseholdSummaryPage = lazy(async () => ({
  default: (await import("@/features/household/household-summary-page")).HouseholdSummaryPage
}))
const OnboardingPage = lazy(async () => ({
  default: (await import("@/features/household/onboarding/onboarding-page")).OnboardingPage
}))
const HouseholdSettingsPage = lazy(async () => ({
  default: (await import("@/features/household/settings/household-settings-page"))
    .HouseholdSettingsPage
}))
const PantryPage = lazy(async () => ({
  default: (await import("@/features/pantry/pantry-page")).PantryPage
}))
const WeeklyPlanPage = lazy(async () => ({
  default: (await import("@/features/plans/weekly-plan-page")).WeeklyPlanPage
}))
const ShoppingListPage = lazy(async () => ({
  default: (await import("@/features/shopping/shopping-list-page")).ShoppingListPage
}))

function ProtectedRouteFallback() {
  return <p role="status">Đang tải…</p>
}

function HomeRedirect() {
  const auth = useAuth()
  if (auth.status === "loading") {
    return <p role="status">Đang kiểm tra phiên đăng nhập…</p>
  }
  return <Navigate replace to={auth.status === "authenticated" ? "/household" : "/sign-in"} />
}

export function AppRouter({
  assistantApi,
  householdRepository,
  pantryFoodOptionsRepository,
  pantryRepository,
  plannerApi,
  shoppingListRepository
}: Readonly<{
  assistantApi: AssistantApi
  householdRepository: HouseholdRepository
  pantryFoodOptionsRepository: PantryFoodOptionsRepository
  pantryRepository: PantryRepository
  plannerApi: PlannerApi
  shoppingListRepository: ShoppingListRepository
}>) {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route element={<RequireAuth />}>
        <Route
          path="/onboarding"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <OnboardingPage repository={householdRepository} />
            </Suspense>
          }
        />
        <Route
          path="/household"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <HouseholdSummaryPage repository={householdRepository} />
            </Suspense>
          }
        />
        <Route
          path="/settings/household"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <HouseholdSettingsPage repository={householdRepository} />
            </Suspense>
          }
        />
        <Route
          path="/plan"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <WeeklyPlanPage
                householdRepository={householdRepository}
                plannerApi={plannerApi}
                renderAssistant={({ accessToken, expectedRevisionId, onPreviewDay, planId }) => (
                  <AssistantCard
                    accessToken={accessToken}
                    assistantApi={assistantApi}
                    expectedRevisionId={expectedRevisionId}
                    planId={planId}
                    onPreviewDay={onPreviewDay}
                  />
                )}
              />
            </Suspense>
          }
        />
        <Route
          path="/pantry"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <PantryPage
                foodOptionsRepository={pantryFoodOptionsRepository}
                householdRepository={householdRepository}
                pantryRepository={pantryRepository}
              />
            </Suspense>
          }
        />
        <Route
          path="/shopping/:planId"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <ShoppingListPage repository={shoppingListRepository} />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
