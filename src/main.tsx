import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "@/app/App"
import { createBrowserSupabaseClient } from "@/infrastructure/supabase/browser-client"
import { createSupabaseAuthSession } from "@/infrastructure/supabase/supabase-auth-session"
import "@/index.css"

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Root element was not found.")
}

const supabase = createBrowserSupabaseClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
})
const authSession = createSupabaseAuthSession(supabase)

createRoot(rootElement).render(
  <StrictMode>
    <App authSession={authSession} />
  </StrictMode>
)
