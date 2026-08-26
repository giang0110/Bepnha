import { BrowserRouter } from "react-router"

import type { AuthSessionPort } from "@/application/auth/auth-session-port"
import { AuthProvider } from "@/app/auth/auth-provider"
import { AppRouter } from "@/app/router"

export function AppRoutes() {
  return <AppRouter />
}

export interface AppProps {
  authSession: AuthSessionPort
}

export default function App({ authSession }: AppProps) {
  return (
    <BrowserRouter>
      <AuthProvider port={authSession}>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
