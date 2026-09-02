import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

const ready: PlannerReadyResponse = {
  planId: "40000000-0000-0000-0000-000000000001",
  revisionId: "50000000-0000-0000-0000-000000000001",
  planVersion: 1,
  idempotent: false,
  status: "ready_within_budget",
  budgetVnd: 700_000,
  plan: { items: [], totalEstimatedCostVnd: 0 },
  warnings: []
}

function renderPage(generate: PlannerApi["generate"], createId: () => string) {
  const repository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }
  const api: PlannerApi = {
    generate,
    preview: vi.fn(),
    apply: vi.fn()
  }

  render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          status: "authenticated",
          session: { accessToken: "token", identity: { userId: "user", email: null } },
          signIn: vi.fn(),
          signOut: vi.fn(),
          signUp: vi.fn()
        }}
      >
        <WeeklyPlanPage
          householdRepository={repository}
          plannerApi={api}
          today={() => new Date("2026-08-27T00:00:00+07:00")}
          createId={createId}
        />
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

describe("WeeklyPlanPage recovery UX", () => {
  test("shows a safe support reference and retries only after a new click with a fresh idempotency key", async () => {
    const user = userEvent.setup()
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: "PLANNER_UNAVAILABLE",
        correlationId: "client.req-1"
      })
      .mockResolvedValueOnce({ ok: true, value: ready })
    const createId = vi
      .fn()
      .mockReturnValueOnce("30000000-0000-0000-0000-000000000001")
      .mockReturnValueOnce("30000000-0000-0000-0000-000000000002")

    renderPage(generate, createId)

    const button = await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" })
    await user.click(button)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/không thể xử lý kế hoạch/i)
    expect(alert).toHaveTextContent(/mã hỗ trợ:\s*client\.req-1/i)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(createId).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))

    expect(await screen.findByText("0 VND / 700.000 VND")).toBeInTheDocument()
    expect(generate).toHaveBeenCalledTimes(2)
    expect(createId).toHaveBeenCalledTimes(2)
    expect(generate).toHaveBeenNthCalledWith(
      1,
      "token",
      expect.objectContaining({ idempotencyKey: "30000000-0000-0000-0000-000000000001" })
    )
    expect(generate).toHaveBeenNthCalledWith(
      2,
      "token",
      expect.objectContaining({ idempotencyKey: "30000000-0000-0000-0000-000000000002" })
    )
  })
})
