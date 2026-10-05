import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"

import type { Database } from "@/infrastructure/supabase/database.types"
import { storedLegacyRevision as storedRevision } from "@/test/stored-legacy-plan-fixture"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"

import { createSupabasePlannerInputLoader } from "./supabase-planner-input-loader"
import {
  createSupabasePlannerRepository,
  createSupabasePlannerRepositoryV2
} from "./supabase-planner-repository"

const request = {
  actorUserId: "owner",
  householdId: "household-1",
  weekStart: "2026-08-31"
}

function repositories(raw: unknown) {
  const rpc = vi.fn((name: string) =>
    Promise.resolve(
      name === "get_current_plan_for_week" || name === "get_plan_revision_for_owner"
        ? { data: raw, error: null }
        : { data: null, error: { code: "08000" } }
    )
  )
  const from = vi.fn(() => {
    throw new Error("Live catalog unavailable")
  })
  const client = { rpc, from } as unknown as SupabaseClient<Database>
  const legacyLoader = createSupabasePlannerInputLoader(client)
  const hydrateReplacement = vi.spyOn(legacyLoader, "hydrateReplacement")
  const secretClientFactory = vi.fn()
  const legacy = createSupabasePlannerRepository({
    userClient: { rpc },
    secretClientFactory,
    loader: legacyLoader
  })
  const versioned = createSupabasePlannerRepositoryV2({
    userClient: { rpc },
    secretClientFactory,
    legacyRepository: legacy,
    loader: { hydrateGeneration: vi.fn(), hydrateReplacement: vi.fn(), readStored: vi.fn() }
  })
  return { rpc, from, hydrateReplacement, secretClientFactory, legacy, versioned }
}

describe("stored legacy plan reads", () => {
  test.each(["3", "999999999999.999999"])(
    "round-trips the unrounded serving factor for yield %s",
    async (yieldAdultEquivalent) => {
      const input = plannerInput(
        Array.from({ length: 7 }, (_, index) => {
          const candidate = plannerCandidate(`serving-${index}-v1`)
          return {
            ...candidate,
            mealOption: {
              ...candidate.mealOption,
              yieldAdultEquivalent,
              components: candidate.mealOption.components.map((component) => ({
                ...component,
                recipe: {
                  ...component.recipe,
                  yieldAdultEquivalent,
                  ingredients: component.recipe.ingredients.map((ingredient) => ({
                    ...ingredient,
                    quantity: yieldAdultEquivalent
                  }))
                }
              }))
            }
          }
        })
      )
      const stored = storedRevision(input)
      const factor = stored.revision.calculation_snapshot.items[0]!.scaleFactor
      expect(factor.split(".")[1]!.length).toBeGreaterThan(yieldAdultEquivalent === "3" ? 18 : 80)
      const before = JSON.stringify(stored)
      const { legacy } = repositories(stored)
      const result = await legacy.loadCurrentPlan(request)
      expect(result).toMatchObject({ ok: true })
      if (!result.ok || result.value === null) throw new Error("Expected stored serving factor")
      expect(result.value.plan.items[0]!.scaleFactor).toBe(factor)
      expect(result.value.plan.selected[0]!.mealScaleFactor).toBe(factor)
      expect(JSON.stringify(stored)).toBe(before)
    }
  )

  test("round-trips calculated nutrition with more precision than catalog inputs", async () => {
    const input = {
      ...plannerInput(
        Array.from({ length: 7 }, (_, index) => {
          const candidate = plannerCandidate(`precise-${index}-v1`)
          return {
            ...candidate,
            ingredientLineage: candidate.ingredientLineage.map((line) => ({
              ...line,
              edibleFraction: "0.987654",
              nutrients: line.nutrients.map((nutrient) => ({
                ...nutrient,
                amountPer100g: "0.123457"
              }))
            })),
            mealOption: {
              ...candidate.mealOption,
              components: candidate.mealOption.components.map((component) => ({
                ...component,
                recipe: {
                  ...component.recipe,
                  ingredients: component.recipe.ingredients.map((ingredient) => ({
                    ...ingredient,
                    quantity: "400.123457"
                  }))
                }
              }))
            }
          }
        })
      ),
      memberGroups: [
        { memberKind: "adult" as const, ageBand: "adult" as const, memberCount: 2 },
        { memberKind: "child" as const, ageBand: "4_6" as const, memberCount: 1 }
      ]
    }
    const stored = storedRevision(input)
    const expected =
      stored.revision.calculation_snapshot.selectedMealOptions[0]!.nutrition.nutrients[0]!.rawAmount
    expect(expected).toBe("0.6220492109631503626365")
    const before = JSON.stringify(stored)
    const { legacy, rpc } = repositories(stored)
    const result = await legacy.loadCurrentPlan(request)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok || result.value === null) throw new Error("Expected stored calculated nutrition")
    expect(result.value.plan.selected[0]!.nutrition.nutrients[0]!.rawAmount).toBe(expected)
    expect(JSON.stringify(stored)).toBe(before)
    expect(rpc).toHaveBeenCalledOnce()
  })

  test("reads pre-pantry and pre-condition snapshots without inventing the absent fields", async () => {
    const stored = structuredClone(storedRevision())
    stored.revision.engine_version = "planner-engine-v1"
    const calculation = stored.revision.calculation_snapshot
    for (const line of [
      ...calculation.purchaseBasket.lines,
      ...calculation.selectedMealOptions.flatMap((meal) => meal.basketLines)
    ]) {
      delete (line as unknown as Record<string, unknown>).pantryDeductedBaseQuantity
      delete (line as unknown as Record<string, unknown>).purchaseRequiredBaseQuantity
    }
    for (const meal of [
      ...calculation.selectedMealOptions,
      ...calculation.items.map((item) => item.snapshot)
    ]) {
      for (const component of meal.mealOption.components) {
        for (const step of component.recipe.steps) {
          delete (step as unknown as Record<string, unknown>).heatLevel
          delete (step as unknown as Record<string, unknown>).temperatureCelsius
        }
      }
      for (const line of meal.basketLines) {
        delete (line as unknown as Record<string, unknown>).pantryDeductedBaseQuantity
        delete (line as unknown as Record<string, unknown>).purchaseRequiredBaseQuantity
      }
    }
    const before = JSON.stringify(stored)
    const { legacy } = repositories(stored)
    expect(await legacy.loadCurrentPlan(request)).toMatchObject({
      ok: true,
      value: { revisionId: "historical-revision" }
    })
    expect(JSON.stringify(stored)).toBe(before)
  })
  test.each([1, 2, 3, 4, 5])(
    "reads a stored v%i week with live generation unavailable",
    async (version) => {
      const stored = storedRevision()
      stored.revision.engine_version = `planner-engine-v${version}`
      const { legacy, rpc, from, hydrateReplacement, secretClientFactory } = repositories(stored)
      const before = JSON.stringify(stored)
      const result = await legacy.loadCurrentPlan(request)
      expect(result).toMatchObject({
        ok: true,
        value: {
          revisionId: "historical-revision",
          planVersion: 2,
          householdSetupVersion: 1,
          budgetVnd: 700_000,
          plan: { items: stored.revision.calculation_snapshot.items },
          trust: { calculationDate: "2026-08-26", adultEquivalent: "2", stalePriceCount: 7 }
        }
      })
      expect(JSON.stringify(stored)).toBe(before)
      expect(rpc).toHaveBeenCalledOnce()
      expect(hydrateReplacement).not.toHaveBeenCalled()
      expect(from).not.toHaveBeenCalled()
      expect(secretClientFactory).not.toHaveBeenCalled()
    }
  )

  test.each([undefined, "historical-revision"])(
    "returns the owner-scoped legacy revision %s without refetching current",
    async (revisionId) => {
      const stored = storedRevision()
      const { versioned, rpc } = repositories(stored)
      const result = await versioned.loadCurrentPlan({
        ...request,
        ...(revisionId ? { revisionId } : {})
      })
      expect(result).toMatchObject({
        ok: true,
        value: { revisionId: "historical-revision", planVersion: 2 }
      })
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        revisionId ? "get_plan_revision_for_owner" : "get_current_plan_for_week",
        {
          p_household_id: request.householdId,
          p_week_start: request.weekStart,
          ...(revisionId ? { p_revision_id: revisionId } : {})
        }
      )
    }
  )

  test.each([
    [
      "duplicate day",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(raw.revision.calculation_snapshot.items[1] as { dayIndex: number }).dayIndex = 0
      }
    ],
    [
      "missing day",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(raw.revision.calculation_snapshot.items as unknown[]).pop()
      }
    ],
    [
      "wrong selected count",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(raw.revision.calculation_snapshot.selectedMealOptions as unknown[]).pop()
      }
    ],
    [
      "mismatched identity",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(
          raw.revision.calculation_snapshot.items[0] as { mealOptionVersionId: string }
        ).mealOptionVersionId = "other"
      }
    ],
    [
      "invalid serving",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(
          raw.revision.calculation_snapshot.items[0] as { adultEquivalent: string }
        ).adultEquivalent = "NaN"
      }
    ],
    [
      "missing recipe",
      (raw: ReturnType<typeof storedRevision>) => {
        delete (
          raw.revision.calculation_snapshot.items[0]!.snapshot as unknown as Record<string, unknown>
        ).mealOption
      }
    ],
    [
      "invalid nutrient",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(
          raw.revision.calculation_snapshot.items[0]!.snapshot.nutrition.nutrients[0] as {
            displayAmount: string
          }
        ).displayAmount = "NaN"
      }
    ],
    [
      "invalid purchase quantity",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(
          raw.revision.calculation_snapshot.purchaseBasket.lines[0] as {
            purchaseBaseQuantity: string
          }
        ).purchaseBaseQuantity = "-1"
      }
    ],
    [
      "negative cost",
      (raw: ReturnType<typeof storedRevision>) => {
        raw.revision.total_estimated_cost_vnd = -1
      }
    ],
    [
      "invalid warning",
      (raw: ReturnType<typeof storedRevision>) => {
        ;(raw.revision.warnings as unknown[]).push({ code: "STALE_PRICE" })
      }
    ],
    [
      "invalid date",
      (raw: ReturnType<typeof storedRevision>) => {
        raw.revision.calculation_date = "2026-02-30"
      }
    ],
    [
      "invalid revision version",
      (raw: ReturnType<typeof storedRevision>) => {
        raw.revision.revision_number = 0
      }
    ],
    [
      "invalid engine",
      (raw: ReturnType<typeof storedRevision>) => {
        raw.revision.engine_version = "unrecognized"
      }
    ]
  ] as const)("fails safely for %s in an immutable snapshot", async (_, corrupt) => {
    const stored = structuredClone(storedRevision())
    corrupt(stored)
    const { legacy, versioned, rpc, from } = repositories(stored)
    for (const repo of [legacy, versioned]) {
      expect(await repo.loadCurrentPlan(request)).toEqual({
        ok: false,
        error: { code: "TRANSIENT_DEPENDENCY_FAILURE" }
      })
    }
    expect(rpc.mock.calls.every(([name]) => name === "get_current_plan_for_week")).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })
})
