import { GoogleGenAI } from "@google/genai"
import { createClient } from "@supabase/supabase-js"

import type { AssistantContextRepository } from "@/application/assistant/assistant-context-repository"
import type { MealAssistantPort } from "@/application/assistant/meal-assistant"
import { createGeminiMealAssistant } from "@/infrastructure/server/gemini-meal-assistant"
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
}

function publicConfig(environment: AssistantRuntimeEnvironment): PublicConfig {
  const url = environment.SUPABASE_URL
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY
  if (url === undefined || publishableKey === undefined) {
    throw new Error("ASSISTANT_CONFIG_UNAVAILABLE")
  }
  return { url, publishableKey }
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
  createGeminiAssistant
}

export function createAssistantRuntimeDependencies(
  environment: AssistantRuntimeEnvironment = process.env,
  factories: RuntimeFactories = defaultFactories
) {
  const config = publicConfig(environment)
  const apiKey = environment.GEMINI_API_KEY?.trim()
  const model = environment.GEMINI_MODEL?.trim()
  return {
    auth: factories.createAuth(config),
    contextRepositoryFor(accessToken: string) {
      return factories.createContext({ ...config, accessToken })
    },
    assistant:
      apiKey === undefined || apiKey === "" || model === undefined || model === ""
        ? null
        : factories.createGeminiAssistant(apiKey, model)
  }
}
