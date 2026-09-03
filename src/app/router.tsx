import { Navigate, Route, Routes } from "react-router"

import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"
import type { ShoppingListRepository } from "@/application/shopping/shopping-list-repository"
import { useAuth } from "@/app/auth/auth-context"
import { RequireAuth } from "@/app/auth/require-auth"
import { NotFoundPage } from "@/app/not-found-page"
import type { AssistantApi } from "@/features/assistant/assistant-api"
import { AssistantCard } from "@/features/assistant/assistant-card"
import { SignInPage } from "@/features/auth/sign-in-page"
import { SignUpPage } from "@/features/auth/sign-up-page"
import { HouseholdSummaryPage } from "@/features/household/household-summary-page"
import { OnboardingPage } from "@/features/household/onboarding/onboarding-page"
import { HouseholdSettingsPage } from "@/features/household/settings/household-settings-page"
import { PantryPage } from "@/features/pantry/pantry-page"
import type { PlannerApi } from "@/features/plans/planner-api"
import { WeeklyPlanPage } from "@/features/plans/weekly-plan-page"
import { ShoppingListPage } from "@/features/shopping/shopping-list-page"

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
        <Route path="/onboarding" element={<OnboardingPage repository={householdRepository} />} />
        <Route
          path="/household"
          element={<HouseholdSummaryPage repository={householdRepository} />}
        />
        <Route
          path="/settings/household"
          element={<HouseholdSettingsPage repository={householdRepository} />}
        />
        <Route
          path="/plan"
          element={
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
          }
        />
        <Route
          path="/pantry"
          element={
            <PantryPage
              foodOptionsRepository={pantryFoodOptionsRepository}
              householdRepository={householdRepository}
              pantryRepository={pantryRepository}
            />
          }
        />
        <Route
          path="/shopping/:planId"
          element={<ShoppingListPage repository={shoppingListRepository} />}
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
