import { createClient } from "@supabase/supabase-js"

import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher"
import { createPlannerHttpHandlers } from "@/infrastructure/server/planner-http"
import { createSupabasePlannerInputLoader } from "@/infrastructure/server/supabase-planner-input-loader"
import { createSupabasePlannerRepository } from "@/infrastructure/server/supabase-planner-repository"
import type { Database } from "@/infrastructure/supabase/database.types"
import { createServerSupabaseAuthVerifier } from "@/infrastructure/supabase/server-auth"

function publicConfig() {
  const url = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || publishableKey === undefined)
    throw new Error("PLANNER_CONFIG_UNAVAILABLE")
  return { url, publishableKey }
}

export const plannerHttpHandlers = createPlannerHttpHandlers({
  auth: {
    verify(accessToken) {
      return createServerSupabaseAuthVerifier(publicConfig()).verify(accessToken)
    }
  },
  repositoryFor(_actorUserId, accessToken) {
    const { url, publishableKey } = publicConfig()
    const userClient = createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    })
    return createSupabasePlannerRepository({
      userClient: {
        rpc(name, args) {
          return userClient.rpc(
            name as keyof Database["public"]["Functions"],
            args as never
          ) as never
        }
      },
      loader: createSupabasePlannerInputLoader(userClient),
      secretClientFactory() {
        const secretKey = process.env.SUPABASE_SECRET_KEY
        if (secretKey === undefined) throw new Error("PLANNER_WRITE_CONFIG_UNAVAILABLE")
        const serviceClient = createClient<Database>(url, secretKey, {
          auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
        })
        return {
          rpc(name, args) {
            return serviceClient.rpc(
              name as keyof Database["public"]["Functions"],
              args as never
            ) as never
          }
        }
      }
    })
  },
  hasher: new NodeContentHasher()
})
