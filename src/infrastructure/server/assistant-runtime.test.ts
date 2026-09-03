import { readFile } from "node:fs/promises"
import { describe, expect, test, vi } from "vitest"

import type { AssistantContextRepository } from "@/application/assistant/assistant-context-repository"
import type { MealAssistantPort } from "@/application/assistant/meal-assistant"
import type { ServerAuthVerifier } from "@/infrastructure/supabase/server-auth"

import { createAssistantRuntimeDependencies } from "./assistant-runtime"

const auth: ServerAuthVerifier = { verify: vi.fn() }
const context: AssistantContextRepository = { loadCurrent: vi.fn() }
const assistant: MealAssistantPort = { respond: vi.fn() }

describe("assistant runtime", () => {
  test("keeps Gemini optional without failing module setup", () => {
    const createGeminiAssistant = vi.fn(() => assistant)
    const dependencies = createAssistantRuntimeDependencies(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable"
      },
      {
        createAuth: () => auth,
        createContext: () => context,
        createGeminiAssistant
      }
    )

    expect(dependencies.assistant).toBeNull()
    expect(createGeminiAssistant).not.toHaveBeenCalled()
  })

  test("creates Gemini only from the two server-side configuration values", () => {
    const createGeminiAssistant = vi.fn(() => assistant)
    const dependencies = createAssistantRuntimeDependencies(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable",
        GEMINI_API_KEY: "server-key",
        GEMINI_MODEL: "gemini-model"
      },
      {
        createAuth: () => auth,
        createContext: () => context,
        createGeminiAssistant
      }
    )

    expect(dependencies.assistant).toBe(assistant)
    expect(createGeminiAssistant).toHaveBeenCalledOnce()
    expect(createGeminiAssistant).toHaveBeenCalledWith("server-key", "gemini-model")
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
        createGeminiAssistant: () => assistant
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
    expect(source).not.toMatch(/createSupabasePlannerRepository|persistRevision|persist_meal_plan_revision/u)
    expect(source).not.toMatch(/VITE_GEMINI/u)
  })
})
