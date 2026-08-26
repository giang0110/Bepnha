import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  CatalogReadRepository,
  CatalogReadResult,
  PublishedRecipeCalculationRecord
} from "@/application/catalog/catalog-read-repository"
import type { AllergenAssessmentStatus } from "@/domain/catalog/catalog"

import type { Database } from "./database.types.js"

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredRecord(parent: UnknownRecord, key: string): UnknownRecord {
  const value = parent[key]
  if (!isRecord(value)) throw new Error("INVALID_CATALOG_DATA")
  return value
}

function requiredArray(parent: UnknownRecord, key: string): unknown[] {
  const value = parent[key]
  if (!Array.isArray(value)) throw new Error("INVALID_CATALOG_DATA")
  return value
}

function requiredString(parent: UnknownRecord, key: string): string {
  const value = parent[key]
  if (typeof value !== "string" || value.length === 0) throw new Error("INVALID_CATALOG_DATA")
  return value
}

function requiredInteger(parent: UnknownRecord, key: string): number {
  const value = parent[key]
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("INVALID_CATALOG_DATA")
  }
  return value
}

function mapStringArray(parent: UnknownRecord, key: string): string[] {
  return requiredArray(parent, key).map((value) => {
    if (typeof value !== "string" || value.length === 0) throw new Error("INVALID_CATALOG_DATA")
    return value
  })
}

function mapCalculation(value: unknown): PublishedRecipeCalculationRecord {
  if (!isRecord(value)) throw new Error("INVALID_CATALOG_DATA")
  const recipeRow = requiredRecord(value, "recipe")
  const priceBookRow = requiredRecord(value, "priceBook")
  const ingredients = requiredArray(recipeRow, "ingredients").map((candidate) => {
    if (!isRecord(candidate)) throw new Error("INVALID_CATALOG_DATA")
    const food = requiredRecord(candidate, "food")
    const fact = requiredRecord(candidate, "fact")
    const conversion = requiredRecord(fact, "conversion")
    return {
      recipeIngredientId: requiredString(candidate, "recipeIngredientId"),
      order: requiredInteger(candidate, "order"),
      quantity: requiredString(candidate, "quantity"),
      unitId: requiredString(candidate, "unitId"),
      food: {
        foodId: requiredString(food, "foodId"),
        code: requiredString(food, "code"),
        nameVi: requiredString(food, "nameVi"),
        baseUnitId: requiredString(food, "baseUnitId")
      },
      fact: {
        foodFactVersionId: requiredString(fact, "foodFactVersionId"),
        versionNumber: requiredInteger(fact, "versionNumber"),
        contentHash: requiredString(fact, "contentHash"),
        edibleFraction: requiredString(fact, "edibleFraction"),
        conversion: {
          unitId: requiredString(conversion, "unitId"),
          baseQuantityPerUnit: requiredString(conversion, "baseQuantityPerUnit"),
          grossGramsPerUnit: requiredString(conversion, "grossGramsPerUnit")
        },
        nutrients: requiredArray(fact, "nutrients").map((nutrient) => {
          if (!isRecord(nutrient)) throw new Error("INVALID_CATALOG_DATA")
          return {
            nutrientCode: requiredString(nutrient, "nutrientCode"),
            amountPer100g: requiredString(nutrient, "amountPer100g")
          }
        }),
        allergenAssessments: requiredArray(fact, "allergenAssessments").map((assessment) => {
          if (!isRecord(assessment)) throw new Error("INVALID_CATALOG_DATA")
          const status = requiredString(assessment, "status")
          if (!["absent", "contains", "may_contain", "unknown"].includes(status)) {
            throw new Error("INVALID_CATALOG_DATA")
          }
          return {
            allergenCode: requiredString(assessment, "allergenCode"),
            status: status as AllergenAssessmentStatus
          }
        }),
        categoryAncestry: mapStringArray(fact, "categoryAncestry"),
        dietaryTagCodes: mapStringArray(fact, "dietaryTagCodes")
      }
    }
  })
  const prices = requiredArray(priceBookRow, "prices").map((candidate) => {
    if (!isRecord(candidate)) throw new Error("INVALID_CATALOG_DATA")
    return {
      foodPriceId: requiredString(candidate, "foodPriceId"),
      foodId: requiredString(candidate, "foodId"),
      foodFactVersionId: requiredString(candidate, "foodFactVersionId"),
      baseUnitId: requiredString(candidate, "baseUnitId"),
      packageBaseQuantity: requiredString(candidate, "packageBaseQuantity"),
      packagePriceVnd: requiredInteger(candidate, "packagePriceVnd"),
      observedAt: requiredString(candidate, "observedAt")
    }
  })

  return {
    recipePublicationStatus: "published",
    priceBookPublicationStatus: "published",
    priceBookRetiredAt: null,
    recipe: {
      recipeId: requiredString(recipeRow, "recipeId"),
      recipeVersionId: requiredString(recipeRow, "recipeVersionId"),
      recipeVersionNumber: requiredInteger(recipeRow, "versionNumber"),
      contentHash: requiredString(recipeRow, "contentHash"),
      yieldAdultEquivalent: requiredString(recipeRow, "yieldAdultEquivalent"),
      activeMinutes: requiredInteger(recipeRow, "activeMinutes"),
      elapsedMinutes: requiredInteger(recipeRow, "elapsedMinutes"),
      ingredients
    },
    priceBook: {
      regionId: requiredString(priceBookRow, "regionId"),
      regionCode: requiredString(priceBookRow, "regionCode"),
      priceBookId: requiredString(priceBookRow, "priceBookId"),
      versionNumber: requiredInteger(priceBookRow, "versionNumber"),
      contentHash: requiredString(priceBookRow, "contentHash"),
      prices
    }
  }
}

function dependencyFailure<T>(): CatalogReadResult<T> {
  return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
}

export function createSupabaseCatalogReadRepository(
  client: SupabaseClient<Database>
): CatalogReadRepository {
  return {
    async getCurrentPriceBook(regionId) {
      const { data, error } = await client.rpc("get_current_price_book", {
        p_region_id: regionId
      })
      if (error !== null) return dependencyFailure()
      if (!isRecord(data))
        return data === null ? { ok: false, reason: "NOT_FOUND" } : dependencyFailure()
      try {
        return { ok: true, value: { priceBookId: requiredString(data, "priceBookId") } }
      } catch {
        return dependencyFailure()
      }
    },
    async getPublishedRecipeCalculation(recipeVersionId, priceBookId) {
      const { data, error } = await client.rpc("get_published_recipe_calculation_input", {
        p_recipe_version_id: recipeVersionId,
        p_price_book_id: priceBookId
      })
      if (error !== null) return dependencyFailure()
      if (data === null) return { ok: false, reason: "NOT_FOUND" }
      try {
        return { ok: true, value: mapCalculation(data) }
      } catch {
        return dependencyFailure()
      }
    }
  }
}
