import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import { PantryRepositoryError } from "@/application/pantry/pantry-repository"
import type { Database } from "@/infrastructure/supabase/database.types"

import { createSupabasePantryRepository } from "./supabase-pantry-repository"

const row = {
  id: "pantry-1",
  household_id: "household-1",
  food_id: "food-1",
  food_fact_version_id: "fact-1",
  quantity: 0.25,
  unit_id: "unit-kg",
  base_quantity: 250,
  base_unit_id: "unit-g",
  version: 2,
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T01:00:00Z"
}

function fixtureClient(
  handler: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
) {
  const rpc = vi.fn(handler)
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe("Supabase pantry repository", () => {
  test("loads owner pantry and returns strict canonical DTOs", async () => {
    const { client, rpc } = fixtureClient(async () => ({ data: [row], error: null }))
    const repository = createSupabasePantryRepository(client)

    await expect(repository.load("household-1")).resolves.toEqual([
      {
        pantryItemId: "pantry-1",
        householdId: "household-1",
        foodId: "food-1",
        foodFactVersionId: "fact-1",
        quantity: "0.25",
        unitId: "unit-kg",
        baseQuantity: "250",
        baseUnitId: "unit-g",
        version: 2,
        updatedAt: "2026-09-02T01:00:00Z"
      }
    ])
    expect(rpc).toHaveBeenCalledWith("get_pantry", { p_household_id: "household-1" })
  })

  test("upserts only through the narrow RPC and maps optimistic conflicts", async () => {
    const { client, rpc } = fixtureClient(async (name) =>
      name === "upsert_pantry_item"
        ? { data: row, error: null }
        : { data: null, error: { code: "P0001" } }
    )
    const repository = createSupabasePantryRepository(client)

    await expect(
      repository.upsert({
        householdId: "household-1",
        foodId: "food-1",
        foodFactVersionId: "fact-1",
        unitId: "unit-kg",
        quantity: "0.25",
        expectedVersion: 1
      })
    ).resolves.toMatchObject({ pantryItemId: "pantry-1", version: 2 })
    expect(rpc).toHaveBeenCalledWith("upsert_pantry_item", {
      p_household_id: "household-1",
      p_food_id: "food-1",
      p_food_fact_version_id: "fact-1",
      p_unit_id: "unit-kg",
      p_quantity: 0.25,
      p_expected_version: 1
    })

    const conflict = fixtureClient(async () => ({ data: null, error: { code: "P0001" } }))
    await expect(
      createSupabasePantryRepository(conflict.client).upsert({
        householdId: "household-1",
        foodId: "food-1",
        foodFactVersionId: "fact-1",
        unitId: "unit-kg",
        quantity: "0.5",
        expectedVersion: 1
      })
    ).rejects.toMatchObject<Partial<PantryRepositoryError>>({ code: "VERSION_CONFLICT" })
  })

  test("removes at an exact version and rejects a mismatched RPC result", async () => {
    const success = fixtureClient(async () => ({ data: "pantry-1", error: null }))
    await expect(createSupabasePantryRepository(success.client).remove("pantry-1", 2)).resolves.toBe(
      "pantry-1"
    )
    expect(success.rpc).toHaveBeenCalledWith("delete_pantry_item", {
      p_pantry_item_id: "pantry-1",
      p_expected_version: 2
    })

    const malformed = fixtureClient(async () => ({ data: "pantry-2", error: null }))
    await expect(
      createSupabasePantryRepository(malformed.client).remove("pantry-1", 2)
    ).rejects.toMatchObject<Partial<PantryRepositoryError>>({ code: "INVALID_STORED_DATA" })
  })

  test("fails closed on malformed stored rows, unauthorized calls, and transient failures", async () => {
    const malformed = fixtureClient(async () => ({
      data: [{ ...row, version: 0 }],
      error: null
    }))
    await expect(
      createSupabasePantryRepository(malformed.client).load("household-1")
    ).rejects.toMatchObject<Partial<PantryRepositoryError>>({ code: "INVALID_STORED_DATA" })

    const unauthorized = fixtureClient(async () => ({ data: null, error: { code: "42501" } }))
    await expect(
      createSupabasePantryRepository(unauthorized.client).load("household-1")
    ).rejects.toMatchObject<Partial<PantryRepositoryError>>({ code: "UNAUTHORIZED" })

    const unavailable = fixtureClient(async () => ({ data: null, error: { code: "XX000" } }))
    await expect(
      createSupabasePantryRepository(unavailable.client).load("household-1")
    ).rejects.toMatchObject<Partial<PantryRepositoryError>>({ code: "DEPENDENCY_UNAVAILABLE" })
  })
})
