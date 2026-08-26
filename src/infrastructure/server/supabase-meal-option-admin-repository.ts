/// <reference types="node" />

import { randomUUID } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  MealOptionAdminFailureReason,
  MealOptionAdminRepository,
  MealOptionAdminResult,
  MealOptionPublicationAggregate
} from "@/application/meal-option/execute-meal-option-admin-command"
import type { Database } from "@/infrastructure/supabase/database.types"

type DbError = { code?: string; message?: string }
type UnknownRecord = Record<string, unknown>

function postgresNumeric(value: string): number {
  return value as unknown as number
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function failure(error: DbError | null): { ok: false; reason: MealOptionAdminFailureReason } {
  if (error?.code === "P0001" && error.message?.includes("STALE_CATALOG_REVISION") === true) {
    return { ok: false, reason: "STALE_CATALOG_REVISION" }
  }
  if (error?.code === "P0002") return { ok: false, reason: "NOT_FOUND" }
  if (error?.code?.startsWith("23") === true || error?.code === "22023") {
    return { ok: false, reason: "PUBLICATION_INCOMPLETE" }
  }
  return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
}

function result(
  data: unknown,
  id: string | undefined,
  status: "draft" | "published" | "retired",
  contentHash?: string
): MealOptionAdminResult {
  if (!isRecord(data)) return failure(null)
  const rowId = typeof data.id === "string" ? data.id : id
  if (
    rowId === undefined ||
    typeof data.revision !== "number" ||
    !Number.isSafeInteger(data.revision)
  ) {
    return failure(null)
  }
  return {
    ok: true,
    value:
      contentHash === undefined
        ? { id: rowId, revision: data.revision, status }
        : { id: rowId, revision: data.revision, status, contentHash }
  }
}

function aggregateIsShaped(value: unknown): value is MealOptionPublicationAggregate {
  return (
    isRecord(value) &&
    isRecord(value.mealOption) &&
    isRecord(value.version) &&
    Array.isArray(value.components) &&
    Array.isArray(value.tags)
  )
}

export function createSupabaseMealOptionAdminRepository(
  client: SupabaseClient<Database>,
  actorUserId: string
): MealOptionAdminRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from("meal_options")
        .insert({ code: input.code, name_vi: input.nameVi })
        .select("id, revision")
        .single()
      return error === null ? result(data, undefined, "draft") : failure(error)
    },
    async saveDraft(input) {
      const { data: existing, error: loadError } = await client
        .from("meal_option_versions")
        .select("id, revision")
        .eq("id", input.mealOptionVersionId)
        .maybeSingle()
      if (loadError !== null) return failure(loadError)
      const parent =
        existing === null
          ? await client
              .from("meal_option_versions")
              .insert({
                id: input.mealOptionVersionId,
                meal_option_id: input.mealOptionId,
                version_number: input.versionNumber,
                yield_adult_equivalent: postgresNumeric(input.yieldAdultEquivalent),
                active_minutes: input.activeMinutes,
                elapsed_minutes: input.elapsedMinutes,
                created_by: actorUserId
              })
              .select("id, revision")
              .single()
          : await client
              .from("meal_option_versions")
              .update({
                yield_adult_equivalent: postgresNumeric(input.yieldAdultEquivalent),
                active_minutes: input.activeMinutes,
                elapsed_minutes: input.elapsedMinutes
              })
              .eq("id", input.mealOptionVersionId)
              .eq("revision", input.expectedRevision)
              .eq("publication_status", "draft")
              .select("id, revision")
              .maybeSingle()
      if (parent.error !== null) return failure(parent.error)
      if (parent.data === null) return { ok: false, reason: "STALE_CATALOG_REVISION" }

      for (const table of ["meal_option_recipes", "meal_option_version_tags"] as const) {
        const { error } = await client
          .from(table)
          .delete()
          .eq("meal_option_version_id", input.mealOptionVersionId)
        if (error !== null) return failure(error)
      }
      const componentWrite = await client.from("meal_option_recipes").insert(
        input.components.map((item) => ({
          id: randomUUID(),
          meal_option_version_id: input.mealOptionVersionId,
          recipe_id: item.recipeId,
          recipe_version_id: item.recipeVersionId,
          quantity_multiplier: postgresNumeric(item.quantityMultiplier),
          meal_role: item.mealRole,
          sort_order: item.order
        }))
      )
      if (componentWrite.error !== null) return failure(componentWrite.error)
      if (input.tagIds.length > 0) {
        const tagWrite = await client.from("meal_option_version_tags").insert(
          input.tagIds.map((recipeTagId) => ({
            meal_option_version_id: input.mealOptionVersionId,
            recipe_tag_id: recipeTagId
          }))
        )
        if (tagWrite.error !== null) return failure(tagWrite.error)
      }
      return result(parent.data, input.mealOptionVersionId, "draft")
    },
    async loadPublicationAggregate(id) {
      const { data, error } = await client.rpc("get_meal_option_aggregate_for_publication", {
        p_meal_option_version_id: id
      })
      if (error !== null) return { ok: false, reason: "DEPENDENCY_UNAVAILABLE" }
      return aggregateIsShaped(data)
        ? { ok: true, value: data }
        : { ok: false, reason: "NOT_FOUND" }
    },
    async publish(input) {
      const { data, error } = await client.rpc("publish_meal_option_version", {
        p_meal_option_version_id: input.id,
        p_content_hash: input.contentHash,
        p_actor_user_id: actorUserId,
        p_expected_revision: input.expectedRevision
      })
      return error === null
        ? result(data, input.id, "published", input.contentHash)
        : failure(error)
    },
    async retire(input) {
      const { data, error } = await client.rpc("retire_meal_option", {
        p_meal_option_id: input.id,
        p_actor_user_id: actorUserId,
        p_expected_revision: input.expectedRevision
      })
      return error === null ? result(data, input.id, "retired") : failure(error)
    }
  }
}
