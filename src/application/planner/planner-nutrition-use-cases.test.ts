import { describe, expect, test, vi } from "vitest"
import { NodeContentHasher } from "../../infrastructure/server/node-content-hasher"
import { plannerCandidateV2, plannerInputV2 } from "../../domain/planner/planner-v2-test-fixture"
import {
  evaluatePlannerEligibilityV2,
  normalizePlannerInputV2,
  searchWeekV2,
  type PlannerInputV2
} from "../../domain/planner/planner-v2"
import type { PlannerRepository } from "./planner-use-cases"
import type { PlannerRepositoryV2 } from "./planner-versioned-repository"
import { createVersionedPlannerUseCases } from "./planner-nutrition-use-cases"
const command = {
  actorUserId: "owner",
  householdId: "household-01",
  weekStart: "2026-08-31",
  calculationDate: "2026-08-26",
  idempotencyKey: "key"
}
function fixture() {
  const input: PlannerInputV2 = {
    ...plannerInputV2(Array.from({ length: 8 }, (_, i) => plannerCandidateV2(`week-${i}-v1`))),
    memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 1 }],
    nutritionSetup: {
      version: "household-nutrition-v1",
      plannedMealSharePercent: 33,
      memberProfiles: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          memberKind: "adult",
          sortOrder: 1,
          label: "Anh",
          heightCm: "170",
          weightKg: "65",
          ageYears: 30,
          sexForEquation: "male",
          activityLevel: "light",
          goal: "maintain"
        }
      ]
    }
  }
  const n = normalizePlannerInputV2(input)
  if (!n.ok) throw new Error(n.error.code)
  const e = evaluatePlannerEligibilityV2(n.value)
  if (!e.ok) throw new Error(e.error.code)
  const p = searchWeekV2(n.value, e.value.eligible)
  if (!("plan" in p)) throw new Error(p.error.code)
  const persist = vi.fn<PlannerRepositoryV2["persistRevision"]>().mockResolvedValue({
    ok: true,
    value: { planId: "plan", revisionId: "new-revision", planVersion: 2, idempotent: false }
  })
  const repository: PlannerRepositoryV2 = {
    loadGenerationInput: vi.fn().mockResolvedValue({ ok: true, value: input }),
    loadReplacementInput: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        engineVersion: "planner-engine-v6",
        input,
        currentPlan: p.plan,
        planVersion: 1,
        currentRevisionId: "revision",
        householdSetupVersion: input.householdSetupVersion
      }
    }),
    loadCurrentPlan: vi.fn().mockResolvedValue({ ok: true, value: null }),
    persistRevision: persist
  }
  const legacyRepository = {
    loadGenerationInput: vi.fn(),
    loadReplacementInput: vi.fn(),
    loadCurrentPlan: vi.fn(),
    persistRevision: vi.fn()
  } as unknown as PlannerRepository
  return {
    input,
    plan: p.plan,
    repository,
    persist,
    useCases: createVersionedPlannerUseCases({
      repository,
      legacyRepository,
      hasher: new NodeContentHasher()
    })
  }
}
describe("versioned nutrition planning", () => {
  test("generation persists private body estimates and actual sources while returning a body-free DTO", async () => {
    const f = fixture()
    const r = await f.useCases.generate(command)
    expect(r.ok).toBe(true)
    expect(f.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        engineVersion: "planner-engine-v6",
        portionConfigVersion: "portion-v2",
        plannerConfigVersion: "planner-v2",
        calculationSnapshot: expect.objectContaining({
          shoppingList: expect.objectContaining({ version: "shopping-list-v2" })
        })
      })
    )
    const stored = f.persist.mock.calls[0]![0]
    expect(JSON.stringify(stored.inputSnapshot)).toContain('"weightKg":"65"')
    expect(JSON.stringify(stored.inputSnapshot)).toContain('"bmi"')
    for (const key of [
      "weightKg",
      "heightCm",
      "sexForEquation",
      "bmi",
      "bmrKcal",
      "tdeeKcal",
      "inputBinding"
    ])
      expect(JSON.stringify(r)).not.toContain(key)
    if (r.ok && "memberPortions" in r.value.plan.items[0]!.snapshot)
      expect(r.value.plan.items[0]!.snapshot.memberPortions[0]!.mealTargetKcal).toBe("711.253125")
  })
  test("current reads stored result without loading generation inputs", async () => {
    const f = fixture()
    expect(await f.useCases.current(command)).toEqual({ ok: true, value: null })
    expect(f.repository.loadGenerationInput).not.toHaveBeenCalled()
  })
  test("replacement preserves six actual snapshots and binds preview/apply", async () => {
    const f = fixture()
    const c = {
      actorUserId: "owner",
      planId: "plan",
      targetDayIndex: 2,
      expectedPlanVersion: 1,
      expectedCurrentRevisionId: "revision"
    }
    const p = await f.useCases.preview(c)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    const r = await f.useCases.apply({
      ...c,
      previewFingerprint: p.value.previewFingerprint,
      idempotencyKey: "replace"
    })
    expect(r.ok).toBe(true)
    const stored = f.persist.mock.calls[0]![0]
    expect(stored.items.filter((i) => i.dayIndex !== 2)).toEqual(
      f.plan.items.filter((i) => i.dayIndex !== 2)
    )
    expect(stored.engineVersion).toBe("planner-engine-v6")
  })
  test("profile or pantry drift requires regeneration before preview", async () => {
    const f = fixture()
    vi.mocked(f.repository.loadReplacementInput).mockResolvedValue({
      ok: true,
      value: {
        engineVersion: "planner-engine-v6",
        input: {
          ...f.input,
          nutritionSetup: {
            ...f.input.nutritionSetup!,
            memberProfiles: f.input.nutritionSetup!.memberProfiles.map((p) => ({
              ...p,
              goal: "gain"
            }))
          }
        },
        currentPlan: f.plan,
        planVersion: 1,
        currentRevisionId: "revision",
        householdSetupVersion: f.input.householdSetupVersion
      }
    })
    expect(
      await f.useCases.preview({
        actorUserId: "owner",
        planId: "plan",
        targetDayIndex: 2,
        expectedPlanVersion: 1
      })
    ).toMatchObject({ ok: false, error: { code: "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED" } })
    expect(f.persist).not.toHaveBeenCalled()
  })
  test("fractional egg pantry needs correction rather than rounding", async () => {
    const f = fixture()
    vi.mocked(f.repository.loadGenerationInput).mockResolvedValue({
      ok: true,
      value: {
        ...f.input,
        pantrySnapshot: {
          version: "pantry-snapshot-v1",
          items: [
            {
              pantryItemId: "stock",
              quantity: "2.4",
              unitId: "item",
              version: 1,
              foodId: "eggs",
              foodFactVersionId: "fact",
              baseUnitId: "item",
              baseDimension: "count",
              baseQuantity: "2.4"
            }
          ]
        }
      }
    })
    expect(await f.useCases.generate(command)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INDIVISIBLE_PANTRY_QUANTITY" }
    })
    expect(f.persist).not.toHaveBeenCalled()
  })
})
