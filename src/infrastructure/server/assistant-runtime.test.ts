import { readFile } from "node:fs/promises"
import { describe, expect, test, vi } from "vitest"

import type { AssistantContextRepository } from "@/application/assistant/assistant-context-repository"
import type { AssistantRateLimiter } from "@/application/assistant/assistant-rate-limiter"
import type { MealAssistantPort } from "@/application/assistant/meal-assistant"
import type { ServerAuthVerifier } from "@/infrastructure/supabase/server-auth"

import { createAssistantRuntimeDependencies } from "./assistant-runtime"

const auth: ServerAuthVerifier = { verify: vi.fn() }
const context: AssistantContextRepository = { loadCurrent: vi.fn() }
const assistant: MealAssistantPort = { respond: vi.fn() }
const limiter: AssistantRateLimiter = {
  consume: vi.fn(() => Promise.resolve({ allowed: true as const }))
}

describe("assistant runtime", () => {
  test("keeps Gemini optional without creating rate-limit state", () => {
    const createGeminiAssistant = vi.fn(() => assistant)
    const createRateLimiter = vi.fn(() => limiter)
    const dependencies = createAssistantRuntimeDependencies(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable"
      },
      {
        createAuth: () => auth,
        createContext: () => context,
        createGeminiAssistant,
        createRateLimiter
      }
    )

    expect(dependencies.assistant).toBeNull()
    expect(dependencies.rateLimiter).toBeNull()
    expect(createRateLimiter).not.toHaveBeenCalled()
    expect(createGeminiAssistant).not.toHaveBeenCalled()
  })

  test("creates configured Gemini behind the default limiter policy", () => {
    const createGeminiAssistant = vi.fn(() => assistant)
    const createRateLimiter = vi.fn(() => limiter)
    const environment = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable",
      GEMINI_API_KEY: "server-key",
      GEMINI_MODEL: "gemini-model"
    }
    const dependencies = createAssistantRuntimeDependencies(environment, {
      createAuth: () => auth,
      createContext: () => context,
      createGeminiAssistant,
      createRateLimiter
    })

    expect(dependencies.assistant).toBe(assistant)
    expect(dependencies.rateLimiter).toBe(limiter)
    expect(createRateLimiter).toHaveBeenCalledWith(
      { burstLimit: 5, burstWindowMs: 60_000, dailyLimit: 50 },
      environment
    )
    expect(createGeminiAssistant).toHaveBeenCalledWith("server-key", "gemini-model")
  })

  test("validates overrides and falls back for unsafe values", () => {
    const createRateLimiter = vi.fn(() => limiter)
    createAssistantRuntimeDependencies(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable",
        GEMINI_API_KEY: "server-key",
        GEMINI_MODEL: "gemini-model",
        ASSISTANT_RATE_LIMIT_BURST: "12",
        ASSISTANT_RATE_LIMIT_DAILY: "200"
      },
      {
        createAuth: () => auth,
        createContext: () => context,
        createGeminiAssistant: () => assistant,
        createRateLimiter
      }
    )
    expect(createRateLimiter).toHaveBeenCalledWith(
      { burstLimit: 12, burstWindowMs: 60_000, dailyLimit: 200 },
      expect.any(Object)
    )

    createRateLimiter.mockClear()
    createAssistantRuntimeDependencies(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable",
        GEMINI_API_KEY: "server-key",
        GEMINI_MODEL: "gemini-model",
        ASSISTANT_RATE_LIMIT_BURST: "0",
        ASSISTANT_RATE_LIMIT_DAILY: "9999"
      },
      {
        createAuth: () => auth,
        createContext: () => context,
        createGeminiAssistant: () => assistant,
        createRateLimiter
      }
    )
    expect(createRateLimiter).toHaveBeenCalledWith(
      { burstLimit: 5, burstWindowMs: 60_000, dailyLimit: 50 },
      expect.any(Object)
    )
  })

  test("keeps production Gemini disabled without a shared limiter", () => {
    const createGeminiAssistant = vi.fn(() => assistant)
    const dependencies = createAssistantRuntimeDependencies(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable",
        GEMINI_API_KEY: "server-key",
        GEMINI_MODEL: "gemini-model",
        VERCEL_ENV: "production"
      },
      {
        createAuth: () => auth,
        createContext: () => context,
        createGeminiAssistant,
        createRateLimiter: () => null
      }
    )

    expect(dependencies.assistant).toBeNull()
    expect(dependencies.rateLimiter).toBeNull()
    expect(createGeminiAssistant).not.toHaveBeenCalled()
  })

  test("builds owner context from each request access token", () => {
    const createContext = vi.fn(() => context)
    const dependencies = createAssistantRuntimeDependencies(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable"
      },
      {
        createAuth: () => auth,
        createContext,
        createGeminiAssistant: () => assistant,
        createRateLimiter: () => limiter
      }
    )

    expect(dependencies.contextRepositoryFor("token-a")).toBe(context)
    expect(dependencies.contextRepositoryFor("token-b")).toBe(context)
    expect(createContext).toHaveBeenNthCalledWith(1, {
      url: "https://example.supabase.co",
      publishableKey: "publishable",
      accessToken: "token-a"
    })
    expect(createContext).toHaveBeenNthCalledWith(2, {
      url: "https://example.supabase.co",
      publishableKey: "publishable",
      accessToken: "token-b"
    })
  })

  test("contains no secret-client or persistence path", async () => {
    const source = await readFile("src/infrastructure/server/assistant-runtime.ts", "utf8")

    expect(source).not.toMatch(/SUPABASE_SECRET_KEY|service[_-]?role/iu)
    expect(source).not.toMatch(
      /createSupabasePlannerRepository|persistRevision|persist_meal_plan_revision/u
    )
    expect(source).not.toMatch(/VITE_GEMINI/u)
  })
})
