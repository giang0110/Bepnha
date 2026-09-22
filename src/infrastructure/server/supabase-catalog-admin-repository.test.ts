// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import type { Database } from "@/infrastructure/supabase/database.types"

import { createSupabaseCatalogAdminRepository } from "./supabase-catalog-admin-repository"

const aggregate = {
  aggregateType: "recipe_version",
  recipe: { recipeId: "recipe", code: "com", nameVi: "Cơm", revision: 1 },
  version: {
    recipeVersionId: "recipe-v1",
    versionNumber: 1,
    revision: 4,
    yieldAdultEquivalent: "4",
    activeMinutes: 10,
    elapsedMinutes: 20,
    publicationStatus: "draft",
    contentHash: null
  },
  ingredients: [],
  steps: [],
  stepIngredients: [],
  tags: []
}

function repositoryWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result))
  const client = { rpc } as unknown as SupabaseClient<Database>
  return {
    repository: createSupabaseCatalogAdminRepository(client, "admin-user"),
    rpc
  }
}

describe("Supabase catalog admin repository", () => {
  test("loads a draft aggregate with exact type and ID for application-side hashing", async () => {
    const { repository, rpc } = repositoryWithRpc({ data: aggregate, error: null })

    await expect(
      repository.getAggregateForPublication("recipe_version", "recipe-v1")
    ).resolves.toEqual({ ok: true, value: aggregate })
    expect(rpc).toHaveBeenCalledWith("get_catalog_aggregate_for_publication", {
      p_aggregate_type: "recipe_version",
      p_aggregate_id: "recipe-v1"
    })
  })

  test("publishes with server-derived actor, exact revision, and calculated hash", async () => {
    const { repository, rpc } = repositoryWithRpc({ data: { revision: 5 }, error: null })

    await expect(
      repository.publishRecipe({
        id: "recipe-v1",
        expectedRevision: 4,
        contentHash: "a".repeat(64)
      })
    ).resolves.toEqual({
      ok: true,
      value: {
        id: "recipe-v1",
        revision: 5,
        status: "published",
        contentHash: "a".repeat(64)
      }
    })
    expect(rpc).toHaveBeenCalledWith("publish_recipe_version", {
      p_recipe_version_id: "recipe-v1",
      p_content_hash: "a".repeat(64),
      p_actor_user_id: "admin-user",
      p_expected_revision: 4
    })
  })

  test("maps revision and dependency failures without leaking raw database text", async () => {
    const stale = repositoryWithRpc({
      data: null,
      error: { code: "P0001", message: "STALE_CATALOG_REVISION secret host" }
    }).repository
    const unavailable = repositoryWithRpc({
      data: null,
      error: { code: "08006", message: "database token secret" }
    }).repository

    const staleResult = await stale.publishFoodFact({
      id: "fact-v1",
      expectedRevision: 2,
      contentHash: "a".repeat(64)
    })
    const unavailableResult = await unavailable.getAggregateForPublication(
      "food_fact_version",
      "fact-v1"
    )

    expect(staleResult).toEqual({ ok: false, reason: "STALE_CATALOG_REVISION" })
    expect(unavailableResult).toEqual({ ok: false, reason: "DEPENDENCY_UNAVAILABLE" })
    expect(JSON.stringify([staleResult, unavailableResult])).not.toMatch(/host|token|secret/i)
  })

  test("names the schema rule that refused, so a failure can be read without reproducing it", async () => {
    const refused = repositoryWithRpc({
      data: null,
      error: { code: "23514", message: "PRICE_REQUIRES_PUBLISHED_FACT_CONVERSION" }
    }).repository

    await expect(
      refused.publishFoodFact({ id: "fact-v1", expectedRevision: 2, contentHash: "a".repeat(64) })
    ).resolves.toEqual({
      ok: false,
      reason: "VALIDATION_FAILED",
      detail: "PRICE_REQUIRES_PUBLISHED_FACT_CONVERSION"
    })
  })

  test("names the constraint Postgres enforced when it raised no name of its own", async () => {
    const collided = repositoryWithRpc({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "price_books_one_draft_per_region_idx"'
      }
    }).repository

    await expect(
      collided.publishFoodFact({ id: "fact-v1", expectedRevision: 2, contentHash: "a".repeat(64) })
    ).resolves.toEqual({
      ok: false,
      reason: "VALIDATION_FAILED",
      detail: "price_books_one_draft_per_region_idx"
    })
  })

  test("withholds a detail for prose the database wrote, however much it resembles a rule", async () => {
    // The connection layer decides what goes in these; a host or a token in a URL must not ride out
    // on a field meant for schema vocabulary.
    const cases = [
      { code: "08006", message: "could not connect to db.secret-host.internal:5432" },
      { code: "23514", message: "STALE_CATALOG_REVISION secret host" },
      { code: "23514", message: "" }
    ]

    for (const error of cases) {
      const result = await repositoryWithRpc({ data: null, error }).repository.publishFoodFact({
        id: "fact-v1",
        expectedRevision: 2,
        contentHash: "a".repeat(64)
      })
      expect(result).not.toHaveProperty("detail")
      expect(JSON.stringify(result)).not.toMatch(/host|token|secret|5432/i)
    }
  })

  test("treats an empty draft array as a refusal to fix, not a database to retry", async () => {
    // save_price_book_draft_atomic raises 22023 for PRICE_ROWS_REQUIRED. Reported as
    // DEPENDENCY_UNAVAILABLE it became a 503, and the runbook answer to a 503 is to resume.
    const empty = repositoryWithRpc({
      data: null,
      error: { code: "22023", message: "PRICE_ROWS_REQUIRED" }
    }).repository

    await expect(
      empty.savePriceBookDraft({
        priceBookId: "book",
        expectedRevision: 1,
        effectiveFrom: "2026-09-17",
        effectiveTo: null,
        prices: []
      })
    ).resolves.toEqual({
      ok: false,
      reason: "VALIDATION_FAILED",
      detail: "PRICE_ROWS_REQUIRED"
    })
  })
})
