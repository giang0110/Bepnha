import { createClient } from "@supabase/supabase-js"

import { createShoppingReadHttpHandler } from "./shopping-http.js"
import type { Database } from "../supabase/database.types.js"
import { createServerSupabaseAuthVerifier } from "../supabase/server-auth.js"
import { createSupabaseShoppingListRepository } from "../supabase/supabase-shopping-list-repository.js"

function publicConfig() {
  const url = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || publishableKey === undefined) {
    throw new Error("SHOPPING_CONFIG_UNAVAILABLE")
  }
  return { url, publishableKey }
}

export const shoppingReadHttpHandler = createShoppingReadHttpHandler({
  auth: {
    verify(accessToken) {
      return createServerSupabaseAuthVerifier(publicConfig()).verify(accessToken)
    }
  },
  load(accessToken, planId, revisionId) {
    const { url, publishableKey } = publicConfig()
    const client = createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    })
    return createSupabaseShoppingListRepository(client).load(planId, revisionId)
  }
})
