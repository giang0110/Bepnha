import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "@/app/App"
import { createPlannerApi } from "@/features/plans/planner-api"
import "@/index.css"
import { createBrowserSupabaseClient } from "@/infrastructure/supabase/browser-client"
import { createSupabaseAuthSession } from "@/infrastructure/supabase/supabase-auth-session"
import { createSupabaseHouseholdRepository } from "@/infrastructure/supabase/supabase-household-repository"
import { createSupabasePantryFoodOptionsRepository } from "@/infrastructure/supabase/supabase-pantry-food-options-repository"
import { createSupabasePantryRepository } from "@/infrastructure/supabase/supabase-pantry-repository"
import { createSupabaseShoppingListRepository } from "@/infrastructure/supabase/supabase-shopping-list-repository"

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Root element was not found.")
}

const supabase = createBrowserSupabaseClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
})
const authSession = createSupabaseAuthSession(supabase)
const householdRepository = createSupabaseHouseholdRepository(supabase)
const pantryFoodOptionsRepository = createSupabasePantryFoodOptionsRepository(supabase)
const pantryRepository = createSupabasePantryRepository(supabase)
const plannerApi = createPlannerApi()
const shoppingListRepository = createSupabaseShoppingListRepository(supabase)

createRoot(rootElement).render(
  <StrictMode>
    <App
      authSession={authSession}
      householdRepository={householdRepository}
      pantryFoodOptionsRepository={pantryFoodOptionsRepository}
      pantryRepository={pantryRepository}
      plannerApi={plannerApi}
      shoppingListRepository={shoppingListRepository}
    />
  </StrictMode>
)
