import { createClient } from "@supabase/supabase-js"

import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher"
import { createPlannerHttpHandlers } from "@/infrastructure/server/planner-http"
import { createSupabasePlannerInputLoader } from "@/infrastructure/server/supabase-planner-input-loader"
import { createSupabasePlannerRepository } from "@/infrastructure/server/supabase-planner-repository"
import {
  createUpstashRateLimiter,
  readUpstashRestConfig
} from "@/infrastructure/server/upstash-rate-limiter"
import type { Database } from "@/infrastructure/supabase/database.types"
import { createServerSupabaseAuthVerifier } from "@/infrastructure/supabase/server-auth"

function publicConfig() {
  const url = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || publishableKey === undefined)
    throw new Error("PLANNER_CONFIG_UNAVAILABLE")
  return { url, publishableKey }
}

export const PLANNER_RATE_LIMIT_NAMESPACE = "bepnha:planner"

export const PLANNER_RATE_LIMIT_CONFIG = {
  burstLimit: 10,
  burstWindowMs: 60_000,
  dailyLimit: 200
} as const

function plannerRateLimiter() {
  const rest = readUpstashRestConfig(process.env)
  if (rest === null) return undefined
  return createUpstashRateLimiter({
    namespace: PLANNER_RATE_LIMIT_NAMESPACE,
    config: PLANNER_RATE_LIMIT_CONFIG,
    rest,
    // Planner generation is already behind authentication and RLS ownership, so a Redis outage
    // should cost throttling, not the core feature.
    failureMode: "allow"
  })
}

const rateLimiter = plannerRateLimiter()

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
  hasher: new NodeContentHasher(),
  ...(rateLimiter === undefined ? {} : { rateLimiter })
})
