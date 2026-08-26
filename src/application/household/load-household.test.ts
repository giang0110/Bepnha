import { describe, expect, it } from "vitest"

import { HouseholdRepositoryError, type HouseholdRepository } from "./household-repository"
import { loadHousehold } from "./load-household"

const household = {
  householdId: "household-a",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }] as const,
  weeklyPlanBudgetVnd: 1_500_000,
  maxElapsedMinutes: 30,
  ruleCodes: ["exclude_beef"],
  version: 3,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
} as const

function repositoryReturning(value: typeof household | null): HouseholdRepository {
  return {
    loadOwn: () => Promise.resolve(value),
    saveOwn: () => Promise.reject(new Error("unused"))
  }
}

describe("loadHousehold", () => {
  it("returns an authoritative household or no household", async () => {
    await expect(loadHousehold(repositoryReturning(household))).resolves.toEqual({
      ok: true,
      household
    })
    await expect(loadHousehold(repositoryReturning(null))).resolves.toEqual({
      ok: true,
      household: null
    })
  })

  it.each([
    ["UNAUTHORIZED", "UNAUTHORIZED"],
    ["DEPENDENCY_UNAVAILABLE", "RETRYABLE_FAILURE"],
    ["INVALID_STORED_DATA", "INVALID_STORED_DATA"]
  ] as const)(
    "maps repository %s without exposing raw errors",
    async (repositoryCode, resultCode) => {
      const repository = repositoryReturning(null)
      repository.loadOwn = () =>
        Promise.reject(
          new HouseholdRepositoryError(repositoryCode, "sensitive database response and token")
        )

      const result = await loadHousehold(repository)

      expect(result).toEqual({ ok: false, reason: resultCode })
      expect(JSON.stringify(result)).not.toMatch(/database|token|sensitive/i)
    }
  )
})
