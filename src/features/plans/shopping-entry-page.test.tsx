import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import { AuthContext } from "@/app/auth/auth-context"
import type { HouseholdSetup } from "@/domain/household/household"

import type { PlannerApi } from "./planner-api"
import { ShoppingEntryPage } from "./shopping-entry-page"

const household: HouseholdSetup = {
  householdId: "20000000-0000-0000-0000-000000000001",
  memberGroups: [{ memberKind: "adult", ageBand: "adult", memberCount: 2 }],
  weeklyPlanBudgetVnd: 700_000,
  maxElapsedMinutes: 30,
  ruleCodes: [],
  version: 1,
  onboardingCompletedAt: "2026-08-26T00:00:00Z"
}

function setup(currentImpl: PlannerApi["current"]) {
  const api = {
    generate: vi.fn(),
    current: currentImpl,
    preview: vi.fn(),
    apply: vi.fn()
  } as unknown as PlannerApi
  const repository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }

  render(
    <MemoryRouter initialEntries={["/shopping"]}>
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
        <Routes>
          <Route
            path="/shopping"
            element={
              <ShoppingEntryPage
                householdRepository={repository}
                plannerApi={api}
                today={() => new Date("2026-08-27T12:00:00+07:00")}
              />
            }
          />
          <Route path="/shopping/:planId" element={<p>Danh sách đi chợ</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  )
  return api
}

describe("ShoppingEntryPage", () => {
  test("hands over to the list of the week the household is living in", async () => {
    const current = vi.fn().mockResolvedValue({ ok: true, value: { planId: "plan-a" } })
    setup(current as never)

    expect(await screen.findByText("Danh sách đi chợ")).toBeInTheDocument()
    // Thursday 27 August belongs to the week starting Monday the 24th, not the 31st.
    expect(current).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-24"
    })
  })

  test("says there is nothing to shop for yet rather than showing an empty list", async () => {
    setup(vi.fn().mockResolvedValue({ ok: true, value: null }) as never)

    // Both the loading line and this one are role=status, so match the words rather than the role.
    expect(await screen.findByText(/chưa có kế hoạch/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Lập kế hoạch tuần" })).toHaveAttribute("href", "/plan")
  })

  test("offers a retry that re-reads when the lookup fails", async () => {
    const user = userEvent.setup()
    const current = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "PLANNER_UNAVAILABLE" })
      .mockResolvedValue({ ok: true, value: { planId: "plan-a" } })
    setup(current as never)

    await user.click(await screen.findByRole("button", { name: "Thử lại" }))

    expect(await screen.findByText("Danh sách đi chợ")).toBeInTheDocument()
    expect(current).toHaveBeenCalledTimes(2)
  })
})
