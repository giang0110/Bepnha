import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import { createSupabaseHouseholdRepository } from "@/infrastructure/supabase/supabase-household-repository.js"
import type { Database, Json } from "@/infrastructure/supabase/database.types.js"

type LocalIdentity = {
  client: SupabaseClient<Database>
  userId: string
}

let url: string
let publishableKey: string

beforeAll(() => {
  url = process.env.SUPABASE_URL ?? ""
  publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? ""
  const parsed = new URL(url)
  if (publishableKey === "" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("Household integration tests require loopback Supabase public configuration")
  }
})

async function createIdentity(label: string): Promise<LocalIdentity> {
  const client = createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  })
  const result = await client.auth.signUp({
    email: `phase1-${label}-${crypto.randomUUID()}@example.test`,
    password: "phase1-local-test-password"
  })
  if (result.error !== null || result.data.user === null || result.data.session === null) {
    throw new Error(`Unable to create local ${label} identity`)
  }
  return { client, userId: result.data.user.id }
}

const setupInput = {
  memberGroups: [
    { memberKind: "adult" as const, ageBand: "adult" as const, memberCount: 2 },
    { memberKind: "child" as const, ageBand: "7_9" as const, memberCount: 1 }
  ],
  weeklyPlanBudgetVnd: 1_000_000,
  maxElapsedMinutes: 30,
  ruleCodes: ["allergen_peanut", "prefer_soup"]
}

async function snapshot(client: SupabaseClient<Database>, householdId: string) {
  const [parent, members, rules] = await Promise.all([
    client.from("households").select("*").eq("id", householdId).single(),
    client
      .from("household_member_groups")
      .select("household_id, member_kind, age_band, member_count")
      .eq("household_id", householdId)
      .order("member_kind")
      .order("age_band"),
    client
      .from("household_food_rules")
      .select("household_id, rule_code")
      .eq("household_id", householdId)
      .order("rule_code")
  ])
  expect(parent.error).toBeNull()
  expect(members.error).toBeNull()
  expect(rules.error).toBeNull()
  return { parent: parent.data, members: members.data, rules: rules.data }
}

describe("local household Supabase integration", () => {
  it("creates, loads, edits one household through the strict adapter and enforces cross-owner RLS", async () => {
    const owner = await createIdentity("owner")
    const stranger = await createIdentity("stranger")
    const repository = createSupabaseHouseholdRepository(owner.client)

    const created = await repository.saveOwn(setupInput, null)
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error(`Create failed: ${created.reason}`)
    expect(created.household).toMatchObject({
      memberGroups: setupInput.memberGroups,
      weeklyPlanBudgetVnd: 1_000_000,
      maxElapsedMinutes: 30,
      ruleCodes: ["allergen_peanut", "prefer_soup"],
      version: 1
    })
    await expect(repository.loadOwn()).resolves.toEqual(created.household)

    const secondCreate = await repository.saveOwn(setupInput, null)
    expect(secondCreate.ok).toBe(false)
    const stale = await repository.saveOwn({ ...setupInput, weeklyPlanBudgetVnd: 1_100_000 }, 99)
    expect(stale).toEqual({ ok: false, reason: "STALE_HOUSEHOLD_VERSION" })

    const edited = await repository.saveOwn(
      { ...setupInput, weeklyPlanBudgetVnd: 1_100_000 },
      created.household.version
    )
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw new Error(`Edit failed: ${edited.reason}`)
    expect(edited.household.version).toBe(2)

    const hiddenParents = await stranger.client.from("households").select("id")
    const hiddenMembers = await stranger.client.from("household_member_groups").select("id")
    const hiddenRules = await stranger.client.from("household_food_rules").select("rule_code")
    expect(hiddenParents).toMatchObject({ data: [], error: null })
    expect(hiddenMembers).toMatchObject({ data: [], error: null })
    expect(hiddenRules).toMatchObject({ data: [], error: null })

    const crossUpdate = await stranger.client
      .from("households")
      .update({ weekly_plan_budget_vnd: 50_000 })
      .eq("id", created.household.householdId)
      .select("id")
    expect(crossUpdate).toMatchObject({ data: [], error: null })
    const crossChild = await stranger.client.from("household_member_groups").insert({
      household_id: created.household.householdId,
      member_kind: "elderly",
      age_band: "elderly",
      member_count: 1
    })
    expect(crossChild.error).not.toBeNull()
  })

  it("allows intended direct writes while authoritative constraints reject invalid states atomically", async () => {
    const owner = await createIdentity("direct-owner")
    const other = await createIdentity("direct-other")

    const parentInsert = await owner.client
      .from("households")
      .insert({
        owner_user_id: owner.userId,
        weekly_plan_budget_vnd: 800_000,
        max_elapsed_minutes: 45
      })
      .select("id, version, onboarding_completed_at")
      .single()
    expect(parentInsert.error).toBeNull()
    const householdId = parentInsert.data?.id
    if (householdId === undefined) throw new Error("Direct household insert returned no id")

    const invalidCompletion = await owner.client
      .from("households")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", householdId)
    expect(invalidCompletion.error).not.toBeNull()
    const unchanged = await owner.client
      .from("households")
      .select("version, onboarding_completed_at")
      .eq("id", householdId)
      .single()
    expect(unchanged.data).toEqual({ version: 1, onboarding_completed_at: null })

    const memberInsert = await owner.client.from("household_member_groups").insert({
      household_id: householdId,
      member_kind: "adult",
      age_band: "adult",
      member_count: 1
    })
    expect(memberInsert.error).toBeNull()
    const validCompletion = await owner.client
      .from("households")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", householdId)
    expect(validCompletion.error).toBeNull()

    const validBudget = await owner.client
      .from("households")
      .update({ weekly_plan_budget_vnd: 850_000 })
      .eq("id", householdId)
    expect(validBudget.error).toBeNull()
    const validRule = await owner.client
      .from("household_food_rules")
      .insert({ household_id: householdId, rule_code: "prefer_tofu" })
    expect(validRule.error).toBeNull()
    const removeRule = await owner.client
      .from("household_food_rules")
      .delete()
      .eq("household_id", householdId)
      .eq("rule_code", "prefer_tofu")
    expect(removeRule.error).toBeNull()

    const conflictingRules = await owner.client.from("household_food_rules").insert([
      { household_id: householdId, rule_code: "exclude_pork" },
      { household_id: householdId, rule_code: "prefer_pork" }
    ])
    expect(conflictingRules.error).not.toBeNull()
    const conflictRows = await owner.client
      .from("household_food_rules")
      .select("rule_code")
      .eq("household_id", householdId)
      .in("rule_code", ["exclude_pork", "prefer_pork"])
    expect(conflictRows.data).toEqual([])

    const tooMany = await owner.client.from("household_member_groups").insert({
      household_id: householdId,
      member_kind: "elderly",
      age_band: "elderly",
      member_count: 20
    })
    expect(tooMany.error).not.toBeNull()
    const deleteFinalMember = await owner.client
      .from("household_member_groups")
      .delete()
      .eq("household_id", householdId)
    expect(deleteFinalMember.error).not.toBeNull()

    const ownerChange = await owner.client
      .from("households")
      .update({ owner_user_id: other.userId })
      .eq("id", householdId)
    expect(ownerChange.error).not.toBeNull()
    const secondHousehold = await owner.client.from("households").insert({
      owner_user_id: owner.userId,
      weekly_plan_budget_vnd: 900_000,
      max_elapsed_minutes: 30
    })
    expect(secondHousehold.error).not.toBeNull()

    const immutableOption = await owner.client
      .from("household_rule_options")
      .update({ label_vi: "Không được phép" })
      .eq("code", "prefer_tofu")
    expect(immutableOption.error).not.toBeNull()
    const options = await owner.client
      .from("household_rule_options")
      .select("code, rule_kind")
      .order("sort_order")
    expect(options.error).toBeNull()
    expect(options.data?.length).toBeGreaterThan(20)
  })

  it("rolls back an RPC request that reaches the database hard/soft conflict trigger", async () => {
    const owner = await createIdentity("rpc-atomic")
    const repository = createSupabaseHouseholdRepository(owner.client)
    const created = await repository.saveOwn(setupInput, null)
    if (!created.ok) throw new Error(`Create failed: ${created.reason}`)
    const before = await snapshot(owner.client, created.household.householdId)

    const rpc = await owner.client.rpc("save_household_setup", {
      p_expected_version: created.household.version,
      p_weekly_plan_budget_vnd: 1_900_000,
      p_max_elapsed_minutes: 90,
      p_member_groups: [
        { member_kind: "adult", age_band: "adult", member_count: 5 }
      ] satisfies Json,
      p_rule_codes: ["exclude_pork", "prefer_pork"]
    })
    expect(rpc.error).not.toBeNull()

    const after = await snapshot(owner.client, created.household.householdId)
    expect(after).toEqual(before)
  })
})
