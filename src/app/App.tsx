import { BrowserRouter } from "react-router"

import type { AuthSessionPort } from "@/application/auth/auth-session-port"
import type { HouseholdRepository } from "@/application/household/household-repository"
import { AuthProvider } from "@/app/auth/auth-provider"
import { AppRouter } from "@/app/router"

export function AppRoutes({
  householdRepository
}: Readonly<{ householdRepository: HouseholdRepository }>) {
  return <AppRouter householdRepository={householdRepository} />
}

export interface AppProps {
  authSession: AuthSessionPort
  householdRepository: HouseholdRepository
}

export default function App({ authSession, householdRepository }: AppProps) {
  return (
    <BrowserRouter>
      <AuthProvider port={authSession}>
        <AppRoutes householdRepository={householdRepository} />
      </AuthProvider>
    </BrowserRouter>
  )
}
