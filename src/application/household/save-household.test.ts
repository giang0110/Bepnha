import { describe, expect, it, vi } from "vitest"

import type { HouseholdSetupInput } from "@/domain/household/household"

import type { HouseholdRepository } from "./household-repository"
import { saveHousehold } from "./save-household"

const unorderedInput: HouseholdSetupInput = {
  memberGroups: [
    { memberKind: "elderly", ageBand: "elderly", memberCount: 1 },
    { memberKind: "adult", ageBand: "adult", memberCount: 2 }
  ],
  weeklyPlanBudgetVnd: 1_500_000,
  maxElapsedMinutes: 30,
  ruleCodes: ["prefer_soup", "exclude_beef", "exclude_beef"]
}

describe("saveHousehold", () => {
  it.each([null, 4])(
    "validates and sends canonical input for expected version %s",
    async (version) => {
      const saved = {
        ...unorderedInput,
        householdId: "household-a",
        version: version ?? 1,
        onboardingCompletedAt: "2026-08-26T00:00:00Z"
      }
      const saveOwn = vi.fn(() => Promise.resolve({ ok: true as const, household: saved }))
      const repository = { loadOwn: vi.fn(), saveOwn } satisfies HouseholdRepository

      await expect(saveHousehold(repository, unorderedInput, version)).resolves.toEqual({
        ok: true,
        household: saved
      })
      expect(saveOwn).toHaveBeenCalledWith(
        {
          memberGroups: [
            { memberKind: "adult", ageBand: "adult", memberCount: 2 },
            { memberKind: "elderly", ageBand: "elderly", memberCount: 1 }
          ],
          weeklyPlanBudgetVnd: 1_500_000,
          maxElapsedMinutes: 30,
          ruleCodes: ["exclude_beef", "prefer_soup"]
        },
        version
      )
    }
  )

  it("returns validation errors before repository I/O", async () => {
    const saveOwn = vi.fn()
    const repository = { loadOwn: vi.fn(), saveOwn } as unknown as HouseholdRepository

    const result = await saveHousehold(repository, { ...unorderedInput, memberGroups: [] }, null)

    expect(result).toEqual({
      ok: false,
      reason: "VALIDATION_FAILED",
      errors: [{ code: "INVALID_MEMBER_TOTAL", path: "memberGroups" }]
    })
    expect(saveOwn).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5])("rejects invalid optimistic version %s before I/O", async (version) => {
    const saveOwn = vi.fn()
    const repository = { loadOwn: vi.fn(), saveOwn } as unknown as HouseholdRepository

    await expect(saveHousehold(repository, unorderedInput, version)).resolves.toEqual({
      ok: false,
      reason: "INVALID_EXPECTED_VERSION"
    })
    expect(saveOwn).not.toHaveBeenCalled()
  })

  it.each(["STALE_HOUSEHOLD_VERSION", "UNAUTHORIZED", "DEPENDENCY_UNAVAILABLE"] as const)(
    "preserves safe tagged repository result %s",
    async (reason) => {
      const repository = {
        loadOwn: vi.fn(),
        saveOwn: vi.fn(() => Promise.resolve({ ok: false as const, reason }))
      } as unknown as HouseholdRepository

      await expect(saveHousehold(repository, unorderedInput, 2)).resolves.toEqual({
        ok: false,
        reason
      })
    }
  )
})
