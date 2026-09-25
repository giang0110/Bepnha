import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "@/app/App"
import { AppErrorBoundary } from "@/app/app-error-boundary"
import { registerServiceWorker } from "@/app/pwa/service-worker-client"
import { createPlannerApi } from "@/features/plans/planner-api"
import "@/index.css"
import { createBrowserSupabaseClient } from "@/infrastructure/supabase/browser-client"
import { createSupabaseAuthSession } from "@/infrastructure/supabase/supabase-auth-session"
import { createDeferredHouseholdRepository } from "@/infrastructure/supabase/deferred-household-repository"
import { createSupabaseMealRatingRepository } from "@/infrastructure/supabase/supabase-meal-rating-repository"
import { createSupabasePantryFoodOptionsRepository } from "@/infrastructure/supabase/supabase-pantry-food-options-repository"
import { createSupabasePantryRepository } from "@/infrastructure/supabase/supabase-pantry-repository"
import { createSupabaseShoppingListRepository } from "@/infrastructure/supabase/supabase-shopping-list-repository"

// Before anything else that can fail. The offline shell is most valuable exactly when the app did
// not start — a missing environment variable, a bad client construction — and registering after
// bootstrap would mean the one visit that needed a cached copy is the one that never made it.
void registerServiceWorker(navigator)

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Root element was not found.")
}

const supabase = createBrowserSupabaseClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
})
const authSession = createSupabaseAuthSession(supabase)
const householdRepository = createDeferredHouseholdRepository(supabase)
const mealRatingRepository = createSupabaseMealRatingRepository(supabase)
const pantryFoodOptionsRepository = createSupabasePantryFoodOptionsRepository(supabase)
const pantryRepository = createSupabasePantryRepository(supabase)
const plannerApi = createPlannerApi()
const shoppingListRepository = createSupabaseShoppingListRepository(supabase)

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App
        authSession={authSession}
        householdRepository={householdRepository}
        mealRatingRepository={mealRatingRepository}
        pantryFoodOptionsRepository={pantryFoodOptionsRepository}
        pantryRepository={pantryRepository}
        plannerApi={plannerApi}
        shoppingListRepository={shoppingListRepository}
      />
    </AppErrorBoundary>
  </StrictMode>
)
