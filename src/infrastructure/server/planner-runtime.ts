import { createClient } from "@supabase/supabase-js"

import { NodeContentHasher } from "./node-content-hasher.js"
import { createPlannerHttpHandlers } from "./planner-http.js"
import {
  createSupabasePlannerInputLoader,
  createSupabasePlannerInputLoaderV2
} from "./supabase-planner-input-loader.js"
import {
  createSupabasePlannerRepository,
  createSupabasePlannerRepositoryV2,
  type PlannerRpcClient
} from "./supabase-planner-repository.js"
import { createUpstashRateLimiter, readUpstashRestConfig } from "./upstash-rate-limiter.js"
import type { Database } from "../supabase/database.types.js"
import { createServerSupabaseAuthVerifier } from "../supabase/server-auth.js"

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
  repositoryFor: (...args) => plannerPorts(...args).legacyRepository,
  versionedRepositoryFor: plannerPorts,
  hasher: new NodeContentHasher(),
  ...(rateLimiter === undefined ? {} : { rateLimiter })
})

function plannerPorts(_actorUserId: string, accessToken: string) {
  const { url, publishableKey } = publicConfig()
  const userClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  })
  const shared: { userClient: PlannerRpcClient; secretClientFactory: () => PlannerRpcClient } = {
    userClient: {
      rpc(name: string, args: Record<string, unknown>) {
        return userClient.rpc(name as keyof Database["public"]["Functions"], args as never) as never
      }
    },
    secretClientFactory() {
      const secretKey = process.env.SUPABASE_SECRET_KEY
      if (secretKey === undefined) throw new Error("PLANNER_WRITE_CONFIG_UNAVAILABLE")
      const serviceClient = createClient<Database>(url, secretKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
      })
      return {
        rpc(name: string, args: Record<string, unknown>) {
          return serviceClient.rpc(
            name as keyof Database["public"]["Functions"],
            args as never
          ) as never
        }
      }
    }
  }
  const legacyRepository = createSupabasePlannerRepository({
    ...shared,
    loader: createSupabasePlannerInputLoader(userClient)
  })
  const repository = createSupabasePlannerRepositoryV2({
    ...shared,
    legacyRepository,
    loader: createSupabasePlannerInputLoaderV2(userClient)
  })
  return { legacyRepository, repository }
}
