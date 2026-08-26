import { BrowserRouter } from "react-router"

import type { AuthSessionPort } from "@/application/auth/auth-session-port"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { AuthProvider } from "@/app/auth/auth-provider"
import { AppRouter } from "@/app/router"
import { createPlannerApi, type PlannerApi } from "@/features/plans/planner-api"

export function AppRoutes({
  householdRepository,
  plannerApi = createPlannerApi()
}: Readonly<{ householdRepository: HouseholdRepository; plannerApi?: PlannerApi }>) {
  return <AppRouter householdRepository={householdRepository} plannerApi={plannerApi} />
}

export interface AppProps {
  authSession: AuthSessionPort
  householdRepository: HouseholdRepository
  plannerApi: PlannerApi
}

export default function App({ authSession, householdRepository, plannerApi }: AppProps) {
  return (
    <BrowserRouter>
      <AuthProvider port={authSession}>
        <AppRoutes householdRepository={householdRepository} plannerApi={plannerApi} />
      </AuthProvider>
    </BrowserRouter>
  )
}
