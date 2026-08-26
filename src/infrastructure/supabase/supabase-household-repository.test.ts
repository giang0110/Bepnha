import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import type { HouseholdSetupInput } from "@/domain/household/household"

import type { Database } from "./database.types"
import { createSupabaseHouseholdRepository } from "./supabase-household-repository"

const normalizedInput: HouseholdSetupInput = {
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 1_500_000,
  maxElapsedMinutes: 30,
  ruleCodes: ["exclude_beef"]
}

function clientWithLoad(response: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(() => Promise.resolve(response))
  const select = vi.fn((columns: string) => ({ maybeSingle, selectedColumns: columns }))
  const from = vi.fn(() => ({ select }))
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    select
  }
}

describe("Supabase household repository load", () => {
  it("selects only household setup columns with canonical options and maps safe VND", async () => {
    const { client, from, select } = clientWithLoad({
      data: {
        id: "household-a",
        weekly_plan_budget_vnd: "1500000",
        max_elapsed_minutes: 30,
        onboarding_completed_at: "2026-08-26T00:00:00Z",
        version: 2,
        household_member_groups: [{ member_kind: "adult", age_band: "adult", member_count: 2 }],
        household_food_rules: [
          {
            rule_code: "exclude_beef",
            household_rule_options: {
              code: "exclude_beef",
              target_key: "beef",
              rule_kind: "food_exclusion",
              label_vi: "Không dùng thịt bò",
              sort_order: 13
            }
          }
        ]
      },
      error: null
    })

    await expect(createSupabaseHouseholdRepository(client).loadOwn()).resolves.toEqual({
      householdId: "household-a",
      ...normalizedInput,
      version: 2,
      onboardingCompletedAt: "2026-08-26T00:00:00Z"
    })
    expect(from).toHaveBeenCalledWith("households")
    expect(select).toHaveBeenCalledOnce()
    expect(select.mock.calls[0]?.[0]).toMatch(/household_rule_options/)
    expect(select.mock.calls[0]?.[0]).not.toMatch(/owner_user_id|created_at|updated_at/)
  })

  it("returns null for no row and rejects malformed/unsafe stored data", async () => {
    await expect(
      createSupabaseHouseholdRepository(
        clientWithLoad({ data: null, error: null }).client
      ).loadOwn()
    ).resolves.toBeNull()

    const malformed = clientWithLoad({
      data: {
        id: "household-a",
        weekly_plan_budget_vnd: "9007199254740992",
        max_elapsed_minutes: 30,
        onboarding_completed_at: "2026-08-26T00:00:00Z",
        version: 2,
        household_member_groups: [],
        household_food_rules: []
      },
      error: null
    })
    await expect(
      createSupabaseHouseholdRepository(malformed.client).loadOwn()
    ).rejects.toMatchObject({ code: "INVALID_STORED_DATA" })
  })
})

describe("Supabase household repository save", () => {
  it.each([null, 4])(
    "calls the atomic RPC with exact normalized args for version %s",
    async (version) => {
      const rpc = vi.fn(() =>
        Promise.resolve({
          data: {
            id: "household-a",
            weekly_plan_budget_vnd: 1_500_000,
            max_elapsed_minutes: 30,
            onboarding_completed_at: "2026-08-26T00:00:00Z",
            version: version ?? 1
          },
          error: null
        })
      )
      const client = { rpc } as unknown as SupabaseClient<Database>

      await expect(
        createSupabaseHouseholdRepository(client).saveOwn(normalizedInput, version)
      ).resolves.toMatchObject({ ok: true, household: { householdId: "household-a" } })
      expect(rpc).toHaveBeenCalledWith("save_household_setup", {
        p_expected_version: version,
        p_weekly_plan_budget_vnd: 1_500_000,
        p_max_elapsed_minutes: 30,
        p_member_groups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
        p_rule_codes: ["exclude_beef"]
      })
    }
  )

  it.each([
    [{ code: "P0001", message: "STALE_HOUSEHOLD_VERSION" }, "STALE_HOUSEHOLD_VERSION"],
    [{ code: "42501", message: "permission denied sensitive detail" }, "UNAUTHORIZED"],
    [{ code: "08006", message: "database host and token" }, "DEPENDENCY_UNAVAILABLE"]
  ] as const)("translates Supabase failures without leaking raw text", async (error, reason) => {
    const client = {
      rpc: vi.fn(() => Promise.resolve({ data: null, error }))
    } as unknown as SupabaseClient<Database>

    const result = await createSupabaseHouseholdRepository(client).saveOwn(normalizedInput, 2)

    expect(result).toEqual({ ok: false, reason })
    expect(JSON.stringify(result)).not.toMatch(/permission|database|host|token|detail/i)
  })
})
