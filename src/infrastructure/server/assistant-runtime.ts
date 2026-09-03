import { GoogleGenAI } from "@google/genai"
import { createClient } from "@supabase/supabase-js"

import type { AssistantContextRepository } from "@/application/assistant/assistant-context-repository"
import type { AssistantRateLimiter } from "@/application/assistant/assistant-rate-limiter"
import type { MealAssistantPort } from "@/application/assistant/meal-assistant"
import { createGeminiMealAssistant } from "@/infrastructure/server/gemini-meal-assistant"
import { createInMemoryAssistantRateLimiter } from "@/infrastructure/server/in-memory-assistant-rate-limiter"
import { createSupabaseAssistantContextRepository } from "@/infrastructure/server/supabase-assistant-context-repository"
import { createSupabasePlannerInputLoader } from "@/infrastructure/server/supabase-planner-input-loader"
import type { Database } from "@/infrastructure/supabase/database.types"
import {
  createServerSupabaseAuthVerifier,
  type ServerAuthVerifier
} from "@/infrastructure/supabase/server-auth"

export interface AssistantRuntimeEnvironment {
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

interface RateLimitConfig {
  readonly burstLimit: number
  readonly burstWindowMs: number
  readonly dailyLimit: number
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

const defaultFactories: RuntimeFactories = {
  createAuth: createServerSupabaseAuthVerifier,
  createContext,
  createGeminiAssistant,
  createRateLimiter(config, environment) {
    if (environment.VERCEL_ENV === "production") return null
    return createInMemoryAssistantRateLimiter(config)
  }
}

export function createAssistantRuntimeDependencies(
  environment: AssistantRuntimeEnvironment = process.env,
  factories: RuntimeFactories = defaultFactories
) {
  const config = publicConfig(environment)
  const apiKey = environment.GEMINI_API_KEY?.trim()
  const model = environment.GEMINI_MODEL?.trim()
  const configured =
    apiKey !== undefined && apiKey !== "" && model !== undefined && model !== ""
  const rateLimiter = configured
    ? factories.createRateLimiter(rateLimitConfig(environment), environment)
    : null
  const assistant =
    configured && rateLimiter !== null
      ? factories.createGeminiAssistant(apiKey, model)
      : null

  return {
    auth: factories.createAuth(config),
    contextRepositoryFor(accessToken: string) {
      return factories.createContext({ ...config, accessToken })
    },
    assistant,
    rateLimiter
  }
}
