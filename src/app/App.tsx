import { BrowserRouter } from "react-router"

import type { AuthSessionPort } from "@/application/auth/auth-session-port"
import type { HouseholdRepository } from "@/application/household/household-repository"
import type { PantryFoodOptionsRepository } from "@/application/pantry/pantry-food-options-repository"
import type { PantryRepository } from "@/application/pantry/pantry-repository"
import type { ShoppingListRepository } from "@/application/shopping/shopping-list-repository"
import { AuthProvider } from "@/app/auth/auth-provider"
import { AppRouter } from "@/app/router"
import { createAssistantApi, type AssistantApi } from "@/features/assistant/assistant-api"
import { createPlannerApi, type PlannerApi } from "@/features/plans/planner-api"

export function AppRoutes({
  assistantApi = createAssistantApi(),
  householdRepository,
  pantryFoodOptionsRepository,
  pantryRepository,
  plannerApi = createPlannerApi(),
  shoppingListRepository
}: Readonly<{
  assistantApi?: AssistantApi
  householdRepository: HouseholdRepository
  pantryFoodOptionsRepository: PantryFoodOptionsRepository
  pantryRepository: PantryRepository
  plannerApi?: PlannerApi
  shoppingListRepository: ShoppingListRepository
}>) {
  return (
    <AppRouter
      assistantApi={assistantApi}
      householdRepository={householdRepository}
      pantryFoodOptionsRepository={pantryFoodOptionsRepository}
      pantryRepository={pantryRepository}
      plannerApi={plannerApi}
      shoppingListRepository={shoppingListRepository}
    />
  )
}

export interface AppProps {
  authSession: AuthSessionPort
  householdRepository: HouseholdRepository
  pantryFoodOptionsRepository: PantryFoodOptionsRepository
  pantryRepository: PantryRepository
  plannerApi: PlannerApi
  shoppingListRepository: ShoppingListRepository
}

export default function App({
  authSession,
  householdRepository,
  pantryFoodOptionsRepository,
  pantryRepository,
  plannerApi,
  shoppingListRepository
}: AppProps) {
  return (
    <BrowserRouter>
      <AuthProvider port={authSession}>
        <AppRoutes
          householdRepository={householdRepository}
          pantryFoodOptionsRepository={pantryFoodOptionsRepository}
          pantryRepository={pantryRepository}
          plannerApi={plannerApi}
          shoppingListRepository={shoppingListRepository}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
