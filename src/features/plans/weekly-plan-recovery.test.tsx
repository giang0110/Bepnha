import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, test, vi } from "vitest"

import type { HouseholdRepository } from "@/application/household/household-repository"
import { AuthContext } from "@/app/auth/auth-context"
import type { HouseholdSetup } from "@/domain/household/household"

import type { PlanItemView, PlannerApi, PlannerReadyResponse } from "./planner-api"
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

const meal: PlanItemView = {
  dayIndex: 0,
  mealSlot: "primary",
  mealOptionId: "meal-original",
  mealOptionVersionId: "meal-original-v1",
  adultEquivalent: "2",
  scaleFactor: "1",
  mealOptionCode: "meal_original",
  mealOptionNameVi: "Bữa gốc",
  elapsedMinutes: 25,
  components: [
    {
      mealRole: "main",
      sortOrder: 1,
      recipe: {
        recipeId: "recipe-original",
        recipeVersionId: "recipe-original-v1",
        ingredients: [],
        steps: [
          {
            order: 1,
            instructionVi: "Nấu bữa gốc.",
            timerMinutes: 10,
            heatLevel: null,
            temperatureCelsius: null,
            ingredientIds: []
          }
        ]
      }
    }
  ],
  scaledIngredients: [
    {
      sourceId: "source-original",
      foodId: "food-original",
      foodFactVersionId: "food-fact-original-v1",
      baseUnitId: "unit-g",
      baseQuantity: "400",
      grossGrams: "400"
    }
  ],
  nutrition: {
    nutrients: [{ nutrientCode: "energy_kcal", displayAmount: "500", unitCode: "kcal" }]
  }
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

function renderPage(apiOverrides: Partial<PlannerApi>, createId: () => string) {
  const repository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }
  const api: PlannerApi = {
    generate: vi.fn().mockResolvedValue({ ok: true, value: ready }),
    current: vi.fn().mockResolvedValue({ ok: true, value: null }),
    preview: vi.fn(),
    apply: vi.fn(),
    ...apiOverrides
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
          today={() => new Date("2026-08-27T00:00:00+07:00")}
          createId={createId}
        />
      </AuthContext.Provider>
    </MemoryRouter>
  )
  return api
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

    renderPage({ generate }, createId)

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

  test.each(["AUTH_UNAVAILABLE", "TRANSIENT_DEPENDENCY_FAILURE"] as const)(
    "does not automatically retry %s generation failures",
    async (error) => {
      const user = userEvent.setup()
      const generate = vi.fn().mockResolvedValue({
        ok: false,
        error,
        correlationId: `support.${error.toLowerCase()}`
      })
      const createId = vi.fn().mockReturnValue("30000000-0000-0000-0000-000000000003")

      renderPage({ generate }, createId)
      await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))

      const alert = await screen.findByRole("alert")
      expect(alert).toHaveTextContent(/không thể xử lý kế hoạch/i)
      expect(alert).toHaveTextContent(/mã hỗ trợ:/i)
      expect(generate).toHaveBeenCalledTimes(1)
      expect(createId).toHaveBeenCalledTimes(1)
    }
  )

  test("keeps the ready plan after replacement failure and re-previews only after another click", async () => {
    const user = userEvent.setup()
    const replacement = {
      ...meal,
      mealOptionId: "meal-replacement",
      mealOptionNameVi: "Bữa thay thế"
    }
    const preview = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: "TRANSIENT_DEPENDENCY_FAILURE",
        correlationId: "preview.req-1"
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          status: "ready_within_budget",
          items: [replacement],
          weeklyEstimatedCostVnd: 120_000,
          costDeltaVnd: 5_000,
          warnings: [],
          previewFingerprint: "d".repeat(64)
        }
      })
    const generate = vi.fn().mockResolvedValue({
      ok: true,
      value: { ...ready, plan: { items: [meal], totalEstimatedCostVnd: 115_000 } }
    })

    renderPage({ generate, preview }, () => "30000000-0000-0000-0000-000000000004")
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    expect(await screen.findByText("Bữa gốc")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Đổi bữa" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/mã hỗ trợ:\s*preview\.req-1/i)
    expect(screen.getByText("Bữa gốc")).toBeInTheDocument()
    expect(preview).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Đổi bữa" }))
    expect(await screen.findByText("Bữa thay thế")).toBeInTheDocument()
    expect(preview).toHaveBeenCalledTimes(2)
    expect(preview).toHaveBeenNthCalledWith(1, "token", {
      planId: ready.planId,
      targetDayIndex: 0,
      expectedPlanVersion: ready.planVersion
    })
    expect(preview).toHaveBeenNthCalledWith(2, "token", {
      planId: ready.planId,
      targetDayIndex: 0,
      expectedPlanVersion: ready.planVersion
    })
  })
})

describe("WeeklyPlanPage and a failed read of the week", () => {
  test("offers a retry that re-reads, not the one button persistence would refuse", async () => {
    const user = userEvent.setup()
    const current = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "PLANNER_UNAVAILABLE" })
      .mockResolvedValue({ ok: true, value: ready })
    const generate = vi.fn()
    renderPage({ current, generate }, () => "id-1")

    await screen.findByRole("alert")
    // The old behaviour left "Tạo kế hoạch tuần" as the only thing on offer after a failed read,
    // and persistence refuses a second plan for a week that already has one. The button could not
    // do what the message asked for, so a transient read error stranded the household.
    expect(screen.queryByRole("button", { name: /Tạo kế hoạch/u })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Thử lại" }))

    // The fixture's plan is empty, so the proof that the read succeeded is the shopping link, which
    // only the ready state renders.
    expect(await screen.findByRole("link", { name: "Đi chợ" })).toBeInTheDocument()
    expect(current).toHaveBeenCalledTimes(2)
    expect(generate).not.toHaveBeenCalled()
  })

  test("still offers generation when it was generation that failed", async () => {
    const user = userEvent.setup()
    const generate = vi.fn().mockResolvedValue({ ok: false, error: "HARD_FILTER_EXHAUSTED" })
    renderPage({ generate }, () => "id-1")

    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))

    await screen.findByRole("alert")
    expect(screen.getByRole("button", { name: /Tạo kế hoạch/u })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument()
  })
})
