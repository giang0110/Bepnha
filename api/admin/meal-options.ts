import { createClient } from "@supabase/supabase-js"
import type { VercelRequest, VercelResponse } from "@vercel/node"

import {
  executeMealOptionAdminCommand,
  type MealOptionAdminCommand,
  type MealOptionAdminRepository
} from "@/application/meal-option/execute-meal-option-admin-command"
import type { ContentHasher } from "@/application/shared/content-hasher"
import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher"
import { createSupabaseMealOptionAdminRepository } from "@/infrastructure/server/supabase-meal-option-admin-repository"
import type { Database } from "@/infrastructure/supabase/database.types"
import {
  createServerSupabaseAdminAuthVerifier,
  type ServerAdminAuthVerifier
} from "@/infrastructure/supabase/server-admin-auth"
import { parseBearerToken } from "@/infrastructure/supabase/server-auth"

interface MealOptionAdminHandlerDependencies {
  readonly auth: ServerAdminAuthVerifier
  readonly repositoryFor: (actorUserId: string) => MealOptionAdminRepository
  readonly hasher: ContentHasher
}

type UnknownRecord = Record<string, unknown>

const inputKeys = {
  create_meal_option: ["code", "nameVi"],
  save_meal_option_version_draft: [
    "mealOptionVersionId",
    "mealOptionId",
    "expectedRevision",
    "versionNumber",
    "yieldAdultEquivalent",
    "activeMinutes",
    "elapsedMinutes",
    "components",
    "tagIds"
  ],
  publish_meal_option: ["mealOptionVersionId", "expectedRevision"],
  retire_meal_option: ["mealOptionId", "expectedRevision"]
} as const

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function protectedField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(protectedField)
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:contentHash|publicationStatus|createdBy|actor|audit|current.*Id|retiredAt|publishedAt|serviceRole)/iu.test(
        key
      ) || protectedField(child)
  )
}

function command(value: unknown): MealOptionAdminCommand | null {
  if (!isRecord(value) || !exactKeys(value, ["action", "input"]) || protectedField(value))
    return null
  if (
    typeof value.action !== "string" ||
    !Object.hasOwn(inputKeys, value.action) ||
    !isRecord(value.input)
  )
    return null
  const action = value.action as keyof typeof inputKeys
  if (!exactKeys(value.input, inputKeys[action])) return null
  if (action === "save_meal_option_version_draft") {
    if (
      !Array.isArray(value.input.components) ||
      !value.input.components.every(
        (item) =>
          isRecord(item) &&
          exactKeys(item, [
            "recipeId",
            "recipeVersionId",
            "quantityMultiplier",
            "mealRole",
            "order"
          ])
      ) ||
      !Array.isArray(value.input.tagIds)
    ) {
      return null
    }
  }
  return value as unknown as MealOptionAdminCommand
}

function failureStatus(reason: string): number {
  if (reason === "STALE_CATALOG_REVISION") return 409
  if (reason === "PUBLICATION_INCOMPLETE" || reason === "NOT_FOUND") return 422
  if (reason === "VALIDATION_FAILED") return 400
  return 503
}

export function createMealOptionAdminHandler(dependencies: MealOptionAdminHandlerDependencies) {
  return async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST")
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
      return
    }
    if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json") {
      response.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE" })
      return
    }
    const accessToken = parseBearerToken(request.headers.authorization)
    if (accessToken === null) {
      response.status(401).json({ error: "UNAUTHORIZED" })
      return
    }
    let identity
    try {
      identity = await dependencies.auth.verify(accessToken)
    } catch {
      response.status(503).json({ error: "CATALOG_UNAVAILABLE" })
      return
    }
    if (identity === null) {
      response.status(401).json({ error: "UNAUTHORIZED" })
      return
    }
    if (!identity.isAdmin) {
      response.status(403).json({ error: "ADMIN_REQUIRED" })
      return
    }
    if (JSON.stringify(request.body).length > 64_000) {
      response.status(413).json({ error: "PAYLOAD_TOO_LARGE" })
      return
    }
    const parsed = command(request.body)
    if (parsed === null) {
      response.status(400).json({ error: "VALIDATION_FAILED" })
      return
    }
    try {
      const result = await executeMealOptionAdminCommand(
        dependencies.repositoryFor(identity.userId),
        dependencies.hasher,
        parsed
      )
      if (!result.ok) {
        const status = failureStatus(result.reason)
        response
          .status(status)
          .json({ error: status === 503 ? "CATALOG_UNAVAILABLE" : result.reason })
        return
      }
      response.status(200).json(result.value)
    } catch {
      response.status(503).json({ error: "CATALOG_UNAVAILABLE" })
    }
  }
}

const dependencies: MealOptionAdminHandlerDependencies = {
  auth: {
    async verify(accessToken) {
      const url = process.env.SUPABASE_URL
      const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
      if (url === undefined || publishableKey === undefined)
        throw new Error("AUTH_CONFIG_UNAVAILABLE")
      return createServerSupabaseAdminAuthVerifier({ url, publishableKey }).verify(accessToken)
    }
  },
  repositoryFor(actorUserId) {
    const url = process.env.SUPABASE_URL
    const secretKey = process.env.SUPABASE_SECRET_KEY
    if (url === undefined || secretKey === undefined) throw new Error("CATALOG_CONFIG_UNAVAILABLE")
    const client = createClient<Database>(url, secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    })
    return createSupabaseMealOptionAdminRepository(client, actorUserId)
  },
  hasher: new NodeContentHasher()
}

export default createMealOptionAdminHandler(dependencies)
