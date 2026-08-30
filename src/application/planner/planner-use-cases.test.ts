import { createHash } from "node:crypto"

import { describe, expect, test, vi } from "vitest"

import type { ContentHasher } from "@/application/shared/content-hasher"
import { PLANNER_ENGINE_VERSION } from "@/domain/planner/planner-engine-version"
import { evaluatePlannerEligibility } from "@/domain/planner/evaluate-eligibility"
import { normalizePlannerInput } from "@/domain/planner/normalize-planner-input"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"
import { searchWeek } from "@/domain/planner/search-week"

import {
  applyMealReplacement,
  generateMealPlan,
  previewMealReplacementUseCase,
  type PlannerRepository
} from "./planner-use-cases"

const hasher: ContentHasher = {
  sha256(value) {
    return Promise.resolve(createHash("sha256").update(value).digest("hex"))
  }
}

function generationInput(count = 8) {
  return plannerInput(
    Array.from({ length: count }, (_, index) => plannerCandidate(`use-case-${index}-v1`))
  )
}

function readyPlan() {
  const input = generationInput()
  const normalized = normalizePlannerInput(input)
  if (!normalized.ok) throw new Error("invalid fixture")
  const eligibility = evaluatePlannerEligibility(normalized.value)
  if (!eligibility.ok) throw new Error("ineligible fixture")
  const plan = searchWeek(
    eligibility.value.eligible.slice(0, 7),
    input.weeklyPlanBudgetVnd,
    [],
    input.calculationDate
  )
  if (!("plan" in plan)) throw new Error("plan unavailable")
  return plan.plan
}

function repository(overrides: Partial<PlannerRepository> = {}): PlannerRepository {
  return {
    loadGenerationInput: vi.fn().mockResolvedValue({ ok: true, value: generationInput() }),
    loadReplacementInput: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        input: generationInput(),
        currentPlan: readyPlan(),
        planVersion: 1,
        currentRevisionId: "revision-1",
        householdSetupVersion: 1,
        householdInputFingerprint: "household-fingerprint"
      }
    }),
    persistRevision: vi.fn().mockResolvedValue({
      ok: true,
      value: { planId: "plan-1", revisionId: "revision-2", planVersion: 2, idempotent: false }
    }),
    ...overrides
  }
}

describe("planner use cases", () => {
  test("generates v2 authoritative evidence including the shopping projection before persistence", async () => {
    const repo = repository()
    const result = await generateMealPlan(repo, hasher, {
      actorUserId: "user-1",
      householdId: "household-1",
      weekStart: "2026-08-31",
      calculationDate: "2026-08-26",
      idempotencyKey: "00000000-0000-0000-0000-000000000001"
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("generation failed")
    expect(result.value.plan.items).toHaveLength(7)
    expect(result.value.catalogFingerprint).toMatch(/^[0-9a-f]{64}$/u)
    expect(result.value.inputFingerprint).toMatch(/^[0-9a-f]{64}$/u)
    expect(result.value.calculationFingerprint).toMatch(/^[0-9a-f]{64}$/u)
    expect(repo.loadGenerationInput).toHaveBeenCalledWith({
      actorUserId: "user-1",
      householdId: "household-1",
      weekStart: "2026-08-31",
      calculationDate: "2026-08-26"
    })
    expect(repo.persistRevision).toHaveBeenCalledOnce()
    const persisted = vi.mocked(repo.persistRevision).mock.calls[0]?.[0]
    expect(persisted?.revisionKind).toBe("generation")
    expect(persisted?.engineVersion).toBe(PLANNER_ENGINE_VERSION)
    expect(persisted?.inputSnapshot).toMatchObject({ engineVersion: PLANNER_ENGINE_VERSION })
    expect(persisted?.calculationSnapshot.purchaseBasket.lines).toHaveLength(7)
    expect(persisted?.calculationSnapshot.shoppingList.lines).toHaveLength(7)
    expect(persisted?.calculationSnapshot.shoppingList.totalEstimatedCostVnd).toBe(
      persisted?.totalEstimatedCostVnd
    )
  })

  test("never persists a fatal eligibility/search outcome", async () => {
    const repo = repository({
      loadGenerationInput: vi.fn().mockResolvedValue({ ok: true, value: generationInput(6) })
    })
    const result = await generateMealPlan(repo, hasher, {
      actorUserId: "user-1",
      householdId: "household-1",
      weekStart: "2026-08-31",
      calculationDate: "2026-08-26",
      idempotencyKey: "00000000-0000-0000-0000-000000000001"
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: "NO_COMPLETE_PLAN_FOUND_IN_DETERMINISTIC_SEARCH" }
    })
    expect(repo.persistRevision).not.toHaveBeenCalled()
  })

  test("previews without writing, then apply recomputes and persists one v2 replacement revision", async () => {
    const repo = repository()
    const command = {
      actorUserId: "user-1",
      planId: "plan-1",
      targetDayIndex: 2,
      expectedPlanVersion: 1,
      expectedCurrentRevisionId: "revision-1"
    }
    const preview = await previewMealReplacementUseCase(repo, hasher, command)
    expect(preview.ok).toBe(true)
    expect(repo.persistRevision).not.toHaveBeenCalled()
    if (!preview.ok) throw new Error("preview unavailable")
    expect(preview.value.previewFingerprint).toMatch(/^[0-9a-f]{64}$/u)
    expect(preview.value.evidence.inputSnapshot).toMatchObject({ engineVersion: PLANNER_ENGINE_VERSION })
    expect(preview.value.evidence.calculationSnapshot.shoppingList.lines.length).toBeGreaterThan(0)

    const applied = await applyMealReplacement(repo, hasher, {
      ...command,
      previewFingerprint: preview.value.previewFingerprint,
      idempotencyKey: "00000000-0000-0000-0000-000000000002"
    })
    expect(applied).toMatchObject({ ok: true })
    expect(repo.loadReplacementInput).toHaveBeenCalledTimes(2)
    const persisted = vi.mocked(repo.persistRevision).mock.calls[0]?.[0]
    expect(persisted?.revisionKind).toBe("replacement")
    expect(persisted?.engineVersion).toBe(PLANNER_ENGINE_VERSION)
    expect(persisted?.parentRevisionId).toBe("revision-1")
    expect(persisted?.replacementDayIndex).toBe(2)
  })

  test("rejects stale plan tokens, household changes, and preview/apply fingerprint conflicts", async () => {
    const stale = repository()
    await expect(
      previewMealReplacementUseCase(stale, hasher, {
        actorUserId: "user-1",
        planId: "plan-1",
        targetDayIndex: 2,
        expectedPlanVersion: 99,
        expectedCurrentRevisionId: "revision-1"
      })
    ).resolves.toEqual({ ok: false, error: { code: "STALE_PLAN_VERSION" } })

    const changed = repository({
      loadReplacementInput: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          input: generationInput(),
          currentPlan: readyPlan(),
          planVersion: 1,
          currentRevisionId: "revision-1",
          householdSetupVersion: 2,
          householdInputFingerprint: "changed"
        }
      })
    })
    await expect(
      previewMealReplacementUseCase(changed, hasher, {
        actorUserId: "user-1",
        planId: "plan-1",
        targetDayIndex: 2,
        expectedPlanVersion: 1,
        expectedCurrentRevisionId: "revision-1",
        expectedHouseholdSetupVersion: 1
      })
    ).resolves.toEqual({ ok: false, error: { code: "PLAN_INPUT_CHANGED_REGENERATION_REQUIRED" } })

    const conflict = repository()
    await expect(
      applyMealReplacement(conflict, hasher, {
        actorUserId: "user-1",
        planId: "plan-1",
        targetDayIndex: 2,
        expectedPlanVersion: 1,
        expectedCurrentRevisionId: "revision-1",
        previewFingerprint: "a".repeat(64),
        idempotencyKey: "00000000-0000-0000-0000-000000000002"
      })
    ).resolves.toEqual({ ok: false, error: { code: "STALE_PLAN_VERSION" } })
    expect(conflict.persistRevision).not.toHaveBeenCalled()
  })
})
