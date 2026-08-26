import { createClient } from "@supabase/supabase-js"
import type { VercelRequest, VercelResponse } from "@vercel/node"

import type { CatalogAdminCommand } from "@/application/catalog/catalog-admin-command"
import type { CatalogAdminRepository } from "@/application/catalog/catalog-admin-repository"
import { executeCatalogAdminCommand } from "@/application/catalog/execute-catalog-admin-command"
import type { ContentHasher } from "@/application/shared/content-hasher"
import { NodeContentHasher } from "@/infrastructure/server/node-content-hasher"
import { createSupabaseCatalogAdminRepository } from "@/infrastructure/server/supabase-catalog-admin-repository"
import type { Database } from "@/infrastructure/supabase/database.types"
import {
  createServerSupabaseAdminAuthVerifier,
  type ServerAdminAuthVerifier
} from "@/infrastructure/supabase/server-admin-auth"
import { parseBearerToken } from "@/infrastructure/supabase/server-auth"

interface CatalogAdminHandlerDependencies {
  readonly auth: ServerAdminAuthVerifier
  readonly repositoryFor: (actorUserId: string) => CatalogAdminRepository
  readonly hasher: ContentHasher
}

type UnknownRecord = Record<string, unknown>

const inputKeys = {
  create_food: ["code", "nameVi", "baseDimension", "baseUnitId"],
  save_food_fact_draft: [
    "foodFactVersionId",
    "expectedRevision",
    "foodId",
    "versionNumber",
    "categoryId",
    "edibleFraction",
    "provenance",
    "allergenAssessments",
    "nutrients",
    "categoryAncestry",
    "dietaryTagCodes",
    "conversions"
  ],
  publish_food_fact: ["foodFactVersionId", "expectedRevision"],
  retire_food: ["foodId", "expectedRevision"],
  create_recipe: ["code", "nameVi"],
  save_recipe_version_draft: [
    "recipeVersionId",
    "expectedRevision",
    "recipeId",
    "versionNumber",
    "yieldAdultEquivalent",
    "activeMinutes",
    "elapsedMinutes",
    "ingredients",
    "steps",
    "tagIds"
  ],
  publish_recipe: ["recipeVersionId", "expectedRevision"],
  retire_recipe: ["recipeId", "expectedRevision"],
  create_price_book: ["regionId", "versionNumber", "effectiveFrom", "effectiveTo"],
  save_price_book_draft: [
    "priceBookId",
    "expectedRevision",
    "effectiveFrom",
    "effectiveTo",
    "prices"
  ],
  publish_price_book: ["priceBookId", "expectedRevision"],
  retire_price_book: ["priceBookId", "expectedRevision"]
} as const

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: UnknownRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const canonical = [...expected].sort()
  return (
    actual.length === canonical.length && actual.every((key, index) => key === canonical[index])
  )
}

function containsProtectedField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProtectedField)
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:contentHash|publicationStatus|createdBy|actor|audit|current.*Id|retiredAt|publishedAt|serviceRole)/iu.test(
        key
      ) || containsProtectedField(child)
  )
}

function nestedDraftShapeIsValid(action: string, input: UnknownRecord): boolean {
  if (action === "save_recipe_version_draft") {
    return (
      Array.isArray(input.ingredients) &&
      input.ingredients.every(
        (item) =>
          isRecord(item) &&
          hasExactKeys(item, [
            "recipeIngredientId",
            "foodId",
            "foodFactVersionId",
            "quantity",
            "unitId",
            "preparationNoteVi",
            "order"
          ])
      ) &&
      Array.isArray(input.steps) &&
      input.steps.every(
        (item) =>
          isRecord(item) &&
          hasExactKeys(item, ["order", "instructionVi", "timerMinutes", "ingredientIds"])
      ) &&
      Array.isArray(input.tagIds)
    )
  }
  if (action === "save_food_fact_draft") {
    return (
      Array.isArray(input.allergenAssessments) &&
      input.allergenAssessments.every(
        (item) => isRecord(item) && hasExactKeys(item, ["allergenCode", "status", "provenance"])
      ) &&
      Array.isArray(input.nutrients) &&
      input.nutrients.every(
        (item) =>
          isRecord(item) && hasExactKeys(item, ["nutrientCode", "amountPer100g", "provenance"])
      ) &&
      Array.isArray(input.conversions) &&
      input.conversions.every(
        (item) =>
          isRecord(item) &&
          hasExactKeys(item, [
            "unitId",
            "baseQuantityPerUnit",
            "grossGramsPerUnit",
            "displayStep",
            "provenance"
          ])
      ) &&
      Array.isArray(input.categoryAncestry) &&
      Array.isArray(input.dietaryTagCodes)
    )
  }
  if (action === "save_price_book_draft") {
    return (
      Array.isArray(input.prices) &&
      input.prices.every(
        (item) =>
          isRecord(item) &&
          hasExactKeys(item, [
            "foodPriceId",
            "foodId",
            "foodFactVersionId",
            "packageQuantity",
            "packageUnitId",
            "packageBaseQuantity",
            "baseUnitId",
            "packagePriceVnd",
            "purchaseIncrement",
            "observedAt",
            "sourceReference"
          ])
      )
    )
  }
  return true
}

function parseCommand(value: unknown): CatalogAdminCommand | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["action", "input"]) ||
    containsProtectedField(value)
  ) {
    return null
  }
  if (
    typeof value.action !== "string" ||
    !Object.hasOwn(inputKeys, value.action) ||
    !isRecord(value.input)
  ) {
    return null
  }
  const action = value.action as keyof typeof inputKeys
  if (
    !hasExactKeys(value.input, inputKeys[action]) ||
    !nestedDraftShapeIsValid(action, value.input)
  ) {
    return null
  }
  return value as unknown as CatalogAdminCommand
}

function statusFor(reason: string): number {
  if (reason === "STALE_CATALOG_REVISION") return 409
  if (reason === "PUBLICATION_INCOMPLETE" || reason === "NOT_FOUND") return 422
  if (reason === "VALIDATION_FAILED") return 400
  return 503
}

export function createCatalogAdminHandler(dependencies: CatalogAdminHandlerDependencies) {
  return async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST")
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" })
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
    const command = parseCommand(request.body)
    if (command === null) {
      response.status(400).json({ error: "VALIDATION_FAILED" })
      return
    }
    try {
      const result = await executeCatalogAdminCommand(
        dependencies.repositoryFor(identity.userId),
        dependencies.hasher,
        command
      )
      if (!result.ok) {
        const status = statusFor(result.reason)
        response.status(status).json({
          error: status === 503 ? "CATALOG_UNAVAILABLE" : result.reason
        })
        return
      }
      response.status(200).json(result.value)
    } catch {
      response.status(503).json({ error: "CATALOG_UNAVAILABLE" })
    }
  }
}

const runtimeDependencies: CatalogAdminHandlerDependencies = {
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
    return createSupabaseCatalogAdminRepository(client, actorUserId)
  },
  hasher: new NodeContentHasher()
}

export default createCatalogAdminHandler(runtimeDependencies)
