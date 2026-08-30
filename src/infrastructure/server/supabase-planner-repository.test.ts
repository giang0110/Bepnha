import { describe, expect, test, vi } from "vitest"

import type { PersistPlannerRevisionCommand } from "@/application/planner/planner-use-cases"
import { PLANNER_ENGINE_VERSION } from "@/domain/planner/planner-engine-version"
import { plannerInput } from "@/domain/planner/planner-test-fixture"

import { createSupabasePlannerRepository } from "./supabase-planner-repository"

const success = <T>(data: T) => Promise.resolve({ data, error: null })

function command(): PersistPlannerRevisionCommand {
  return {
    actorUserId: "10000000-0000-0000-0000-000000000001",
    householdId: "20000000-0000-0000-0000-000000000001",
    weekStart: "2026-08-31",
    expectedPlanVersion: 0,
    parentRevisionId: null,
    idempotencyKey: "30000000-0000-0000-0000-000000000001",
    revisionKind: "generation",
    replacementDayIndex: null,
    householdSetupVersion: 1,
    engineVersion: PLANNER_ENGINE_VERSION,
    portionConfigVersion: "portion-v1",
    priceFreshnessConfigVersion: "price-freshness-v1",
    plannerConfigVersion: "planner-v1",
    calculationDate: "2026-08-26",
    catalogFingerprint: "a".repeat(64),
    inputFingerprint: "b".repeat(64),
    calculationFingerprint: "c".repeat(64),
    inputSnapshot: { input: true, engineVersion: PLANNER_ENGINE_VERSION },
    calculationSnapshot: {
      purchaseBasket: { lines: [], warnings: [], totalEstimatedCostVnd: 0 },
      shoppingList: {
        version: "shopping-list-v1",
        groceryCategoryConfigVersion: "grocery-category-v1",
        lines: [],
        totalEstimatedCostVnd: 0,
        warnings: []
      }
    },
    budgetVnd: 700_000,
    totalEstimatedCostVnd: 0,
    budgetStatus: "within",
    overageVnd: 0,
    warnings: [],
    items: []
  }
}

describe("Supabase planner repository", () => {
  test("loads through the owner-scoped RPC before a secret client can be constructed", async () => {
    const order: string[] = []
    const userClient = {
      rpc: vi.fn(() => {
        order.push("owner-read")
        return success({ household: { id: "household" } })
      })
    }
    const hydrateGeneration = vi.fn(() => {
      order.push("hydrate")
      return Promise.resolve(plannerInput())
    })
    const secretClientFactory = vi.fn(() => {
      order.push("secret-client")
      return { rpc: vi.fn() }
    })
    const repository = createSupabasePlannerRepository({
      userClient,
      secretClientFactory,
      loader: { hydrateGeneration, hydrateReplacement: vi.fn() }
    })

    await expect(
      repository.loadGenerationInput({
        actorUserId: "user-1",
        householdId: "household-1",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26"
      })
    ).resolves.toEqual({ ok: true, value: plannerInput() })
    expect(userClient.rpc).toHaveBeenCalledWith("get_planner_generation_input", {
      p_household_id: "household-1",
      p_week_start: "2026-08-31",
      p_calculation_date: "2026-08-26"
    })
    expect(order).toEqual(["owner-read", "hydrate"])
    expect(secretClientFactory).not.toHaveBeenCalled()
  })

  test("maps missing/cross-household and dependency failures without hydrating", async () => {
    const loader = { hydrateGeneration: vi.fn(), hydrateReplacement: vi.fn() }
    const missing = createSupabasePlannerRepository({
      userClient: { rpc: vi.fn(() => success(null)) },
      secretClientFactory: vi.fn(),
      loader
    })
    await expect(
      missing.loadGenerationInput({
        actorUserId: "user",
        householdId: "other",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26"
      })
    ).resolves.toEqual({ ok: false, error: { code: "UNAUTHORIZED" } })

    const unavailable = createSupabasePlannerRepository({
      userClient: { rpc: vi.fn(() => Promise.resolve({ data: null, error: { code: "08000" } })) },
      secretClientFactory: vi.fn(),
      loader
    })
    await expect(
      unavailable.loadGenerationInput({
        actorUserId: "user",
        householdId: "mine",
        weekStart: "2026-08-31",
        calculationDate: "2026-08-26"
      })
    ).resolves.toEqual({ ok: false, error: { code: "TRANSIENT_DEPENDENCY_FAILURE" } })
    expect(loader.hydrateGeneration).not.toHaveBeenCalled()
  })

  test("constructs the secret client only for the narrow persistence RPC", async () => {
    const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
      void name
      void args
      return success({
        planId: "40000000-0000-0000-0000-000000000001",
        revisionId: "50000000-0000-0000-0000-000000000001",
        planVersion: 1,
        idempotent: false
      })
    })
    const secretClientFactory = vi.fn(() => ({ rpc }))
    const repository = createSupabasePlannerRepository({
      userClient: { rpc: vi.fn() },
      secretClientFactory,
      loader: { hydrateGeneration: vi.fn(), hydrateReplacement: vi.fn() }
    })
    const input = command()

    await expect(repository.persistRevision(input)).resolves.toMatchObject({
      ok: true,
      value: { planVersion: 1, idempotent: false }
    })
    expect(secretClientFactory).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc.mock.calls[0]?.[0]).toBe("persist_meal_plan_revision")
    const persistedArguments = rpc.mock.calls[0]?.[1]
    expect(persistedArguments).toMatchObject({
      p_actor_user_id: input.actorUserId,
      p_household_id: input.householdId,
      p_week_start: input.weekStart,
      p_expected_plan_version: input.expectedPlanVersion,
      p_expected_current_revision_id: null,
      p_idempotency_key: input.idempotencyKey,
      p_items: []
    })
    const persistedRevision = persistedArguments?.p_revision
    expect(persistedRevision).toMatchObject({
      engineVersion: PLANNER_ENGINE_VERSION,
      calculationDate: "2026-08-26",
      calculationFingerprint: "c".repeat(64)
    })
  })

  test("maps stale and authorization database errors to typed failures", async () => {
    const resultFor = async (error: { code: string; message: string }) => {
      const repository = createSupabasePlannerRepository({
        userClient: { rpc: vi.fn() },
        secretClientFactory: () => ({
          rpc: vi.fn(() => Promise.resolve({ data: null, error }))
        }),
        loader: { hydrateGeneration: vi.fn(), hydrateReplacement: vi.fn() }
      })
      return repository.persistRevision(command())
    }
    await expect(resultFor({ code: "P0001", message: "STALE_PLAN_VERSION" })).resolves.toEqual({
      ok: false,
      error: { code: "STALE_PLAN_VERSION" }
    })
    await expect(
      resultFor({ code: "42501", message: "HOUSEHOLD_OWNERSHIP_REQUIRED" })
    ).resolves.toEqual({ ok: false, error: { code: "UNAUTHORIZED" } })
  })
})
