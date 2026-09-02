import { describe, expect, test, vi } from "vitest"

import type { ReplacementAuthoritativeInput } from "@/application/planner/planner-use-cases"
import type { PlannerInputLoader, PlannerRpcClient } from "@/infrastructure/server/supabase-planner-repository"

import { createSupabaseAssistantContextRepository } from "./supabase-assistant-context-repository"

function authoritativeInput(): ReplacementAuthoritativeInput {
  return {
    input: {
      householdId: "household-secret-id",
      householdSetupVersion: 4,
      memberGroups: [{ code: "adult", count: 2, adultEquivalent: "1" }],
      hardRuleCodes: [],
      softPreferenceCodes: [],
      weeklyPlanBudgetVnd: 700_000,
      maxElapsedMinutes: 60,
      weekStart: "2026-09-07",
      timezone: "Asia/Ho_Chi_Minh",
      calculationDate: "2026-09-02",
      portionConfig: {} as never,
      priceFreshnessConfig: {} as never,
      plannerConfig: {} as never,
      pantrySnapshot: { items: [] },
      candidates: []
    },
    currentPlan: {
      items: Array.from({ length: 7 }, (_, dayIndex) => ({
        dayIndex,
        mealSlot: "primary" as const,
        mealOptionId: `meal-secret-${dayIndex}`,
        mealOptionVersionId: `meal-version-secret-${dayIndex}`,
        adultEquivalent: "2",
        scaleFactor: "1",
        snapshot: {
          mealOptionId: `meal-secret-${dayIndex}`,
          mealOptionVersionId: `meal-version-secret-${dayIndex}`,
          mealOptionNameVi: `Bữa số ${dayIndex + 1}`,
          elapsedMinutes: 25 + dayIndex
        } as never
      })),
      selected: [],
      purchaseBasket: {
        lines: [],
        warnings: [
          {
            code: "STALE_PRICE",
            foodId: "food-secret-id",
            foodPriceId: "price-secret-id",
            observedAt: "2026-07-01",
            ageDays: 63
          }
        ],
        totalEstimatedCostVnd: 710_000
      },
      totalEstimatedCostVnd: 710_000,
      score: {} as never,
      stableIdSequence: "meal-secret-sequence",
      frontierMetrics: []
    },
    planVersion: 3,
    currentRevisionId: "revision-secret-id",
    householdSetupVersion: 4,
    householdInputFingerprint: "fingerprint-secret"
  }
}

function rpcClient(result: { data: unknown; error: null | { code?: string; message?: string } }) {
  return {
    rpc: vi.fn(async () => result)
  } satisfies PlannerRpcClient
}

describe("Supabase assistant context repository", () => {
  test("loads only the owner-scoped replacement RPC and projects minimal evidence", async () => {
    const userClient = rpcClient({ data: { opaque: true }, error: null })
    const loader = {
      hydrateGeneration: vi.fn(),
      hydrateReplacement: vi.fn(async () => authoritativeInput())
    } satisfies PlannerInputLoader
    const repository = createSupabaseAssistantContextRepository({ userClient, loader })

    const result = await repository.loadCurrent({
      actorUserId: "actor-secret-id",
      planId: "plan-secret-id"
    })

    expect(userClient.rpc).toHaveBeenCalledOnce()
    expect(userClient.rpc).toHaveBeenCalledWith("get_plan_replacement_input", {
      p_plan_id: "plan-secret-id"
    })
    expect(loader.hydrateReplacement).toHaveBeenCalledWith({ opaque: true }, userClient)
    expect(result).toEqual({
      ok: true,
      value: {
        currentRevisionId: "revision-secret-id",
        evidence: {
          meals: Array.from({ length: 7 }, (_, dayIndex) => ({
            dayIndex,
            dayLabelVi: [
              "Thứ Hai",
              "Thứ Ba",
              "Thứ Tư",
              "Thứ Năm",
              "Thứ Sáu",
              "Thứ Bảy",
              "Chủ Nhật"
            ][dayIndex],
            mealNameVi: `Bữa số ${dayIndex + 1}`,
            elapsedMinutes: 25 + dayIndex
          })),
          budgetStatus: "over",
          totalEstimatedCostVnd: 710_000,
          budgetVnd: 700_000,
          warningCodes: ["PLAN_OVER_BUDGET", "STALE_PRICE"]
        }
      }
    })

    const serializedEvidence = JSON.stringify(result.ok ? result.value.evidence : null)
    for (const forbidden of [
      "actor-secret-id",
      "household-secret-id",
      "plan-secret-id",
      "revision-secret-id",
      "meal-secret-",
      "food-secret-id",
      "price-secret-id",
      "fingerprint-secret",
      "meal-secret-sequence"
    ]) {
      expect(serializedEvidence).not.toContain(forbidden)
    }
  })

  test("maps null owner-scoped data to UNAUTHORIZED", async () => {
    const userClient = rpcClient({ data: null, error: null })
    const loader = { hydrateGeneration: vi.fn(), hydrateReplacement: vi.fn() } satisfies PlannerInputLoader
    const repository = createSupabaseAssistantContextRepository({ userClient, loader })

    await expect(
      repository.loadCurrent({ actorUserId: "actor", planId: "plan" })
    ).resolves.toEqual({ ok: false, error: "UNAUTHORIZED" })
    expect(loader.hydrateReplacement).not.toHaveBeenCalled()
  })

  test("maps RPC and hydration failures to TRANSIENT_DEPENDENCY_FAILURE", async () => {
    const rpcFailure = createSupabaseAssistantContextRepository({
      userClient: rpcClient({ data: null, error: { code: "XX000" } }),
      loader: { hydrateGeneration: vi.fn(), hydrateReplacement: vi.fn() }
    })
    await expect(rpcFailure.loadCurrent({ actorUserId: "actor", planId: "plan" })).resolves.toEqual({
      ok: false,
      error: "TRANSIENT_DEPENDENCY_FAILURE"
    })

    const userClient = rpcClient({ data: { opaque: true }, error: null })
    const hydrationFailure = createSupabaseAssistantContextRepository({
      userClient,
      loader: {
        hydrateGeneration: vi.fn(),
        hydrateReplacement: vi.fn(async () => {
          throw new Error("bad input")
        })
      }
    })
    await expect(
      hydrationFailure.loadCurrent({ actorUserId: "actor", planId: "plan" })
    ).resolves.toEqual({ ok: false, error: "TRANSIENT_DEPENDENCY_FAILURE" })
  })
})
