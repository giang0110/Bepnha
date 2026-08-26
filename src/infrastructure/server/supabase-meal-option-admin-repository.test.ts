// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import type { Database } from "@/infrastructure/supabase/database.types"

import { createSupabaseMealOptionAdminRepository } from "./supabase-meal-option-admin-repository"

function withRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return {
    repository: createSupabaseMealOptionAdminRepository(
      { rpc } as unknown as SupabaseClient<Database>,
      "admin-1"
    ),
    rpc
  }
}

describe("Supabase meal-option admin repository", () => {
  test("loads the authoritative aggregate by exact version ID", async () => {
    const aggregate = { mealOption: {}, version: {}, components: [], tags: [] }
    const { repository, rpc } = withRpc({ data: aggregate, error: null })
    await expect(repository.loadPublicationAggregate("version-1")).resolves.toEqual({
      ok: true,
      value: aggregate
    })
    expect(rpc).toHaveBeenCalledWith("get_meal_option_aggregate_for_publication", {
      p_meal_option_version_id: "version-1"
    })
  })

  test("publishes and retires with the server-derived actor and optimistic revision", async () => {
    const published = withRpc({ data: { revision: 4 }, error: null })
    await published.repository.publish({
      id: "version-1",
      expectedRevision: 3,
      contentHash: "a".repeat(64)
    })
    expect(published.rpc).toHaveBeenCalledWith("publish_meal_option_version", {
      p_meal_option_version_id: "version-1",
      p_content_hash: "a".repeat(64),
      p_actor_user_id: "admin-1",
      p_expected_revision: 3
    })

    const retired = withRpc({ data: { revision: 8 }, error: null })
    await retired.repository.retire({ id: "option-1", expectedRevision: 7 })
    expect(retired.rpc).toHaveBeenCalledWith("retire_meal_option", {
      p_meal_option_id: "option-1",
      p_actor_user_id: "admin-1",
      p_expected_revision: 7
    })
  })

  test("sanitizes stale and dependency failures", async () => {
    const stale = withRpc({
      data: null,
      error: { code: "P0001", message: "STALE_CATALOG_REVISION secret" }
    }).repository
    const failed = await stale.publish({
      id: "version-1",
      expectedRevision: 3,
      contentHash: "a".repeat(64)
    })
    expect(failed).toEqual({ ok: false, reason: "STALE_CATALOG_REVISION" })
    expect(JSON.stringify(failed)).not.toContain("secret")
  })
})
