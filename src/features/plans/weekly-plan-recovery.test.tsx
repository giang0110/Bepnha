import { act, render, screen } from "@testing-library/react"
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

function renderPage(
  apiOverrides: Partial<PlannerApi>,
  createId: () => string,
  repository: HouseholdRepository = {
    loadOwn: vi.fn().mockResolvedValue(household),
    saveOwn: vi.fn()
  }
) {
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
  test("warns when a saved week uses an older household setup without changing its quantities", async () => {
    renderPage(
      {
        current: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            ...ready,
            engineVersion: "planner-engine-v6",
            householdSetupVersion: 1,
            plan: { ...ready.plan, items: [meal] }
          }
        })
      },
      () => "key",
      { loadOwn: vi.fn().mockResolvedValue({ ...household, version: 2 }), saveOwn: vi.fn() }
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(/thiết lập gia đình đã thay đổi/i)
    expect(screen.getByText("Bữa gốc")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tạo lại kế hoạch tuần" })).toBeEnabled()
  })

  test("warns that a legacy week has not applied the saved personal nutrition setup", async () => {
    renderPage({ current: vi.fn().mockResolvedValue({ ok: true, value: ready }) }, () => "key", {
      loadOwn: vi.fn().mockResolvedValue({
        ...household,
        nutritionSetup: {
          version: "household-nutrition-v1",
          plannedMealSharePercent: 33,
          memberProfiles: [1, 2].map((sortOrder) => ({
            id: `member-${sortOrder}`,
            memberKind: "adult",
            sortOrder,
            label: null,
            heightCm: null,
            weightKg: null,
            ageYears: null,
            sexForEquation: null,
            activityLevel: null,
            goal: "maintain"
          }))
        }
      }),
      saveOwn: vi.fn()
    })
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /chưa áp dụng khẩu phần theo hồ sơ thành viên/i
    )
  })

  test("does not warn about a v6 week made with the current household setup", async () => {
    renderPage(
      {
        current: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            ...ready,
            engineVersion: "planner-engine-v6",
            householdSetupVersion: household.version
          }
        })
      },
      () => "key"
    )
    await screen.findByRole("button", { name: "Tạo lại kế hoạch tuần" })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  test("keeps the saved week and regeneration intent after a failed regeneration", async () => {
    const user = userEvent.setup()
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "TRANSIENT_DEPENDENCY_FAILURE" })
      .mockResolvedValueOnce({
        ok: true,
        value: { ...ready, revisionId: "new-revision", planVersion: 2 }
      })
    const createId = vi.fn().mockReturnValueOnce("retry-1").mockReturnValueOnce("retry-2")
    renderPage(
      {
        current: vi.fn().mockResolvedValue({
          ok: true,
          value: { ...ready, plan: { ...ready.plan, items: [meal] } }
        }),
        generate
      },
      createId
    )
    await user.click(await screen.findByRole("button", { name: "Tạo lại kế hoạch tuần" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể xử lý kế hoạch/i)
    expect(screen.getByText("Bữa gốc")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Tạo lại kế hoạch tuần" }))
    expect(generate).toHaveBeenNthCalledWith(
      2,
      "token",
      expect.objectContaining({
        expectedPlanVersion: ready.planVersion,
        expectedCurrentRevisionId: ready.revisionId,
        idempotencyKey: "retry-2"
      })
    )
    expect(await screen.findByRole("button", { name: "Tạo lại kế hoạch tuần" })).toBeEnabled()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  test("explains missing catalog lineage instead of offering an unexplained retry loop", async () => {
    const user = userEvent.setup()
    renderPage(
      { generate: vi.fn().mockResolvedValue({ ok: false, error: "INCOMPLETE_CATALOG_LINEAGE" }) },
      () => "key"
    )
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /danh mục thực phẩm.*quy đổi.*khẩu phần/i
    )
  })

  test("clears a failed regeneration notice after a successful meal replacement", async () => {
    const user = userEvent.setup()
    const replacement = { ...meal, mealOptionNameVi: "Bữa mới" }
    renderPage(
      {
        current: vi.fn().mockResolvedValue({
          ok: true,
          value: { ...ready, plan: { ...ready.plan, items: [meal] } }
        }),
        generate: vi.fn().mockResolvedValue({ ok: false, error: "TRANSIENT_DEPENDENCY_FAILURE" }),
        preview: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            status: "ready_within_budget",
            items: [replacement],
            weeklyEstimatedCostVnd: 0,
            costDeltaVnd: 0,
            warnings: [],
            previewFingerprint: "hash"
          }
        }),
        apply: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            ...ready,
            planVersion: 2,
            revisionId: "new-revision",
            plan: { ...ready.plan, items: [replacement] }
          }
        })
      },
      () => "key"
    )
    await user.click(await screen.findByRole("button", { name: "Tạo lại kế hoạch tuần" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể xử lý kế hoạch/i)
    await user.click(screen.getByRole("button", { name: "Đổi bữa" }))
    await user.click(await screen.findByRole("button", { name: "Áp dụng bữa thay thế" }))
    expect(await screen.findByText("Bữa mới")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  test("keeps the selected week while generation is in flight", async () => {
    const user = userEvent.setup()
    let finish!: (value: { ok: true; value: PlannerReadyResponse }) => void
    const pending = new Promise<{ ok: true; value: PlannerReadyResponse }>((resolve) => {
      finish = resolve
    })
    renderPage({ generate: () => pending }, () => "key")
    await user.click(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" }))
    expect(screen.getByRole("button", { name: /Tuần sau/ })).toBeDisabled()
    await act(async () => {
      finish({ ok: true, value: ready })
      await pending
    })
    expect(screen.getByRole("button", { name: /Tuần sau/ })).toBeEnabled()
  })

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
  test("retries a failed household read before offering generation for an empty week", async () => {
    const user = userEvent.setup()
    const loadOwn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue(household)
    const current = vi.fn().mockResolvedValue({ ok: true, value: null })
    const generate = vi.fn()
    renderPage({ current, generate }, () => "id-1", { loadOwn, saveOwn: vi.fn() })

    await screen.findByRole("alert")
    expect(screen.queryByText(/mã hỗ trợ/iu)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Thử lại" }))

    expect(await screen.findByRole("button", { name: "Tạo kế hoạch 7 bữa chính" })).toBeEnabled()
    expect(
      screen.queryByRole("link", { name: "Hoàn tất thông tin gia đình" })
    ).not.toBeInTheDocument()
    expect(current).toHaveBeenCalledWith("token", {
      householdId: household.householdId,
      weekStart: "2026-08-24"
    })
    expect(generate).not.toHaveBeenCalled()
  })

  test("keeps a failed household retry recoverable without treating it as missing setup", async () => {
    const user = userEvent.setup()
    const loadOwn = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"))
      .mockResolvedValue(null)
    renderPage({}, () => "id-1", { loadOwn, saveOwn: vi.fn() })

    await screen.findByRole("alert")
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể xử lý kế hoạch/iu)
    expect(
      screen.queryByRole("link", { name: "Hoàn tất thông tin gia đình" })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(
      await screen.findByRole("link", { name: "Hoàn tất thông tin gia đình" })
    ).toHaveAttribute("href", "/onboarding")
  })

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
    expect(await screen.findByRole("link", { name: "Đi chợ cho kế hoạch này" })).toBeInTheDocument()
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
