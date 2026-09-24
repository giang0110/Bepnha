import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import { AuthContext } from "@/app/auth/auth-context"
import type { HouseholdSetup } from "@/domain/household/household"

import type { PlannerApi, PlannerReadyResponse } from "./planner-api"
import { WeeklyPlanPage } from "./weekly-plan-page"

const household: HouseholdSetup = {
  householdId: "20000000-0000-0000-0000-000000000001",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 700_000,
  maxElapsedMinutes: 30,
  ruleCodes: [],
  version: 1,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

const plan: PlannerReadyResponse = {
  planId: "40000000-0000-0000-0000-000000000001",
  revisionId: "50000000-0000-0000-0000-000000000001",
  planVersion: 1,
  idempotent: false,
  status: "ready_within_budget",
  budgetVnd: 700_000,
  plan: { items: [], totalEstimatedCostVnd: 650_000 },
  warnings: []
}

/** The household planned the week of Monday 21 September and is cooking from it all week. */
function renderOn(day: string) {
  const current = vi.fn((_token: string, input: { readonly weekStart: string }) =>
    Promise.resolve(
      input.weekStart === "2026-09-21" ? { ok: true, value: plan } : { ok: true, value: null }
    )
  )
  const api = {
    generate: vi.fn(),
    current,
    preview: vi.fn(),
    apply: vi.fn()
  } as unknown as PlannerApi
  const repository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }

  render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          passwordRecoveryReady: false,
          status: "authenticated",
          session: { accessToken: "token", identity: { userId: "user", email: null } },
          signIn: vi.fn(),
          signOut: vi.fn(),
          signUp: vi.fn(),
          requestPasswordReset: vi.fn(),
          updatePassword: vi.fn()
        }}
      >
        <WeeklyPlanPage
          foodOptionsRepository={{ load: vi.fn().mockResolvedValue([]) }}
          householdRepository={repository}
          plannerApi={api}
          today={() => new Date(`${day}T12:00:00+07:00`)}
          createId={() => "id"}
        />
      </AuthContext.Provider>
    </MemoryRouter>
  )
  return current
}

describe("the week the plan page is about", () => {
  test("Monday reaches the plan the household is cooking from", async () => {
    const current = renderOn("2026-09-21")

    expect(await screen.findByRole("link", { name: "Đi chợ cho kế hoạch này" })).toBeInTheDocument()
    expect(current).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ weekStart: "2026-09-21" })
    )
  })

  test.each(["2026-09-22", "2026-09-24", "2026-09-27"])(
    "%s reaches it too, rather than offering to plan a week that has not started",
    async (day) => {
      // The household planned Monday's week and cooks from it until Sunday. Asking only for the
      // Monday ahead meant that from Tuesday onward the page showed an empty week and invited them
      // to create one, while the plan they were actually using was unreachable.
      const current = renderOn(day)

      expect(
        await screen.findByRole("link", { name: "Đi chợ cho kế hoạch này" })
      ).toBeInTheDocument()
      expect(current).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ weekStart: "2026-09-21" })
      )
    }
  )
})
