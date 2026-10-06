import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router"

import type { MealRatingRepository } from "@/application/meal-rating/meal-rating-repository"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"
import type { VersionedShoppingListRepository as ShoppingListRepository } from "@/application/shopping/shopping-list-repository"
import { useAuth } from "@/app/auth/auth-context"
import { useDocumentTitle } from "@/app/use-document-title"
import { RequireAuth } from "@/app/auth/require-auth"
import { NotFoundPage } from "@/app/not-found-page"
import type { AccountApi } from "@/application/account/account-deletion"
import { AppPageShell } from "@/app/components/app-page-shell"
import type { AssistantApi } from "@/features/assistant/assistant-api"
import type { PlannerApi } from "@/features/plans/planner-api"

const ForgotPasswordPage = lazy(async () => ({
  default: (await import("@/features/auth/forgot-password-page")).ForgotPasswordPage
}))
const ResetPasswordPage = lazy(async () => ({
  default: (await import("@/features/auth/reset-password-page")).ResetPasswordPage
}))
const SignInPage = lazy(async () => ({
  default: (await import("@/features/auth/sign-in-page")).SignInPage
}))
const SignUpPage = lazy(async () => ({
  default: (await import("@/features/auth/sign-up-page")).SignUpPage
}))
const PrivacyPage = lazy(async () => ({
  default: (await import("@/features/legal/legal-page")).PrivacyPage
}))
const TermsPage = lazy(async () => ({
  default: (await import("@/features/legal/legal-page")).TermsPage
}))

const AccountSettingsPage = lazy(async () => ({
  default: (await import("@/features/account/account-settings-page")).AccountSettingsPage
}))
const AssistantCard = lazy(async () => ({
  default: (await import("@/features/assistant/assistant-card")).AssistantCard
}))
const SettingsPage = lazy(async () => ({
  default: (await import("@/features/settings/settings-page")).SettingsPage
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
const CookingPage = lazy(async () => ({
  default: (await import("@/features/plans/cooking-page")).CookingPage
}))
const WeeklyPlanPage = lazy(async () => ({
  default: (await import("@/features/plans/weekly-plan-page")).WeeklyPlanPage
}))
const ShoppingEntryPage = lazy(async () => ({
  default: (await import("@/features/plans/shopping-entry-page")).ShoppingEntryPage
}))
const ShoppingListPage = lazy(async () => ({
  default: (await import("@/features/shopping/shopping-list-page")).ShoppingListPage
}))

function ProtectedRouteFallback() {
  return (
    <AppPageShell className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6">
      <p role="status">Đang tải…</p>
    </AppPageShell>
  )
}

function HomeRedirect() {
  const auth = useAuth()
  if (auth.status === "loading") {
    return <p role="status">Đang kiểm tra phiên đăng nhập…</p>
  }
  return <Navigate replace to={auth.status === "authenticated" ? "/plan" : "/sign-in"} />
}

export function AppRouter({
  accountApi,
  assistantApi,
  householdRepository,
  mealRatingRepository,
  pantryFoodOptionsRepository,
  pantryRepository,
  plannerApi,
  shoppingListRepository
}: Readonly<{
  accountApi: AccountApi
  assistantApi: AssistantApi
  householdRepository: HouseholdRepository
  mealRatingRepository?: MealRatingRepository
  pantryFoodOptionsRepository: PantryFoodOptionsRepository
  pantryRepository: PantryRepository
  plannerApi: PlannerApi
  shoppingListRepository: ShoppingListRepository
}>) {
  useDocumentTitle()

  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="/sign-in"
        element={
          <Suspense fallback={<ProtectedRouteFallback />}>
            <SignInPage />
          </Suspense>
        }
      />
      <Route
        path="/sign-up"
        element={
          <Suspense fallback={<ProtectedRouteFallback />}>
            <SignUpPage />
          </Suspense>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <Suspense fallback={<ProtectedRouteFallback />}>
            <ForgotPasswordPage />
          </Suspense>
        }
      />
      {/* Outside RequireAuth: an expired link leaves no session, and this page explains that
          instead of bouncing the user to sign-in with no idea what went wrong. */}
      <Route
        path="/reset-password"
        element={
          <Suspense fallback={<ProtectedRouteFallback />}>
            <ResetPasswordPage />
          </Suspense>
        }
      />
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
          path="/settings"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <SettingsPage />
            </Suspense>
          }
        />
        <Route
          path="/settings/account"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <AccountSettingsPage accountApi={accountApi} />
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
                foodOptionsRepository={pantryFoodOptionsRepository}
                householdRepository={householdRepository}
                {...(mealRatingRepository === undefined ? {} : { mealRatingRepository })}
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
        {/* Its own route rather than a mode of the plan page: a cook reaches this with wet hands
            and a locked phone, so it has to survive a reload and be reachable from a bookmark. */}
        <Route
          path="/plan/:dayIndex/cook"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <CookingPage
                foodOptionsRepository={pantryFoodOptionsRepository}
                householdRepository={householdRepository}
                {...(mealRatingRepository === undefined ? {} : { mealRatingRepository })}
                pantryRepository={pantryRepository}
                plannerApi={plannerApi}
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
          path="/shopping"
          element={
            <Suspense fallback={<ProtectedRouteFallback />}>
              <ShoppingEntryPage
                householdRepository={householdRepository}
                plannerApi={plannerApi}
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
      <Route
        path="/privacy"
        element={
          <Suspense fallback={<ProtectedRouteFallback />}>
            <PrivacyPage />
          </Suspense>
        }
      />
      <Route
        path="/terms"
        element={
          <Suspense fallback={<ProtectedRouteFallback />}>
            <TermsPage />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
