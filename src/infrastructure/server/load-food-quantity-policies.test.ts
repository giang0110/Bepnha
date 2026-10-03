import type { SupabaseClient } from "@supabase/supabase-js"
import { expect, test, vi } from "vitest"
import type { Database } from "../supabase/database.types"
import { loadFoodQuantityPolicies } from "./load-food-quantity-policies"
const row = {
  id: "10000000-0000-4000-8000-000000000001",
  food_fact_version_id: "fact",
  version_number: 1,
  base_unit_id: "g",
  base_dimension: "mass",
  food_form: "portionable_mass",
  step_base_quantity: 1,
  rounding: "half_up",
  provenance: "Reviewed gram policy",
  content_hash: "a".repeat(64),
  publication_status: "published"
}
function client(rows: unknown[], error: unknown = null) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    order: vi.fn(() => q),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve)
  }
  return { value: { from: vi.fn(() => q) } as unknown as SupabaseClient<Database>, q }
}
test("uses exact published fact IDs and canonical policy fields", async () => {
  const c = client([row])
  expect(await loadFoodQuantityPolicies(c.value, ["fact"])).toEqual([
    {
      id: row.id,
      version: "food-quantity-v1",
      foodFactVersionId: "fact",
      versionNumber: 1,
      baseUnitId: "g",
      baseDimension: "mass",
      foodForm: "portionable_mass",
      stepBaseQuantity: "1",
      rounding: "half_up",
      provenance: row.provenance,
      contentHash: row.content_hash
    }
  ])
  expect(c.q.in).toHaveBeenCalledWith("food_fact_version_id", ["fact"])
})
test("missing publication stays missing and pinned IDs are honored", async () => {
  expect(await loadFoodQuantityPolicies(client([]).value, ["fact"])).toEqual([])
  const c = client([row])
  await loadFoodQuantityPolicies(c.value, ["fact"], [row.id])
  expect(c.q.in).toHaveBeenCalledWith("id", [row.id])
})
test("rejects unpublished or tampered records and maps missing schema precisely", async () => {
  await expect(
    loadFoodQuantityPolicies(client([{ ...row, content_hash: "bad" }]).value, ["fact"])
  ).rejects.toThrow("INVALID_QUANTITY_POLICY_DATA")
  await expect(
    loadFoodQuantityPolicies(client([], { code: "42P01" }).value, ["fact"])
  ).rejects.toMatchObject({ code: "DEPENDENCY_SCHEMA_NOT_READY" })
  await expect(
    loadFoodQuantityPolicies(client([], { code: "42501" }).value, ["fact"])
  ).rejects.not.toMatchObject({ code: "DEPENDENCY_SCHEMA_NOT_READY" })
})
