import { GoogleGenAI } from "@google/genai"
import { createClient } from "@supabase/supabase-js"

import type { AssistantContextRepository } from "../../application/assistant/assistant-context-repository.js"
import type { AssistantRateLimiter } from "../../application/assistant/assistant-rate-limiter.js"
import type { MealAssistantPort } from "../../application/assistant/meal-assistant.js"
import type { RateLimitConfig } from "../../application/shared/rate-limiter.js"
import { createGeminiMealAssistant } from "./gemini-meal-assistant.js"
import { createInMemoryAssistantRateLimiter } from "./in-memory-assistant-rate-limiter.js"
import {
  createUpstashRateLimiter,
  readUpstashRestConfig,
  type UpstashEnvironment
} from "./upstash-rate-limiter.js"
import { createSupabaseAssistantContextRepository } from "./supabase-assistant-context-repository.js"
import { createSupabasePlannerInputLoader } from "./supabase-planner-input-loader.js"
import type { Database } from "../supabase/database.types.js"
import {
  createServerSupabaseAuthVerifier,
  type ServerAuthVerifier
} from "../supabase/server-auth.js"

export const ASSISTANT_RATE_LIMIT_NAMESPACE = "bepnha:assistant"

export interface AssistantRuntimeEnvironment extends UpstashEnvironment {
  readonly SUPABASE_URL?: string
  readonly SUPABASE_PUBLISHABLE_KEY?: string
  readonly GEMINI_API_KEY?: string
  readonly GEMINI_MODEL?: string
  readonly VERCEL_ENV?: string
  readonly ASSISTANT_RATE_LIMIT_BURST?: string
  readonly ASSISTANT_RATE_LIMIT_DAILY?: string
}

interface PublicConfig {
  readonly url: string
  readonly publishableKey: string
}

interface RuntimeFactories {
  readonly createAuth: (config: PublicConfig) => ServerAuthVerifier
  readonly createContext: (
    config: PublicConfig & { readonly accessToken: string }
  ) => AssistantContextRepository
  readonly createGeminiAssistant: (apiKey: string, model: string) => MealAssistantPort
  readonly createRateLimiter: (
    config: RateLimitConfig,
    environment: AssistantRuntimeEnvironment
  ) => AssistantRateLimiter | null
}

function publicConfig(environment: AssistantRuntimeEnvironment): PublicConfig {
  const url = environment.SUPABASE_URL
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || publishableKey === undefined) {
    throw new Error("ASSISTANT_CONFIG_UNAVAILABLE")
  }
  return { url, publishableKey }
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || !/^\d+$/u.test(value.trim())) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return fallback
  }
  return parsed
}

function rateLimitConfig(environment: AssistantRuntimeEnvironment): RateLimitConfig {
  return {
    burstLimit: boundedInteger(environment.ASSISTANT_RATE_LIMIT_BURST, 5, 1, 30),
    burstWindowMs: 60_000,
    dailyLimit: boundedInteger(environment.ASSISTANT_RATE_LIMIT_DAILY, 50, 1, 500)
  }
}

function createContext(
  config: PublicConfig & { readonly accessToken: string }
): AssistantContextRepository {
  const userClient = createClient<Database>(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${config.accessToken}` } }
  })
  return createSupabaseAssistantContextRepository({
    userClient: {
      rpc(name, args) {
        return userClient.rpc(name as keyof Database["public"]["Functions"], args as never) as never
      }
    },
    loader: createSupabasePlannerInputLoader(userClient)
  })
}

function createGeminiAssistant(apiKey: string, model: string): MealAssistantPort {
  const client = new GoogleGenAI({ apiKey })
  return createGeminiMealAssistant({
    model,
    async createInteraction(request) {
      const interaction = await client.interactions.create(request)
      return {
        status: interaction.status,
        ...(typeof interaction.output_text === "string"
          ? { output_text: interaction.output_text }
          : {})
      }
    }
  })
}

/**
 * Production may only run Gemini behind a limiter that is shared across instances. Upstash provides
 * that; the per-instance in-memory limiter stays available for local and preview runtimes only.
 */
export function createDefaultAssistantRateLimiter(
  config: RateLimitConfig,
  environment: AssistantRuntimeEnvironment
): AssistantRateLimiter | null {
  const rest = readUpstashRestConfig(environment)
  if (rest !== null) {
    return createUpstashRateLimiter({
      namespace: ASSISTANT_RATE_LIMIT_NAMESPACE,
      config,
      rest,
      failureMode: "deny"
    })
  }
  if (environment.VERCEL_ENV === "production") return null
  return createInMemoryAssistantRateLimiter(config)
}

const defaultFactories: RuntimeFactories = {
  createAuth: createServerSupabaseAuthVerifier,
  createContext,
  createGeminiAssistant,
  createRateLimiter: createDefaultAssistantRateLimiter
}

export function createAssistantRuntimeDependencies(
  environment: AssistantRuntimeEnvironment = process.env,
  factories: RuntimeFactories = defaultFactories
) {
  const config = publicConfig(environment)
  const apiKey = environment.GEMINI_API_KEY?.trim()
  const model = environment.GEMINI_MODEL?.trim()
  const configured = apiKey !== undefined && apiKey !== "" && model !== undefined && model !== ""
  const rateLimiter = configured
    ? factories.createRateLimiter(rateLimitConfig(environment), environment)
    : null
  const assistant =
    configured && rateLimiter !== null ? factories.createGeminiAssistant(apiKey, model) : null

  return {
    auth: factories.createAuth(config),
    contextRepositoryFor(accessToken: string) {
      return factories.createContext({ ...config, accessToken })
    },
    assistant,
    rateLimiter
  }
}
