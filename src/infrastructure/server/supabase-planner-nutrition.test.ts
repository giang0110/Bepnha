import { expect, test, vi } from "vitest"
import { createSupabasePlannerRepositoryV2 } from "./supabase-planner-repository"
import { createSupabasePlannerInputLoaderV2 } from "./supabase-planner-input-loader"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database.types"

test("v6 write preparation reports missing schema rather than hydrating a legacy input", async () => {
  const loader = { hydrateGeneration: vi.fn(), hydrateReplacement: vi.fn(), readStored: vi.fn() }
  const rpc = vi.fn().mockResolvedValue({ data: {}, error: { code: "42883" } })
  const repo = createSupabasePlannerRepositoryV2({
    userClient: { rpc },
    secretClientFactory: () => ({ rpc }),
    loader,
    legacyRepository: {} as never
  })
  expect(
    await repo.loadGenerationInput({
      actorUserId: "owner",
      householdId: "hh",
      weekStart: "2026-08-31",
      calculationDate: "2026-08-26"
    })
  ).toEqual({ ok: false, error: { code: "DEPENDENCY_SCHEMA_NOT_READY" } })
  expect(loader.hydrateGeneration).not.toHaveBeenCalled()
})
test("current v6 uses the stored revision with no catalog or body reconstruction", async () => {
  const view = { revisionId: "stored", plan: { items: [], totalEstimatedCostVnd: 123 } }
  const loader = {
    hydrateGeneration: vi.fn(),
    hydrateReplacement: vi.fn(),
    readStored: vi.fn().mockReturnValue(view)
  }
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { revision: { engine_version: "planner-engine-v6" } }, error: null })
  const repo = createSupabasePlannerRepositoryV2({
    userClient: { rpc },
    secretClientFactory: () => ({ rpc }),
    loader,
    legacyRepository: {} as never
  })
  expect(
    await repo.loadCurrentPlan({
      actorUserId: "owner",
      householdId: "hh",
      weekStart: "2026-08-31",
      revisionId: "stored"
    })
  ).toEqual({ ok: true, value: view })
  expect(rpc).toHaveBeenCalledWith("get_plan_revision_for_owner", {
    p_household_id: "hh",
    p_week_start: "2026-08-31",
    p_revision_id: "stored"
  })
  expect(loader.hydrateReplacement).not.toHaveBeenCalled()
})
test("nutrition loader rejects an old generation projection before any catalog access", async () => {
  const from = vi.fn()
  const loader = createSupabasePlannerInputLoaderV2({ from } as unknown as SupabaseClient<Database>)
  await expect(loader.hydrateGeneration({}, {} as never)).rejects.toMatchObject({
    code: "DEPENDENCY_SCHEMA_NOT_READY"
  })
  expect(from).not.toHaveBeenCalled()
})
