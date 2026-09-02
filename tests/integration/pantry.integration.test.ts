import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, test } from "vitest"

import { createSupabaseHouseholdRepository } from "@/infrastructure/supabase/supabase-household-repository.js"
import { createSupabasePantryRepository } from "@/infrastructure/supabase/supabase-pantry-repository.js"
import type { Database } from "@/infrastructure/supabase/database.types.js"

const gramUnitId = "70010000-0000-0000-0000-000000000001"
const kilogramUnitId = "70010000-0000-0000-0000-000000000002"
const pantryCategoryId = "70020000-0000-0000-0000-000000000013"

let url: string
let publishableKey: string
let secretKey: string
let publicClient: SupabaseClient<Database>
let secretClient: SupabaseClient<Database>
let ownerClient: SupabaseClient<Database>
let otherClient: SupabaseClient<Database>
let ownerUserId: string
let householdId: string
let foodId: string
let foodFactVersionId: string

function authenticatedClient(accessToken: string) {
  return createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  })
}

async function createLocalUser(prefix: string) {
  const result = await publicClient.auth.signUp({
    email: `${prefix}-${crypto.randomUUID()}@example.test`,
    password: `${prefix}-local-pantry-password`
  })
  if (result.error !== null || result.data.user === null || result.data.session === null) {
    throw new Error(`Unable to create ${prefix} pantry user`)
  }
  return {
    userId: result.data.user.id,
    client: authenticatedClient(result.data.session.access_token)
  }
}

beforeAll(async () => {
  url = process.env.SUPABASE_URL ?? ""
  publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
  secretKey = process.env.SUPABASE_SECRET_KEY ?? ""
  const parsed = new URL(url)
  if (
    publishableKey === "" ||
    secretKey === "" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error("Pantry integration requires loopback Supabase configuration")
  }

  publicClient = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  secretClient = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })

  const owner = await createLocalUser("phase5-pantry-owner")
  const other = await createLocalUser("phase5-pantry-other")
  ownerUserId = owner.userId
  ownerClient = owner.client
  otherClient = other.client

  const household = await createSupabaseHouseholdRepository(ownerClient).saveOwn(
    {
      memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
      weeklyPlanBudgetVnd: 900_000,
      maxElapsedMinutes: 30,
      ruleCodes: []
    },
    null
  )
  if (!household.ok) throw new Error(`Unable to create pantry household: ${household.reason}`)
  householdId = household.household.householdId

  foodId = crypto.randomUUID()
  foodFactVersionId = crypto.randomUUID()

  const food = await secretClient.from("foods").insert({
    id: foodId,
    code: `phase5_pantry_${crypto.randomUUID().replaceAll("-", "")}`,
    name_vi: "Gạo pantry integration",
    base_dimension: "mass",
    base_unit_id: gramUnitId
  })
  if (food.error !== null) throw new Error("Unable to create pantry food fixture")

  const fact = await secretClient.from("food_fact_versions").insert({
    id: foodFactVersionId,
    food_id: foodId,
    version_number: 1,
    category_id: pantryCategoryId,
    edible_fraction: 1,
    provenance: "Phase 5 pantry integration fixture",
    created_by: ownerUserId
  })
  if (fact.error !== null) throw new Error("Unable to create pantry fact fixture")

  const conversions = await secretClient.from("food_fact_unit_conversions").insert([
    {
      food_fact_version_id: foodFactVersionId,
      unit_id: gramUnitId,
      base_quantity_per_unit: 1,
      gross_grams_per_unit: 1,
      display_step: 1,
      provenance: "Phase 5 pantry gram identity"
    },
    {
      food_fact_version_id: foodFactVersionId,
      unit_id: kilogramUnitId,
      base_quantity_per_unit: 1000,
      gross_grams_per_unit: 1000,
      display_step: 0.001,
      provenance: "Phase 5 pantry kilogram conversion"
    }
  ])
  if (conversions.error !== null) throw new Error("Unable to create pantry conversion fixture")
}, 60_000)

describe("Phase 5 pantry repository integration", () => {
  test("round-trips owner quantities, canonical base evidence, optimistic versions and deletion", async () => {
    const repository = createSupabasePantryRepository(ownerClient)
    await expect(repository.load(householdId)).resolves.toEqual([])

    const inserted = await repository.upsert({
      householdId,
      foodId,
      foodFactVersionId,
      unitId: kilogramUnitId,
      quantity: "0.25",
      expectedVersion: 0
    })
    expect(inserted).toMatchObject({
      householdId,
      foodId,
      foodFactVersionId,
      unitId: kilogramUnitId,
      quantity: "0.25",
      baseQuantity: "250",
      baseUnitId: gramUnitId,
      version: 1
    })

    const loaded = await repository.load(householdId)
    expect(loaded).toEqual([inserted])

    const updated = await repository.upsert({
      householdId,
      foodId,
      foodFactVersionId,
      unitId: kilogramUnitId,
      quantity: "0",
      expectedVersion: inserted.version
    })
    expect(updated).toMatchObject({ quantity: "0", baseQuantity: "0", version: 2 })

    await expect(
      repository.upsert({
        householdId,
        foodId,
        foodFactVersionId,
        unitId: kilogramUnitId,
        quantity: "0.5",
        expectedVersion: 1
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" })

    await expect(repository.remove(updated.pantryItemId, 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT"
    })
    await expect(repository.remove(updated.pantryItemId, updated.version)).resolves.toBe(
      updated.pantryItemId
    )
    await expect(repository.load(householdId)).resolves.toEqual([])
  })

  test("maps cross-owner read and mutation attempts to unauthorized without leaking owner data", async () => {
    const ownerRepository = createSupabasePantryRepository(ownerClient)
    const inserted = await ownerRepository.upsert({
      householdId,
      foodId,
      foodFactVersionId,
      unitId: gramUnitId,
      quantity: "125",
      expectedVersion: 0
    })
    const otherRepository = createSupabasePantryRepository(otherClient)

    await expect(otherRepository.load(householdId)).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      otherRepository.upsert({
        householdId,
        foodId,
        foodFactVersionId,
        unitId: gramUnitId,
        quantity: "250",
        expectedVersion: inserted.version
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      otherRepository.remove(inserted.pantryItemId, inserted.version)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })

    await expect(ownerRepository.load(householdId)).resolves.toEqual([inserted])
    await ownerRepository.remove(inserted.pantryItemId, inserted.version)
  })
})
