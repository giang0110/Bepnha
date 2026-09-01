import { createHash } from "node:crypto"

import { describe, expect, test, vi } from "vitest"

import type { ContentHasher } from "@/application/shared/content-hasher"
import type { PantrySnapshotV1 } from "@/domain/pantry/pantry"
import { PLANNER_ENGINE_VERSION } from "@/domain/planner/planner-engine-version"
import type { PlannerInputV1 } from "@/domain/planner/planner-input"
import { plannerCandidate, plannerInput } from "@/domain/planner/planner-test-fixture"
import { canonicalJson } from "@/domain/shared/canonical-json"

import { generateMealPlan, type PlannerRepository } from "./planner-use-cases"

const hasher: ContentHasher = {
  sha256(value) {
    return Promise.resolve(createHash("sha256").update(value).digest("hex"))
  }
}

function pantry(baseQuantity: string): PantrySnapshotV1 {
  return {
    version: "pantry-snapshot-v1",
    items: [
      {
        pantryItemId: "pantry-0",
        foodId: "use-case-0-v1-food",
        foodFactVersionId: "use-case-0-v1-fact-v1",
        quantity: baseQuantity,
        unitId: "unit-g",
        baseQuantity,
        baseUnitId: "unit-g",
        baseDimension: "mass",
        version: 1
      }
    ]
  }
}

function input(baseQuantity: string): PlannerInputV1 {
  const candidates = Array.from({ length: 8 }, (_, index) =>
    plannerCandidate(`use-case-${index}-v1`)
  )
  return {
    ...plannerInput(candidates),
    pantrySnapshot: pantry(baseQuantity)
  } as unknown as PlannerInputV1
}

function repository(value: PlannerInputV1): PlannerRepository {
  return {
    loadGenerationInput: vi.fn().mockResolvedValue({ ok: true, value }),
    loadReplacementInput: vi.fn(),
    persistRevision: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        planId: "plan-1",
        revisionId: "revision-1",
        planVersion: 1,
        idempotent: false
      }
    })
  }
}

async function generate(value: PlannerInputV1) {
  const repo = repository(value)
  const result = await generateMealPlan(repo, hasher, {
    actorUserId: "user-1",
    householdId: "household-1",
    weekStart: "2026-08-31",
    calculationDate: "2026-08-26",
    idempotencyKey: "00000000-0000-0000-0000-000000000003"
  })
  if (!result.ok) throw new Error("generation failed")
  return { repo, value: result.value }
}

describe("planner pantry revision evidence", () => {
  test("binds pantry to fingerprints, cost, and immutable evidence", async () => {
    const empty = await generate(input("0"))
    const stocked = await generate(input("800"))

    expect(String(PLANNER_ENGINE_VERSION)).toBe("planner-engine-v3")
    expect(stocked.value.inputFingerprint).not.toBe(empty.value.inputFingerprint)
    expect(stocked.value.calculationFingerprint).not.toBe(empty.value.calculationFingerprint)
    expect(stocked.value.plan.totalEstimatedCostVnd).toBeLessThan(
      empty.value.plan.totalEstimatedCostVnd
    )

    const persisted = vi.mocked(stocked.repo.persistRevision).mock.calls[0]?.[0]
    expect(canonicalJson(persisted?.inputSnapshot)).toContain('"pantrySnapshot"')
    expect(canonicalJson(persisted?.calculationSnapshot)).toContain('"pantrySnapshot"')
    expect(persisted?.calculationSnapshot.purchaseBasket.lines).toEqual(
      stocked.value.plan.purchaseBasket.lines
    )
  })
})
