import { BrowserRouter } from "react-router"

import type { AuthSessionPort } from "@/application/auth/auth-session-port"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { ShoppingListRepository } from "@/application/shopping/shopping-list-repository"
import { AuthProvider } from "@/app/auth/auth-provider"
import { AppRouter } from "@/app/router"
import { createPlannerApi, type PlannerApi } from "@/features/plans/planner-api"

export function AppRoutes({
  householdRepository,
  plannerApi = createPlannerApi(),
  shoppingListRepository
}: Readonly<{
  householdRepository: HouseholdRepository
  plannerApi?: PlannerApi
  shoppingListRepository: ShoppingListRepository
}>) {
  return (
    <AppRouter
      householdRepository={householdRepository}
      plannerApi={plannerApi}
      shoppingListRepository={shoppingListRepository}
    />
  )
}

export interface AppProps {
  authSession: AuthSessionPort
  householdRepository: HouseholdRepository
  plannerApi: PlannerApi
  shoppingListRepository: ShoppingListRepository
}

export default function App({
  authSession,
  householdRepository,
  plannerApi,
  shoppingListRepository
}: AppProps) {
  return (
    <BrowserRouter>
      <AuthProvider port={authSession}>
        <AppRoutes
          householdRepository={householdRepository}
          plannerApi={plannerApi}
          shoppingListRepository={shoppingListRepository}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
