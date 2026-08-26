/// <reference types="node" />

import { randomUUID } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  CatalogAdminFailureReason,
  CatalogAdminRepository,
  CatalogAdminResult,
  CatalogPublicationAggregate
} from "@/application/catalog/catalog-admin-repository"
import type { Database } from "@/infrastructure/supabase/database.types"

type DbError = { code?: string; message?: string }
type UnknownRecord = Record<string, unknown>

// PostgREST accepts canonical numeric text and PostgreSQL parses it exactly. Generated
// Supabase types model NUMERIC as number, so keep the coercion isolated at this boundary.
function postgresNumeric(value: string): number {
  return value as unknown as number
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function failure(error: DbError | null): { ok: false; reason: CatalogAdminFailureReason } {
  if (error?.code === "P0001" && error.message?.includes("STALE_CATALOG_REVISION") === true) {
    return { ok: false, reason: "STALE_CATALOG_REVISION" }
  }
  if (error?.code === "P0001" && error.message?.includes("INCOMPLETE") === true) {
    return { ok: false, reason: "PUBLICATION_INCOMPLETE" }
  }
  if (error?.code?.startsWith("23") === true || error?.code === "22P02") {
    return { ok: false, reason: "VALIDATION_FAILED" }
  }
  return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
}

function resultFromRow(
  data: unknown,
  status: "draft" | "published" | "retired",
  fallbackId?: string,
  contentHash?: string
): CatalogAdminResult {
  if (!isRecord(data)) return failure(null)
  const id = typeof data.id === "string" ? data.id : fallbackId
  const revision = data.revision
  if (id === undefined || typeof revision !== "number" || !Number.isSafeInteger(revision)) {
    return failure(null)
  }
  return {
    ok: true,
    value:
      contentHash === undefined ? { id, revision, status } : { id, revision, status, contentHash }
  }
}

function aggregateShapeIsValid(value: unknown): value is CatalogPublicationAggregate {
  if (!isRecord(value) || !Array.isArray(value["prices"] ?? value["ingredients"] ?? [])) {
    return false
  }
  if (value.aggregateType === "food_fact_version") {
    return (
      isRecord(value.food) &&
      isRecord(value.fact) &&
      Array.isArray(value.conversions) &&
      Array.isArray(value.assessments) &&
      Array.isArray(value.nutrients) &&
      Array.isArray(value.dietaryTags)
    )
  }
  if (value.aggregateType === "recipe_version") {
    return (
      isRecord(value.recipe) &&
      isRecord(value.version) &&
      Array.isArray(value.ingredients) &&
      Array.isArray(value.steps) &&
      Array.isArray(value.stepIngredients) &&
      Array.isArray(value.tags)
    )
  }
  return value.aggregateType === "price_book" && isRecord(value.book) && Array.isArray(value.prices)
}

async function lookupIdsByCode(
  client: SupabaseClient<Database>,
  table: "allergens" | "dietary_tags" | "nutrients",
  codes: readonly string[]
): Promise<Map<string, string> | null> {
  if (codes.length === 0) return new Map()
  const { data, error } = await client
    .from(table)
    .select("id, code")
    .in("code", [...codes])
  if (error !== null || data === null) return null
  const result = new Map(data.map((row) => [row.code, row.id]))
  return result.size === new Set(codes).size ? result : null
}

export function createSupabaseCatalogAdminRepository(
  client: SupabaseClient<Database>,
  actorUserId: string
): CatalogAdminRepository {
  async function publish(
    kind: "food" | "recipe" | "price",
    input: { id: string; expectedRevision: number; contentHash: string }
  ): Promise<CatalogAdminResult> {
    const common = {
      p_content_hash: input.contentHash,
      p_actor_user_id: actorUserId,
      p_expected_revision: input.expectedRevision
    }
    const { data, error } =
      kind === "food"
        ? await client.rpc("publish_food_fact_version", {
            ...common,
            p_food_fact_version_id: input.id
          })
        : kind === "recipe"
          ? await client.rpc("publish_recipe_version", {
              ...common,
              p_recipe_version_id: input.id
            })
          : await client.rpc("publish_price_book", {
              ...common,
              p_price_book_id: input.id
            })
    if (error !== null) return failure(error)
    return resultFromRow(
      { ...(isRecord(data) ? data : {}), id: input.id },
      "published",
      input.id,
      input.contentHash
    )
  }

  async function retire(
    entityType: "food" | "recipe" | "price_book",
    input: { id: string; expectedRevision: number }
  ): Promise<CatalogAdminResult> {
    const { data, error } = await client.rpc("retire_catalog_identity", {
      p_entity_type: entityType,
      p_entity_id: input.id,
      p_actor_user_id: actorUserId,
      p_expected_revision: input.expectedRevision
    })
    if (error !== null) return failure(error)
    return resultFromRow({ ...(isRecord(data) ? data : {}), id: input.id }, "retired", input.id)
  }

  return {
    async createFood(input) {
      const { data, error } = await client
        .from("foods")
        .insert({
          code: input.code,
          name_vi: input.nameVi,
          base_dimension: input.baseDimension,
          base_unit_id: input.baseUnitId
        })
        .select("id, revision")
        .single()
      return error === null ? resultFromRow(data, "draft") : failure(error)
    },
    async saveFoodFactDraft(input) {
      const [allergenIds, nutrientIds, tagIds] = await Promise.all([
        lookupIdsByCode(
          client,
          "allergens",
          input.allergenAssessments.map((item) => item.allergenCode)
        ),
        lookupIdsByCode(
          client,
          "nutrients",
          input.nutrients.map((item) => item.nutrientCode)
        ),
        lookupIdsByCode(client, "dietary_tags", input.dietaryTagCodes)
      ])
      if (allergenIds === null || nutrientIds === null || tagIds === null) return failure(null)

      const { data: existing, error: loadError } = await client
        .from("food_fact_versions")
        .select("id, revision")
        .eq("id", input.foodFactVersionId)
        .maybeSingle()
      if (loadError !== null) return failure(loadError)
      const nextRevision = existing === null ? 1 : input.expectedRevision + 1
      const parentResult =
        existing === null
          ? await client
              .from("food_fact_versions")
              .insert({
                id: input.foodFactVersionId,
                food_id: input.foodId,
                version_number: input.versionNumber,
                category_id: input.categoryId,
                edible_fraction: postgresNumeric(input.edibleFraction),
                provenance: input.provenance,
                created_by: actorUserId
              })
              .select("id, revision")
              .single()
          : await client
              .from("food_fact_versions")
              .update({
                category_id: input.categoryId,
                edible_fraction: postgresNumeric(input.edibleFraction),
                provenance: input.provenance,
                revision: nextRevision
              })
              .eq("id", input.foodFactVersionId)
              .eq("revision", input.expectedRevision)
              .eq("publication_status", "draft")
              .select("id, revision")
              .maybeSingle()
      if (parentResult.error !== null) return failure(parentResult.error)
      if (parentResult.data === null) return { ok: false, reason: "STALE_CATALOG_REVISION" }

      const childTables = [
        "food_fact_unit_conversions",
        "food_fact_allergen_assessments",
        "food_fact_nutrients",
        "food_fact_dietary_tags"
      ] as const
      for (const table of childTables) {
        const { error } = await client
          .from(table)
          .delete()
          .eq("food_fact_version_id", input.foodFactVersionId)
        if (error !== null) return failure(error)
      }
      const writes = await Promise.all([
        client.from("food_fact_unit_conversions").insert(
          input.conversions.map((item) => ({
            food_fact_version_id: input.foodFactVersionId,
            unit_id: item.unitId,
            base_quantity_per_unit: postgresNumeric(item.baseQuantityPerUnit),
            gross_grams_per_unit: postgresNumeric(item.grossGramsPerUnit),
            display_step: postgresNumeric(item.displayStep),
            provenance: item.provenance
          }))
        ),
        client.from("food_fact_allergen_assessments").insert(
          input.allergenAssessments.map((item) => ({
            food_fact_version_id: input.foodFactVersionId,
            allergen_id: allergenIds.get(item.allergenCode)!,
            assessment: item.status,
            provenance: item.provenance
          }))
        ),
        client.from("food_fact_nutrients").insert(
          input.nutrients.map((item) => ({
            food_fact_version_id: input.foodFactVersionId,
            nutrient_id: nutrientIds.get(item.nutrientCode)!,
            amount_per_100g: postgresNumeric(item.amountPer100g),
            provenance: item.provenance
          }))
        ),
        input.dietaryTagCodes.length === 0
          ? Promise.resolve({ error: null })
          : client.from("food_fact_dietary_tags").insert(
              input.dietaryTagCodes.map((code) => ({
                food_fact_version_id: input.foodFactVersionId,
                dietary_tag_id: tagIds.get(code)!
              }))
            )
      ])
      const writeFailure = writes.find((write) => write.error !== null)
      return writeFailure === undefined
        ? resultFromRow(parentResult.data, "draft", input.foodFactVersionId)
        : failure(writeFailure.error)
    },
    publishFoodFact: (input) => publish("food", input),
    retireFood: (input) => retire("food", input),
    async createRecipe(input) {
      const { data, error } = await client
        .from("recipes")
        .insert({ code: input.code, name_vi: input.nameVi })
        .select("id, revision")
        .single()
      return error === null ? resultFromRow(data, "draft") : failure(error)
    },
    async saveRecipeVersionDraft(input) {
      const { data: existing, error: loadError } = await client
        .from("recipe_versions")
        .select("id, revision")
        .eq("id", input.recipeVersionId)
        .maybeSingle()
      if (loadError !== null) return failure(loadError)
      const parentResult =
        existing === null
          ? await client
              .from("recipe_versions")
              .insert({
                id: input.recipeVersionId,
                recipe_id: input.recipeId,
                version_number: input.versionNumber,
                yield_adult_equivalent: postgresNumeric(input.yieldAdultEquivalent),
                active_minutes: input.activeMinutes,
                elapsed_minutes: input.elapsedMinutes,
                created_by: actorUserId
              })
              .select("id, revision")
              .single()
          : await client
              .from("recipe_versions")
              .update({
                yield_adult_equivalent: postgresNumeric(input.yieldAdultEquivalent),
                active_minutes: input.activeMinutes,
                elapsed_minutes: input.elapsedMinutes,
                revision: input.expectedRevision + 1
              })
              .eq("id", input.recipeVersionId)
              .eq("revision", input.expectedRevision)
              .eq("publication_status", "draft")
              .select("id, revision")
              .maybeSingle()
      if (parentResult.error !== null) return failure(parentResult.error)
      if (parentResult.data === null) return { ok: false, reason: "STALE_CATALOG_REVISION" }

      for (const table of [
        "recipe_step_ingredients",
        "recipe_steps",
        "recipe_ingredients",
        "recipe_version_tags"
      ] as const) {
        const { error } = await client
          .from(table)
          .delete()
          .eq("recipe_version_id", input.recipeVersionId)
        if (error !== null) return failure(error)
      }
      const ingredientIdMap = new Map<string, string>()
      const ingredientRows = input.ingredients.map((item) => {
        const id = randomUUID()
        ingredientIdMap.set(item.recipeIngredientId, id)
        return {
          id,
          recipe_version_id: input.recipeVersionId,
          food_id: item.foodId,
          food_fact_version_id: item.foodFactVersionId,
          quantity: postgresNumeric(item.quantity),
          unit_id: item.unitId,
          preparation_note_vi: item.preparationNoteVi,
          sort_order: item.order
        }
      })
      const ingredientWrite = await client.from("recipe_ingredients").insert(ingredientRows)
      if (ingredientWrite.error !== null) return failure(ingredientWrite.error)
      const { data: stepRows, error: stepError } = await client
        .from("recipe_steps")
        .insert(
          input.steps.map((item) => ({
            recipe_version_id: input.recipeVersionId,
            sort_order: item.order,
            instruction_vi: item.instructionVi,
            timer_minutes: item.timerMinutes
          }))
        )
        .select("id, sort_order")
      if (stepError !== null || stepRows === null) return failure(stepError)
      const stepIdByOrder = new Map(stepRows.map((row) => [row.sort_order, row.id]))
      const links = input.steps.flatMap((step) =>
        step.ingredientIds.map((ingredientId, index) => ({
          recipe_version_id: input.recipeVersionId,
          recipe_step_id: stepIdByOrder.get(step.order)!,
          recipe_ingredient_id: ingredientIdMap.get(ingredientId)!,
          reference_order: index + 1
        }))
      )
      if (links.length > 0) {
        const linkWrite = await client.from("recipe_step_ingredients").insert(links)
        if (linkWrite.error !== null) return failure(linkWrite.error)
      }
      if (input.tagIds.length > 0) {
        const tagWrite = await client.from("recipe_version_tags").insert(
          input.tagIds.map((recipeTagId) => ({
            recipe_version_id: input.recipeVersionId,
            recipe_tag_id: recipeTagId
          }))
        )
        if (tagWrite.error !== null) return failure(tagWrite.error)
      }
      return resultFromRow(parentResult.data, "draft", input.recipeVersionId)
    },
    publishRecipe: (input) => publish("recipe", input),
    retireRecipe: (input) => retire("recipe", input),
    async createPriceBook(input) {
      const { data, error } = await client
        .from("price_books")
        .insert({
          region_id: input.regionId,
          version_number: input.versionNumber,
          effective_from: input.effectiveFrom,
          effective_to: input.effectiveTo,
          created_by: actorUserId
        })
        .select("id, revision")
        .single()
      return error === null ? resultFromRow(data, "draft") : failure(error)
    },
    async savePriceBookDraft(input) {
      const { data, error } = await client
        .from("price_books")
        .update({
          effective_from: input.effectiveFrom,
          effective_to: input.effectiveTo,
          revision: input.expectedRevision + 1
        })
        .eq("id", input.priceBookId)
        .eq("revision", input.expectedRevision)
        .eq("publication_status", "draft")
        .select("id, revision")
        .maybeSingle()
      if (error !== null) return failure(error)
      if (data === null) return { ok: false, reason: "STALE_CATALOG_REVISION" }
      const deletion = await client
        .from("food_prices")
        .delete()
        .eq("price_book_id", input.priceBookId)
      if (deletion.error !== null) return failure(deletion.error)
      const insertion = await client.from("food_prices").insert(
        input.prices.map((item) => ({
          price_book_id: input.priceBookId,
          food_id: item.foodId,
          food_fact_version_id: item.foodFactVersionId,
          package_quantity: postgresNumeric(item.packageQuantity),
          package_unit_id: item.packageUnitId,
          package_base_quantity: postgresNumeric(item.packageBaseQuantity),
          base_unit_id: item.baseUnitId,
          package_price_vnd: item.packagePriceVnd,
          purchase_increment: postgresNumeric(item.purchaseIncrement),
          observed_at: item.observedAt,
          source_reference: item.sourceReference
        }))
      )
      return insertion.error === null
        ? resultFromRow(data, "draft", input.priceBookId)
        : failure(insertion.error)
    },
    publishPriceBook: (input) => publish("price", input),
    retirePriceBook: (input) => retire("price_book", input),
    async getAggregateForPublication(aggregateType, id) {
      const { data, error } = await client.rpc("get_catalog_aggregate_for_publication", {
        p_aggregate_type: aggregateType,
        p_aggregate_id: id
      })
      if (error !== null) return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
      if (data === null) return { ok: false, reason: "NOT_FOUND" }
      return aggregateShapeIsValid(data)
        ? { ok: true, value: data }
        : { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
    }
  }
}
